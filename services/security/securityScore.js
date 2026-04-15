// securityScore.js
// Takes raw results from all scanners and computes:
//   - security_score (0-100)
//   - critical_issues array
//   - high_issues array
//   - secrets_found boolean
//   - dependency_vulns array
// This is the shape that goes into the security_results DB table

/**
 * Penalty weights per severity level
 * Tuned so that 1 critical issue alone drops score to ~50
 */
const PENALTIES = {
  critical: 25,
  high: 10,
  moderate: 4,
  low: 1,
};

// Max penalty cap per category (so 20 low issues don't tank the score unfairly)
const MAX_PENALTY = {
  critical: 100,
  high: 40,
  moderate: 20,
  low: 10,
};

/**
 * Compute the final security score and structured output
 *
 * @param {{
 *   snyk: { critical:[], high:[], moderate:[], low:[], error:string|null },
 *   dep:  { combinedCritical:[], combinedHigh:[], npm:object, pip:object, error:string|null },
 *   sast: { critical:[], high:[], moderate:[], low:[] },
 *   secrets: { secretsFound:boolean, secrets:[], error:string|null }
 * }} scanResults
 *
 * @returns {{
 *   security_score: number,
 *   critical_issues: [],
 *   high_issues: [],
 *   secrets_found: boolean,
 *   dependency_vulns: [],
 *   score_breakdown: object,
 *   errors: string[]
 * }}
 */
function computeSecurityScore(scanResults) {
  const { snyk, dep, sast, secrets } = scanResults;
  const errors = [];

  if (snyk?.error) errors.push(`Snyk: ${snyk.error}`);
  if (dep?.error) errors.push(`Dep audit: ${dep.error}`);
  if (secrets?.error) errors.push(`Secret detection: ${secrets.error}`);

  // -----------------------------------------------------------------------
  // 1. Aggregate all findings by severity
  // -----------------------------------------------------------------------

  // Critical issues = snyk critical + dep critical + sast critical + critical secrets
  const criticalIssues = [
    ...(snyk?.critical || []).map((v) => ({ source: "snyk", ...v })),
    ...(dep?.combinedCritical || []).map((v) => ({ source: "dep-audit", ...v })),
    ...(sast?.critical || []).map((v) => ({ source: "sast", ...v })),
    ...(secrets?.secrets || [])
      .filter((s) => s.severity === "critical")
      .map((s) => ({ source: "secrets", ...s })),
  ];

  const highIssues = [
    ...(snyk?.high || []).map((v) => ({ source: "snyk", ...v })),
    ...(dep?.combinedHigh || []).map((v) => ({ source: "dep-audit", ...v })),
    ...(sast?.high || []).map((v) => ({ source: "sast", ...v })),
    ...(secrets?.secrets || [])
      .filter((s) => s.severity === "high")
      .map((s) => ({ source: "secrets", ...s })),
  ];

  const moderateIssues = [
    ...(snyk?.moderate || []).map((v) => ({ source: "snyk", ...v })),
    ...(sast?.moderate || []).map((v) => ({ source: "sast", ...v })),
  ];

  const lowIssues = [
    ...(snyk?.low || []).map((v) => ({ source: "snyk", ...v })),
    ...(sast?.low || []).map((v) => ({ source: "sast", ...v })),
  ];

  // All dep vulns for the dependency_vulns DB column
  const dependencyVulns = [
    ...(dep?.npm?.critical || []),
    ...(dep?.npm?.high || []),
    ...(dep?.npm?.moderate || []),
    ...(dep?.pip?.critical || []),
    ...(dep?.pip?.high || []),
    ...(dep?.pip?.moderate || []),
  ];

  // -----------------------------------------------------------------------
  // 2. Compute score
  // -----------------------------------------------------------------------
  const penaltyCritical = Math.min(
    criticalIssues.length * PENALTIES.critical,
    MAX_PENALTY.critical
  );
  const penaltyHigh = Math.min(
    highIssues.length * PENALTIES.high,
    MAX_PENALTY.high
  );
  const penaltyModerate = Math.min(
    moderateIssues.length * PENALTIES.moderate,
    MAX_PENALTY.moderate
  );
  const penaltyLow = Math.min(
    lowIssues.length * PENALTIES.low,
    MAX_PENALTY.low
  );

  // Extra penalty if secrets found
  const penaltySecrets = secrets?.secretsFound ? 15 : 0;

  const totalPenalty =
    penaltyCritical + penaltyHigh + penaltyModerate + penaltyLow + penaltySecrets;

  const securityScore = Math.max(0, 100 - totalPenalty);

  return {
    security_score: securityScore,
    critical_issues: criticalIssues,
    high_issues: highIssues,
    secrets_found: secrets?.secretsFound || false,
    dependency_vulns: dependencyVulns,
    // Extra breakdown for transparency in the report
    score_breakdown: {
      base: 100,
      penalty_critical: penaltyCritical,
      penalty_high: penaltyHigh,
      penalty_moderate: penaltyModerate,
      penalty_low: penaltyLow,
      penalty_secrets: penaltySecrets,
      total_penalty: totalPenalty,
      counts: {
        critical: criticalIssues.length,
        high: highIssues.length,
        moderate: moderateIssues.length,
        low: lowIssues.length,
        secrets: secrets?.secrets?.length || 0,
      },
    },
    errors,
  };
}

module.exports = { computeSecurityScore };