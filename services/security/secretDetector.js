// secretDetector.js
// Wraps the detect-secrets Python CLI to scan for hardcoded secrets
// Install: pip install detect-secrets
// Usage: detect-secrets scan <path> --all-files

const { exec } = require("child_process");
const util = require("util");
const path = require("path");

const execAsync = util.promisify(exec);

// Secret type labels from detect-secrets — map to human-readable names
const SECRET_TYPE_LABELS = {
  "AWS Access Key": "AWS Access Key",
  "Base64 High Entropy String": "High-Entropy Base64 String (possible secret)",
  "Basic Auth Credentials": "Basic Auth Credentials in URL",
  "Hex High Entropy String": "High-Entropy Hex String (possible secret)",
  "Private Key": "Private Key (RSA/EC/etc.)",
  "Slack Token": "Slack API Token",
  "Stripe Access Key": "Stripe API Key",
  "SendGrid Access Key": "SendGrid API Key",
  "GitHub Token": "GitHub Personal Access Token",
  "Generic API Key": "Generic API Key",
  "JWT Token": "JWT Token",
  "Secret Keyword": "Secret Keyword (password/token/secret in variable name)",
  "Twilio API Key": "Twilio API Key",
  "Artifactory Credentials": "Artifactory Credentials",
  "DB Connection String": "Database Connection String with credentials",
};

/**
 * Severity of each secret type — critical means immediate risk if exposed
 */
function getSecretSeverity(type) {
  const criticalTypes = [
    "AWS Access Key",
    "Private Key",
    "Stripe Access Key",
    "GitHub Token",
    "Twilio API Key",
    "DB Connection String",
  ];
  return criticalTypes.includes(type) ? "critical" : "high";
}

/**
 * Run detect-secrets scan on the project directory
 * @param {string} projectPath - absolute path to the project
 * @returns {Promise<{
 *   secretsFound: boolean,
 *   secrets: Array<{ file, line, type, label, severity }>,
 *   error: string|null
 * }>}
 */
async function runSecretDetection(projectPath) {
  const result = {
    secretsFound: false,
    secrets: [],
    error: null,
  };

  try {
    // detect-secrets scan returns JSON regardless of findings
    // --all-files: don't skip binary files
    // --no-verify: skip network verification (faster, offline)
    const { stdout } = await execAsync(
      `detect-secrets scan --all-files --no-verify "${projectPath}"`,
      { timeout: 60000 }
    );

    const scanResult = JSON.parse(stdout);

    // scanResult.results is an object: { "filepath": [{ type, line_number, ... }] }
    if (scanResult.results) {
      for (const [filePath, findings] of Object.entries(scanResult.results)) {
        for (const finding of findings) {
          const relativeFile = path.relative(projectPath, filePath) || filePath;
          const label = SECRET_TYPE_LABELS[finding.type] || finding.type;
          const severity = getSecretSeverity(finding.type);

          result.secrets.push({
            file: relativeFile,
            line: finding.line_number,
            type: finding.type,
            label,
            severity,
          });
        }
      }
    }

    result.secretsFound = result.secrets.length > 0;
  } catch (err) {
    // detect-secrets not installed or failed
    if (err.code === 127 || (err.message && err.message.includes("not found"))) {
      result.error =
        "detect-secrets not installed. Run: pip install detect-secrets";
    } else {
      result.error = err.message || "detect-secrets scan failed";
    }
  }

  return result;
}

module.exports = { runSecretDetection };