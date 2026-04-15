// services/report/jsonExport.js
// Structures and returns the full evaluation payload as clean JSON.
// This is what the frontend / LMS will consume via GET /reports/:evaluationId/json

/**
 * Builds the structured JSON export for a completed evaluation.
 * Call this after you've aggregated results from Security + Integrity services.
 *
 * @param {Object} evaluationData - combined result from report/index.js
 * @returns {Object} clean structured report
 */
function buildJSONReport(evaluationData) {
  const {
    projectId,
    evaluationId,
    status,
    metrics,
    flags,
    securityDetails = {},
    integrityDetails = {},
    learningPath = [],
    generatedAt
  } = evaluationData;

  return {
    meta: {
      evaluationId,
      projectId,
      generatedAt: generatedAt || new Date().toISOString(),
      status  // 'PASS' | 'FLAGGED' | 'MANUAL REVIEW'
    },
    scores: {
      overall:     Math.round(metrics.average),
      security:    Math.round(metrics.security),
      originality: Math.round(metrics.integrity)
    },
    integrity: {
      originality_score:      Math.round(metrics.integrity),
      plagiarism_flag:        flags.plagiarism,
      ai_gen_flag:            flags.ai_gen,
      commit_regularity_score: integrityDetails.commit_regularity_score ?? null,
      similarity_matches:      integrityDetails.similarity_matches || []
    },
    security: {
      security_score:      Math.round(metrics.security),
      secrets_found:       flags.secrets_found || false,
      critical_issues:     securityDetails.critical_issues || [],
      high_issues:         securityDetails.high_issues || [],
      dependency_vulns:    securityDetails.dependency_vulns || []
    },
    learning_path: learningPath,
    originality_certificate: metrics.integrity > 85
      ? { eligible: true, threshold: 85, score: Math.round(metrics.integrity) }
      : { eligible: false }
  };
}

module.exports = { buildJSONReport };