// snykScanner.js
// Integrates Snyk via CLI (more reliable than SDK for arbitrary project paths)
// Requires: npm install -g snyk  AND  snyk auth <token>
// SNYK_TOKEN must be set in environment variables

const { exec } = require("child_process");
const util = require("util");

const execAsync = util.promisify(exec);

/**
 * Map Snyk severity strings to our internal severity levels
 */
function normalizeSeverity(snykSeverity) {
  const map = {
    critical: "critical",
    high: "high",
    medium: "moderate",
    low: "low",
  };
  return map[snykSeverity?.toLowerCase()] || "low";
}

/**
 * Run snyk test on the project directory
 * Returns structured vulnerability list
 * @param {string} projectPath - absolute path to the cloned project
 * @returns {Promise<{
 *   critical: [],
 *   high: [],
 *   moderate: [],
 *   low: [],
 *   snykProjectUrl: string|null,
 *   error: string|null
 * }>}
 */
async function runSnykScan(projectPath) {
  const result = {
    critical: [],
    high: [],
    moderate: [],
    low: [],
    snykProjectUrl: null,
    error: null,
  };

  // Check for SNYK_TOKEN
  if (!process.env.SNYK_TOKEN) {
    result.error = "SNYK_TOKEN environment variable not set";
    return result;
  }

  try {
    // --json: machine-readable output
    // --severity-threshold=low: capture everything
    // --skip-unresolved: don't fail on unresolvable deps
    const { stdout } = await execAsync(
      `snyk test --json --severity-threshold=low --skip-unresolved`,
      {
        cwd: projectPath,
        timeout: 120000,
        env: { ...process.env }, // pass SNYK_TOKEN through
      }
    );

    const snykOutput = JSON.parse(stdout);
    parseSnykOutput(snykOutput, result);
  } catch (err) {
    // snyk exits with code 1 when vulnerabilities are found — stdout still has JSON
    if (err.stdout) {
      try {
        const snykOutput = JSON.parse(err.stdout);
        parseSnykOutput(snykOutput, result);
      } catch (_) {
        result.error = "Failed to parse Snyk output";
      }
    } else if (err.code === 127 || (err.message && err.message.includes("not found"))) {
      result.error = "Snyk CLI not installed. Run: npm install -g snyk";
    } else {
      result.error = err.message || "Snyk scan failed";
    }
  }

  return result;
}

/**
 * Parse raw snyk JSON output into our result structure
 */
function parseSnykOutput(snykOutput, result) {
  if (!snykOutput || !snykOutput.vulnerabilities) return;

  // Deduplicate by vuln ID (Snyk can report the same vuln multiple times via different paths)
  const seen = new Set();

  for (const vuln of snykOutput.vulnerabilities) {
    const dedupKey = `${vuln.id}:${vuln.packageName}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const severity = normalizeSeverity(vuln.severity);
    const entry = {
      id: vuln.id,
      package: vuln.packageName,
      version: vuln.version,
      severity,
      title: vuln.title,
      description: vuln.description || "",
      cvssScore: vuln.cvssScore || null,
      cve: vuln.identifiers?.CVE?.[0] || null,
      cwe: vuln.identifiers?.CWE?.[0] || null,
      fixedIn: vuln.fixedIn || [],
      isUpgradable: vuln.isUpgradable || false,
      isPatchable: vuln.isPatchable || false,
      references: vuln.references?.slice(0, 3).map((r) => r.url) || [],
    };

    if (severity === "critical") result.critical.push(entry);
    else if (severity === "high") result.high.push(entry);
    else if (severity === "moderate") result.moderate.push(entry);
    else result.low.push(entry);
  }

  // Snyk sometimes includes project URL in output
  if (snykOutput.projectUrl) {
    result.snykProjectUrl = snykOutput.projectUrl;
  }
}

module.exports = { runSnykScan };