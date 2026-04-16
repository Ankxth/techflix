require('dotenv').config();
/**
 * Integrity checking service entry point.
 * POST /integrity/check  { projectId, projectPath }
 * Runs all checks in parallel, computes originality_score, writes to DB.
 */

const express = require('express');
const { Pool } = require('pg');
const { analyzeCommitHistory } = require('./plagiarism/commitAnalyzer');
const { checkSimilarity } = require('./plagiarism/similarity');
const { detectAIGenerated } = require('./aiDetection/heuristics');

const app = express();
app.use(express.json());

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.post('/integrity/check', async (req, res) => {
  const { projectId, projectPath } = req.body;
  if (!projectId || !projectPath) {
    return res.status(400).json({ error: 'projectId and projectPath required' });
  }

  try {
    // Run all checks in parallel
    const [commitResult, similarityResult, aiResult] = await Promise.all([
      analyzeCommitHistory(projectPath),
      checkSimilarity(projectPath),
      detectAIGenerated(projectPath)
    ]);

    // Originality score formula from spec:
    // originality = 100 - max(plagiarism_similarity * 0.6 + tutorial_match * 0.3 + ai_gen_confidence * 0.1 * 100)
    const plagiarismSim  = similarityResult.similarity_score / 100;  // 0-1
    const tutorialMatch  = similarityResult.similarity_score / 100;  // using same signal; extend later
    const aiConfidence   = aiResult.ai_gen_confidence / 100;         // 0-1

    const originalityRaw = 100 - Math.max(
      plagiarismSim  * 0.6 * 100 +
      tutorialMatch  * 0.3 * 100 +
      aiConfidence   * 0.1 * 100
    );
    const originality_score = Math.round(Math.max(0, Math.min(100, originalityRaw)));

    // Commit regularity feeds in as a soft modifier (+up to 5pts if authentic)
    const commitBonus = commitResult.commit_regularity_score >= 70 ? 5 : 0;
    const final_originality = Math.min(100, originality_score + commitBonus);

    const payload = {
      project_id:              projectId,
      originality_score:       final_originality,
      plagiarism_flag:         similarityResult.plagiarism_flag,
      ai_gen_flag:             aiResult.ai_gen_flag,
      similarity_score:        similarityResult.similarity_score,
      commit_regularity_score: commitResult.commit_regularity_score,
      matched_sources:         JSON.stringify(similarityResult.similarity_matches),
    };
/*
    // Write to integrity_flags table (Ankith's schema)
    await pool.query(`
      INSERT INTO integrity_flags
        (project_id, originality_score, plagiarism_flag, ai_gen_flag,
         similarity_score, commit_regularity_score, matched_sources, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (project_id) DO UPDATE SET
        originality_score       = EXCLUDED.originality_score,
        plagiarism_flag         = EXCLUDED.plagiarism_flag,
        ai_gen_flag             = EXCLUDED.ai_gen_flag,
        similarity_score        = EXCLUDED.similarity_score,
        commit_regularity_score = EXCLUDED.commit_regularity_score,
        matched_sources         = EXCLUDED.matched_sources,
        created_at              = NOW()
    `, [
      payload.project_id, payload.originality_score, payload.plagiarism_flag,
      payload.ai_gen_flag, payload.similarity_score, payload.commit_regularity_score,
      payload.matched_sources
    ]);
*/
    return res.json({
      originality_score: final_originality,
      plagiarism_flag:   similarityResult.plagiarism_flag,
      ai_gen_flag:       aiResult.ai_gen_flag,
      similarity_matches: similarityResult.similarity_matches,
      commit_regularity_score: commitResult.commit_regularity_score,
      commit_flags:      commitResult.flags,
      ai_flags:          aiResult.flags
    });

  } catch (err) {
    console.error('Integrity check failed:', err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.INTEGRITY_PORT || 3003;
app.listen(PORT, () => console.log(`Integrity service running on port ${PORT}`));