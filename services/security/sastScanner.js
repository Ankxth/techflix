// sastScanner.js
// Basic Static Application Security Testing
// Scans source files for common vulnerability patterns:
//   - SQL injection
//   - XSS risks
//   - Insecure deserialization
//   - eval() / exec() misuse
//   - Hardcoded credentials (pattern-based, complements detect-secrets)

const fs = require("fs");
const path = require("path");
const { glob } = require("glob");

// ---------------------------------------------------------------------------
// Pattern definitions
// Each rule: { id, label, severity, pattern (RegExp), languages }
// ---------------------------------------------------------------------------
const SAST_RULES = [
  // --- SQL Injection ---
  {
    id: "SAST-001",
    label: "Potential SQL Injection (string concatenation in query)",
    severity: "critical",
    languages: ["js", "ts", "py"],
    pattern: /(?:query|execute|raw)\s*\(\s*[`"']\s*SELECT|INSERT|UPDATE|DELETE.*\+|\$\{/i,
    description:
      "User input appears to be concatenated directly into a SQL query. Use parameterised queries or an ORM.",
  },
  {
    id: "SAST-002",
    label: "Potential SQL Injection (f-string or % formatting in query)",
    severity: "critical",
    languages: ["py"],
    pattern: /(?:execute|cursor\.execute)\s*\(\s*f["']|%\s*\(/,
    description:
      "Python f-string or % formatting used in a database execute call. Use parameterised queries with ? or %s placeholders.",
  },

  // --- XSS ---
  {
    id: "SAST-003",
    label: "Potential XSS (dangerouslySetInnerHTML)",
    severity: "high",
    languages: ["js", "ts", "jsx", "tsx"],
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{/,
    description:
      "dangerouslySetInnerHTML detected. Ensure the content is properly sanitised before rendering.",
  },
  {
    id: "SAST-004",
    label: "Potential XSS (innerHTML assignment)",
    severity: "high",
    languages: ["js", "ts"],
    pattern: /\.innerHTML\s*=/,
    description:
      "Direct innerHTML assignment can lead to XSS if content comes from user input. Use textContent or DOMPurify.",
  },
  {
    id: "SAST-005",
    label: "Potential XSS (document.write)",
    severity: "high",
    languages: ["js", "ts"],
    pattern: /document\.write\s*\(/,
    description:
      "document.write can be exploited for XSS. Avoid using it with any dynamic content.",
  },

  // --- eval / exec misuse ---
  {
    id: "SAST-006",
    label: "Dangerous eval() usage",
    severity: "high",
    languages: ["js", "ts"],
    pattern: /\beval\s*\(/,
    description:
      "eval() executes arbitrary code. If user input reaches eval(), it leads to code injection.",
  },
  {
    id: "SAST-007",
    label: "Dangerous exec() / shell injection risk",
    severity: "high",
    languages: ["js", "ts"],
    pattern: /(?:exec|execSync|spawn|spawnSync)\s*\(\s*(?:`[^`]*\$\{|["'][^"']*"\s*\+)/,
    description:
      "User-controlled data may be passed to a shell command. Use execFile() or sanitise inputs.",
  },
  {
    id: "SAST-008",
    label: "Python eval() / exec() usage",
    severity: "high",
    languages: ["py"],
    pattern: /\b(?:eval|exec)\s*\(/,
    description:
      "eval/exec in Python can execute arbitrary code. Ensure input is never user-controlled.",
  },

  // --- Insecure Deserialization ---
  {
    id: "SAST-009",
    label: "Insecure deserialization (pickle)",
    severity: "critical",
    languages: ["py"],
    pattern: /pickle\.loads?\s*\(/,
    description:
      "pickle.load/loads can execute arbitrary code when deserialising untrusted data.",
  },
  {
    id: "SAST-010",
    label: "Insecure deserialization (node-serialize / serialize-javascript)",
    severity: "critical",
    languages: ["js", "ts"],
    pattern: /serialize\.unserialize\s*\(|deserialize\s*\(/,
    description:
      "Deserialising untrusted data with node-serialize can lead to remote code execution.",
  },

  // --- Insecure random ---
  {
    id: "SAST-011",
    label: "Weak random number generation for security-sensitive context",
    severity: "moderate",
    languages: ["js", "ts"],
    pattern: /Math\.random\s*\(\s*\)/,
    description:
      "Math.random() is not cryptographically secure. Use crypto.randomBytes() for tokens/sessions.",
  },

  // --- Hardcoded credentials (pattern-level, detect-secrets handles entropy) ---
  {
    id: "SAST-012",
    label: "Possible hardcoded password in variable assignment",
    severity: "high",
    languages: ["js", "ts", "py"],
    pattern: /(?:password|passwd|pwd|secret|api_key|apikey)\s*=\s*["'][^"']{6,}["']/i,
    description:
      "A variable name suggesting a credential is assigned a hardcoded string value.",
  },
];

// ---------------------------------------------------------------------------
// File extension → language mapping
// ---------------------------------------------------------------------------
const EXT_TO_LANG = {
  ".js": "js",
  ".mjs": "js",
  ".cjs": "js",
  ".ts": "ts",
  ".jsx": "jsx",
  ".tsx": "tsx",
  ".py": "py",
};

// Directories to skip
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".env",
  "coverage",
]);

/**
 * Recursively collect all scannable source files in a directory
 * @param {string} dir
 * @returns {string[]} absolute file paths
 */
function collectSourceFiles(dir) {
  const files = [];

  function walk(currentDir) {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (_) {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (EXT_TO_LANG[ext]) files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Scan a single file against all applicable SAST rules
 * @param {string} filePath
 * @param {string} projectPath - used to produce relative paths in output
 * @returns {Array<{ ruleId, label, severity, file, line, description }>}
 */
function scanFile(filePath, projectPath) {
  const ext = path.extname(filePath).toLowerCase();
  const lang = EXT_TO_LANG[ext];
  if (!lang) return [];

  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (_) {
    return [];
  }

  const lines = content.split("\n");
  const findings = [];

  for (const rule of SAST_RULES) {
    if (!rule.languages.includes(lang)) continue;

    for (let i = 0; i < lines.length; i++) {
      if (rule.pattern.test(lines[i])) {
        findings.push({
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          file: path.relative(projectPath, filePath),
          line: i + 1,
          snippet: lines[i].trim().slice(0, 120), // don't expose too much
          description: rule.description,
        });
        // Only report first match per rule per file to avoid noise
        break;
      }
    }
  }

  return findings;
}

/**
 * Run SAST scan on the entire project
 * @param {string} projectPath - absolute path to the project directory
 * @returns {{
 *   critical: [],
 *   high: [],
 *   moderate: [],
 *   low: [],
 *   totalFindings: number,
 *   filesScanned: number
 * }}
 */
function runSastScan(projectPath) {
  const result = {
    critical: [],
    high: [],
    moderate: [],
    low: [],
    totalFindings: 0,
    filesScanned: 0,
  };

  const files = collectSourceFiles(projectPath);
  result.filesScanned = files.length;

  for (const file of files) {
    const findings = scanFile(file, projectPath);
    for (const finding of findings) {
      if (finding.severity === "critical") result.critical.push(finding);
      else if (finding.severity === "high") result.high.push(finding);
      else if (finding.severity === "moderate") result.moderate.push(finding);
      else result.low.push(finding);
      result.totalFindings++;
    }
  }

  return result;
}

module.exports = { runSastScan };