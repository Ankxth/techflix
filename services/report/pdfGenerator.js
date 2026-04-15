// services/report/pdfGenerator.js
// Reads the HTML template, fills in all placeholders, renders to PDF via Puppeteer.
 
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
 
const TEMPLATE_PATH = path.join(__dirname, 'templates', 'report.html');
 
/** Returns a Tailwind-style color class based on a 0–100 score */
function scoreColor(score) {
  if (score >= 70) return 'score-high';
  if (score >= 50) return 'score-medium';
  return 'score-low';
}
 
/** Builds the HTML blocks for each learning path recommendation */
function buildLearningPathHTML(recommendations) {
  if (!recommendations || recommendations.length === 0) {
    return '<p style="color:#64748b; font-size:13px;">No weak areas detected. Great work!</p>';
  }
  return recommendations.map(rec => `
    <div class="recommendation">
      <div class="dim">${rec.dimension.replace(/_/g, ' ')}</div>
      <div class="project">Next project: ${rec.nextProject}</div>
      <div class="resources">
        ${rec.resources.map(r => `<a href="${r.url}" target="_blank">${r.title}</a>`).join('')}
      </div>
    </div>
  `).join('');
}
 
/** Builds the originality certificate block (only if score > 85) */
function buildOriginalityCert(originalityScore, projectId) {
  if (originalityScore <= 85) return '';
  return `
    <div class="section">
      <div class="originality-cert">
        <h3>✓ Originality Certificate</h3>
        <p>This project (ID: ${projectId}) scored ${originalityScore}/100 on originality checks.</p>
        <p style="margin-top:6px; font-size:12px;">Verified by Techflix AI Evaluation System</p>
      </div>
    </div>
  `;
}
 
/**
 * Generates a PDF buffer from evaluation data.
 *
 * @param {Object} data
 * @param {string} data.projectId
 * @param {string} data.evaluationId
 * @param {string} data.status           - 'PASS' | 'FLAGGED' | 'MANUAL REVIEW'
 * @param {Object} data.metrics          - { security, integrity, average }
 * @param {Object} data.flags            - { plagiarism, ai_gen, vulns, secrets_found }
 * @param {Object} data.securityDetails  - { critical_issues, high_issues, dependency_vulns }
 * @param {Object} data.integrityDetails - { commit_regularity_score, similarity_matches }
 * @param {Array}  data.learningPath     - output of getRecommendations()
 * @returns {Buffer} PDF binary buffer
 */
async function generatePDF(data) {
  const {
    projectId,
    evaluationId,
    status,
    metrics,
    flags,
    securityDetails = {},
    integrityDetails = {},
    learningPath = []
  } = data;
 
  const statusClass = status === 'PASS' ? 'PASS'
    : status === 'FLAGGED' ? 'FLAGGED'
    : 'MANUAL';
 
  // Load template and fill placeholders
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
 
  const replacements = {
    PROJECT_ID:        projectId,
    EVALUATION_ID:     evaluationId || 'N/A',
    GENERATED_AT:      new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    STATUS:            status,
    STATUS_CLASS:      statusClass,
 
    AVERAGE_SCORE:     Math.round(metrics.average),
    SECURITY_SCORE:    Math.round(metrics.security),
    INTEGRITY_SCORE:   Math.round(metrics.integrity),
    AVERAGE_COLOR:     scoreColor(metrics.average),
    SECURITY_COLOR:    scoreColor(metrics.security),
    INTEGRITY_COLOR:   scoreColor(metrics.integrity),
 
    PLAGIARISM_CLASS:  flags.plagiarism ? 'flag-yes' : 'flag-no',
    PLAGIARISM_LABEL:  flags.plagiarism ? 'YES' : 'NO',
    PLAGIARISM_DETAIL: flags.plagiarism
      ? `Matched ${(integrityDetails.similarity_matches || []).length} known source(s)`
      : 'No matches found',
 
    AI_GEN_CLASS:   flags.ai_gen ? 'flag-yes' : 'flag-no',
    AI_GEN_LABEL:   flags.ai_gen ? 'SUSPECTED' : 'CLEAR',
    AI_GEN_DETAIL:  flags.ai_gen ? 'Heuristic signals detected' : 'No signals detected',
 
    COMMIT_SCORE:   integrityDetails.commit_regularity_score ?? 'N/A',
    COMMIT_DETAIL:  (integrityDetails.commit_regularity_score ?? 0) > 70
      ? 'Regular commit history'
      : 'Irregular or sparse commits',
 
    CRITICAL_COUNT: (securityDetails.critical_issues || []).length,
    HIGH_COUNT:     (securityDetails.high_issues || []).length,
    VULN_COUNT:     (securityDetails.dependency_vulns || []).length,
    SECRETS_CLASS:  flags.secrets_found ? 'flag-yes' : 'flag-no',
    SECRETS_LABEL:  flags.secrets_found ? 'FOUND' : 'NONE',
 
    LEARNING_PATH_HTML:      buildLearningPathHTML(learningPath),
    ORIGINALITY_CERT_HTML:   buildOriginalityCert(metrics.integrity, projectId),
  };
 
  // Replace all {{PLACEHOLDER}} tokens
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }
 
  // Render with Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
 
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' } // template handles its own padding
  });
 
  await browser.close();
  return pdfBuffer;
}
 
module.exports = { generatePDF };
 