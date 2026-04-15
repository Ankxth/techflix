// index.js — Security Audit Service
// Express entry point
// POST /audit  →  runs all security scanners and returns structured results
// Results are also written to the security_results DB table (stub ready for Ankith's schema)

const express = require("express");
const { runSnykScan } = require("./snykScanner");
const { runSecretDetection } = require("./secretDetector");
const { runDependencyAudit } = require("./depAudit");
const { runSastScan } = require("./sastScanner");
const { computeSecurityScore } = require("./securityScore");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3002;

// ---------------------------------------------------------------------------
// POST /audit
// Body: { projectId: string, projectPath: string }
//   projectId   — UUID from the main evaluation (Ankith's schema)
//   projectPath — absolute path to the cloned project on disk
//
// Returns: security_results row shape (ready to INSERT into DB)
// ---------------------------------------------------------------------------
app.post("/audit", async (req, res) => {
  const { projectId, projectPath } = req.body;

  if (!projectId || !projectPath) {
    return res.status(400).json({
      error: "projectId and projectPath are required",
    });
  }

  console.log(`[security-audit] Starting audit for project ${projectId} at ${projectPath}`);

  try {
    // Run all scanners in parallel where possible
    // Snyk and dep audit can run together; SAST and secrets are CPU-bound but fast
    const [snykResult, depResult, secretResult] = await Promise.all([
      runSnykScan(projectPath),
      runDependencyAudit(projectPath),
      runSecretDetection(projectPath),
    ]);

    // SAST is synchronous (file reading) — run after async ones complete
    const sastResult = runSastScan(projectPath);

    // Compute final score and structured output
    const scored = computeSecurityScore({
      snyk: snykResult,
      dep: depResult,
      sast: sastResult,
      secrets: secretResult,
    });

    // Shape for the security_results DB table (coordinate column names with Ankith)
    const dbRow = {
      project_id: projectId,
      security_score: scored.security_score,
      critical_issues: scored.critical_issues,
      high_issues: scored.high_issues,
      secrets_found: scored.secrets_found,
      dependency_vulns: scored.dependency_vulns,
    };

    // TODO: INSERT dbRow into security_results table
    // Example (once Ankith gives you the DB client):
    // await db.query(
    //   `INSERT INTO security_results
    //    (project_id, security_score, critical_issues, high_issues, secrets_found, dependency_vulns)
    //    VALUES ($1, $2, $3, $4, $5, $6)`,
    //   [dbRow.project_id, dbRow.security_score,
    //    JSON.stringify(dbRow.critical_issues), JSON.stringify(dbRow.high_issues),
    //    dbRow.secrets_found, JSON.stringify(dbRow.dependency_vulns)]
    // );

    console.log(
      `[security-audit] Done. Score: ${scored.security_score} | ` +
      `Critical: ${scored.score_breakdown.counts.critical} | ` +
      `Secrets: ${scored.secrets_found}`
    );

    return res.status(200).json({
      ...dbRow,
      // Extra detail for the report service (not stored in DB)
      score_breakdown: scored.score_breakdown,
      sast_details: {
        moderate: sastResult.moderate,
        low: sastResult.low,
        filesScanned: sastResult.filesScanned,
      },
      errors: scored.errors,
    });
  } catch (err) {
    console.error(`[security-audit] Unexpected error:`, err);
    return res.status(500).json({
      error: "Security audit failed unexpectedly",
      detail: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// GET /health — for Ankith's service discovery / Docker healthcheck
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "security-audit" });
});

app.listen(PORT, () => {
  console.log(`[security-audit] Service running on port ${PORT}`);
});

module.exports = app; // export for testing