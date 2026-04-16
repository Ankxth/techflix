require('dotenv').config();
// services/report/index.js
// Report Service — Port 3004
// Orchestrates Security + Integrity results, generates PDF and JSON exports.
// DB writes are commented out — Ankith will uncomment once DATABASE_URL is set.

const express = require('express');
const axios   = require('axios');
const path    = require('path');
const fs      = require('fs');

const { generatePDF }       = require('./pdfGenerator');
const { buildJSONReport }   = require('./jsonExport');
const { getRecommendations } = require('./learningPath');

const app = express();
app.use(express.json());

// ─── Service URLs (override via .env) ────────────────────────────────────────
const SECURITY_URL  = process.env.SECURITY_URL  || 'http://localhost:3002/audit';
const INTEGRITY_URL = process.env.INTEGRITY_URL || 'http://localhost:3003/integrity/check';
const PORT          = process.env.PORT || 3004;

// ─── Output dir for generated PDFs ───────────────────────────────────────────
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── DB (pg) — commented out until Ankith provides DATABASE_URL ──────────────
const { Pool } = require('pg');
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Helper: compute status from scores ──────────────────────────────────────
function computeStatus(securityScore, integrityScore) {
  if (securityScore > 70 && integrityScore > 80) return 'PASS';
  if (integrityScore < 40 || securityScore < 40)  return 'FLAGGED';
  return 'MANUAL REVIEW';
}

// ─── POST /report/generate ────────────────────────────────────────────────────
// Main endpoint. Calls Security + Integrity services in parallel, builds report.
// Body: { projectId, projectPath, evaluationId?, dimensionScores? }
//   dimensionScores: optional object from Yisol's LLM evaluation,
//   e.g. { error_handling: 45, testing: 30 } — used for learning path only
app.post('/report/generate', async (req, res) => {
  const { projectId, projectPath, evaluationId, dimensionScores = {} } = req.body;

  if (!projectId || !projectPath) {
    return res.status(400).json({ error: 'projectId and projectPath are required' });
  }

  try {
    // Call Security + Integrity services in parallel
    // Each has a fallback so one failing doesn't kill the whole report
    const [secRes, intRes] = await Promise.all([
      axios.post(SECURITY_URL,  { projectId, projectPath })
        .catch(err => {
          console.warn('[report] Security service error:', err.message);
          return { data: { security_score: 0, critical_issues: [], high_issues: [], dependency_vulns: [], secrets_found: false } };
        }),
      axios.post(INTEGRITY_URL, { projectId, projectPath })
        .catch(err => {
          console.warn('[report] Integrity service error:', err.message);
          return { data: { originality_score: 0, plagiarism_flag: false, ai_gen_flag: false, commit_regularity_score: 0, similarity_matches: [] } };
        })
    ]);

    const secData = secRes.data;
    const intData = intRes.data;

    const metrics = {
      security:  secData.security_score  || 0,
      integrity: intData.originality_score || 0,
      average:   ((secData.security_score || 0) + (intData.originality_score || 0)) / 2
    };

    const flags = {
      plagiarism:   intData.plagiarism_flag   || false,
      ai_gen:       intData.ai_gen_flag       || false,
      secrets_found: secData.secrets_found    || false,
      vulns:        (secData.critical_issues  || []).length
    };

    const status = computeStatus(metrics.security, metrics.integrity);

    // Learning path — uses dimensionScores from Yisol if provided
    const learningPath = getRecommendations(dimensionScores);

    const reportData = {
      projectId,
      evaluationId: evaluationId || `eval_${Date.now()}`,
      status,
      metrics,
      flags,
      securityDetails:  { critical_issues: secData.critical_issues, high_issues: secData.high_issues, dependency_vulns: secData.dependency_vulns },
      integrityDetails: { commit_regularity_score: intData.commit_regularity_score, similarity_matches: intData.similarity_matches },
      learningPath,
      generatedAt: new Date().toISOString()
    };

    // Generate PDF
    const pdfBuffer = await generatePDF(reportData);
    const pdfFileName = `report_${reportData.evaluationId}.pdf`;
    const pdfPath = path.join(OUTPUT_DIR, pdfFileName);
    fs.writeFileSync(pdfPath, pdfBuffer);

    // Build JSON
    const jsonReport = buildJSONReport(reportData);

    await db.query(
      `INSERT INTO reports (evaluation_id, pdf_url, json_url, learning_path, generated_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        reportData.evaluationId,
        `/reports/${reportData.evaluationId}/pdf`,
        `/reports/${reportData.evaluationId}/json`,
        JSON.stringify(learningPath),
        reportData.generatedAt
      ]
    );
    // ────────────────────────────────────────────────────────────────────────

    return res.json({
      ...jsonReport,
      pdf_url:  `/reports/${reportData.evaluationId}/pdf`,
      json_url: `/reports/${reportData.evaluationId}/json`
    });

  } catch (err) {
    console.error('[report] Unexpected error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /reports/:evaluationId/pdf ──────────────────────────────────────────
// Serves the generated PDF file for download.
app.get('/reports/:evaluationId/pdf', (req, res) => {
  const pdfPath = path.join(OUTPUT_DIR, `report_${req.params.evaluationId}.pdf`);
  if (!fs.existsSync(pdfPath)) {
    return res.status(404).json({ error: 'Report PDF not found. Generate it first via POST /report/generate' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="techflix_report_${req.params.evaluationId}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
});

// ─── GET /reports/:evaluationId/json ─────────────────────────────────────────
// Returns the structured JSON report (for frontend / LMS).
// In Phase 2 this will read from DB instead of re-fetching.
app.get('/reports/:evaluationId/json', (req, res) => {
  // For now, regeneration isn't supported via GET.
  // JSON is returned inline from POST /report/generate.
  // Ankith: once DB is live, query reports table here.
  res.status(501).json({
    message: 'Direct JSON fetch not yet implemented. Use POST /report/generate — the response includes the full JSON report.'
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'report', port: PORT }));

app.listen(PORT, () => {
  console.log(`[report] Service live on port ${PORT}`);
  console.log(`[report] Security upstream  → ${SECURITY_URL}`);
  console.log(`[report] Integrity upstream → ${INTEGRITY_URL}`);
});