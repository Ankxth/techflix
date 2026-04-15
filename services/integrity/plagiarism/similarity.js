/**
 * Semantic code similarity checker.
 * Compares student code against known tutorial fingerprints using
 * Grok API embeddings (cosine similarity) as the primary approach,
 * with a lightweight token-overlap fallback.
 */

const fs = require('fs');
const path = require('path');
const { tutorialFingerprints } = require('./tutorialDb');

const CODE_EXTENSIONS = ['.js', '.ts', '.py', '.java', '.go', '.rb'];
const SIMILARITY_THRESHOLD = 0.70; // flag if cosine sim > 70%

async function checkSimilarity(projectPath) {
  const files = collectCodeFiles(projectPath);
  const studentCode = readAndConcatenate(files);

  if (!studentCode) {
    return { similarity_score: 0, plagiarism_flag: false, similarity_matches: [], details: {} };
  }

  const matches = [];

  for (const tutorial of tutorialFingerprints) {
    let score;
    try {
      score = await cosineSimilarityViaEmbeddings(studentCode, tutorial.code);
    } catch {
      // Fallback: token overlap (Jaccard similarity)
      score = jaccardSimilarity(tokenize(studentCode), tokenize(tutorial.code));
    }

    if (score >= SIMILARITY_THRESHOLD) {
      matches.push({ source: tutorial.name, url: tutorial.url, similarity: Math.round(score * 100) });
    }
  }

  // Sort by similarity descending
  matches.sort((a, b) => b.similarity - a.similarity);

  const maxSim = matches.length > 0 ? matches[0].similarity : 0;

  return {
    similarity_score: maxSim,
    plagiarism_flag: maxSim >= 70,
    similarity_matches: matches,
    details: { filesChecked: files.length, tutorialsChecked: tutorialFingerprints.length }
  };
}

// Uses Grok API for semantic embedding comparison
async function cosineSimilarityViaEmbeddings(codeA, codeB) {
  const [embA, embB] = await Promise.all([embed(codeA), embed(codeB)]);
  return cosine(embA, embB);
}

async function embed(text) {
  // Truncate to ~8k chars to stay within token limits
  const truncated = text.slice(0, 8000);

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.AI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'grok-2-1212',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Return ONLY a JSON array of 64 floats representing a semantic embedding of this code. No explanation.\n\n${truncated}`
      }]
    })
  });

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '[]';
  return JSON.parse(raw.match(/\[[\d.,\s\-e]+\]/)?.[0] || '[]');
}

function cosine(a, b) {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// Fallback: Jaccard similarity on code tokens
function jaccardSimilarity(setA, setB) {
  const a = new Set(setA);
  const b = new Set(setB);
  const intersection = [...a].filter(t => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function tokenize(code) {
  return code
    .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '') // strip comments
    .match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
}

function collectCodeFiles(dir, results = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) collectCodeFiles(full, results);
      else if (CODE_EXTENSIONS.includes(path.extname(e.name))) results.push(full);
    }
  } catch {}
  return results;
}

function readAndConcatenate(files) {
  return files.map(f => {
    try { return fs.readFileSync(f, 'utf8'); }
    catch { return ''; }
  }).join('\n');
}

module.exports = { checkSimilarity };