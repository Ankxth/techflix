// depAudit.js
// Runs npm audit (JS projects) or pip-audit (Python projects)
// Auto-detects project type from the project directory

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");

const execAsync = util.promisify(exec);

/**
 * Detect whether project is JS, Python, or both
 * @param {string} projectPath - absolute path to the cloned project
 * @returns {{ isJs: boolean, isPython: boolean }}
 */
function detectProjectType(projectPath) {
  const hasPackageJson = fs.existsSync(path.join(projectPath, "package.json"));
  const hasRequirementsTxt = fs.existsSync(
    path.join(projectPath, "requirements.txt")
  );
  const hasPipfile = fs.existsSync(path.join(projectPath, "Pipfile"));
  const hasPyprojectToml = fs.existsSync(
    path.join(projectPath, "pyproject.toml")
  );

  return {
    isJs: hasPackageJson,
    isPython: hasRequirementsTxt || hasPipfile || hasPyprojectToml,
  };
}

/**
 * Run npm audit in the project directory
 * Returns parsed vulnerabilities grouped by severity
 * @param {string} projectPath
 * @returns {Promise<{ critical: [], high: [], moderate: [], low: [], error: string|null }>}
 */
async function runNpmAudit(projectPath) {
  const result = {
    critical: [],
    high: [],
    moderate: [],
    low: [],
    error: null,
  };

  try {
    // --json gives us machine-readable output
    // --audit-level=none ensures it doesn't exit with non-zero on found vulns
    const { stdout } = await execAsync("npm audit --json --audit-level=none", {
      cwd: projectPath,
      timeout: 60000, // 60s max
    });

    const audit = JSON.parse(stdout);

    // npm audit v2+ format (npm >= 7)
    if (audit.vulnerabilities) {
      for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities)) {
        const entry = {
          package: pkgName,
          severity: vuln.severity,
          via: vuln.via
            .filter((v) => typeof v === "object")
            .map((v) => v.title || v.url || ""),
          fixAvailable: vuln.fixAvailable,
          range: vuln.range,
        };

        if (vuln.severity === "critical") result.critical.push(entry);
        else if (vuln.severity === "high") result.high.push(entry);
        else if (vuln.severity === "moderate") result.moderate.push(entry);
        else result.low.push(entry);
      }
    }
  } catch (err) {
    // npm audit exits non-zero if vulnerabilities found on older npm versions
    // Try to parse stdout anyway
    if (err.stdout) {
      try {
        const audit = JSON.parse(err.stdout);
        // Same parsing logic for older npm format
        if (audit.advisories) {
          for (const advisory of Object.values(audit.advisories)) {
            const entry = {
              package: advisory.module_name,
              severity: advisory.severity,
              title: advisory.title,
              url: advisory.url,
              fixAvailable: !!advisory.patched_versions,
              range: advisory.vulnerable_versions,
            };
            if (advisory.severity === "critical") result.critical.push(entry);
            else if (advisory.severity === "high") result.high.push(entry);
            else if (advisory.severity === "moderate")
              result.moderate.push(entry);
            else result.low.push(entry);
          }
        }
      } catch (_) {
        result.error = "Failed to parse npm audit output";
      }
    } else {
      result.error = err.message;
    }
  }

  return result;
}

/**
 * Run pip-audit in the project directory
 * pip-audit must be installed: pip install pip-audit
 * @param {string} projectPath
 * @returns {Promise<{ critical: [], high: [], moderate: [], low: [], error: string|null }>}
 */
async function runPipAudit(projectPath) {
  const result = {
    critical: [],
    high: [],
    moderate: [],
    low: [],
    error: null,
  };

  try {
    const { stdout } = await execAsync("pip-audit --format json -r requirements.txt", {
      cwd: projectPath,
      timeout: 120000, // pip-audit can be slow
    });

    const auditResults = JSON.parse(stdout);

    // pip-audit JSON: array of { name, version, vulns: [{ id, fix_versions, aliases, description }] }
    for (const pkg of auditResults) {
      for (const vuln of pkg.vulns) {
        // pip-audit doesn't give CVSS severity directly — infer from aliases
        // GHSA IDs can be looked up, but for Phase 1 we label all as "high" unless we can tell
        const severity = inferPythonSeverity(vuln);

        const entry = {
          package: pkg.name,
          version: pkg.version,
          vulnId: vuln.id,
          severity,
          description: vuln.description || "",
          fixVersions: vuln.fix_versions || [],
          aliases: vuln.aliases || [],
        };

        if (severity === "critical") result.critical.push(entry);
        else if (severity === "high") result.high.push(entry);
        else if (severity === "moderate") result.moderate.push(entry);
        else result.low.push(entry);
      }
    }
  } catch (err) {
    if (err.stdout) {
      // pip-audit may exit non-zero when vulns found but still output JSON
      try {
        const auditResults = JSON.parse(err.stdout);
        for (const pkg of auditResults) {
          for (const vuln of pkg.vulns) {
            const severity = inferPythonSeverity(vuln);
            const entry = {
              package: pkg.name,
              version: pkg.version,
              vulnId: vuln.id,
              severity,
              description: vuln.description || "",
              fixVersions: vuln.fix_versions || [],
            };
            if (severity === "critical") result.critical.push(entry);
            else if (severity === "high") result.high.push(entry);
            else if (severity === "moderate") result.moderate.push(entry);
            else result.low.push(entry);
          }
        }
      } catch (_) {
        result.error = "Failed to parse pip-audit output";
      }
    } else {
      result.error = err.message;
    }
  }

  return result;
}

/**
 * Heuristic: infer severity from vuln ID prefix
 * PYSEC = Python Security Advisory (usually high/critical)
 * GHSA  = GitHub Advisory (varies)
 * For Phase 1, label PYSEC as high, others as moderate
 */
function inferPythonSeverity(vuln) {
  const id = (vuln.id || "").toUpperCase();
  if (id.startsWith("PYSEC")) return "high";
  // Check aliases for CVE CVSS hint (not available directly, placeholder)
  return "moderate";
}

/**
 * Main entry: run appropriate audits based on project type
 * @param {string} projectPath - absolute path to cloned project
 * @returns {Promise<{
 *   projectType: string,
 *   npm: object|null,
 *   pip: object|null,
 *   combinedCritical: [],
 *   combinedHigh: [],
 *   error: string|null
 * }>}
 */
async function runDependencyAudit(projectPath) {
  const { isJs, isPython } = detectProjectType(projectPath);

  const output = {
    projectType: isJs && isPython ? "both" : isJs ? "js" : isPython ? "python" : "unknown",
    npm: null,
    pip: null,
    combinedCritical: [],
    combinedHigh: [],
    error: null,
  };

  if (output.projectType === "unknown") {
    output.error = "Could not detect project type (no package.json or requirements.txt found)";
    return output;
  }

  const [npmResult, pipResult] = await Promise.all([
    isJs ? runNpmAudit(projectPath) : Promise.resolve(null),
    isPython ? runPipAudit(projectPath) : Promise.resolve(null),
  ]);

  output.npm = npmResult;
  output.pip = pipResult;

  // Merge critical + high across both for easy access by the scoring layer
  if (npmResult) {
    output.combinedCritical.push(...npmResult.critical);
    output.combinedHigh.push(...npmResult.high);
  }
  if (pipResult) {
    output.combinedCritical.push(...pipResult.critical);
    output.combinedHigh.push(...pipResult.high);
  }

  return output;
}

module.exports = { runDependencyAudit, detectProjectType };