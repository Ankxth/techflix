/**
 * AI-generated code detection via heuristic signals.
 * No external deps — pure static analysis on file contents.
 */

const fs = require('fs');
const path = require('path');

const CODE_EXTENSIONS = ['.js', '.ts', '.py', '.java', '.cpp', '.c', '.go', '.rb'];

async function detectAIGenerated(projectPath) {
  const files = collectCodeFiles(projectPath);

  if (files.length === 0) {
    return { ai_gen_flag: false, ai_gen_confidence: 0, flags: ['no_code_files'], details: {} };
  }

  const allContent = files.map(f => {
    try { return { file: f, content: fs.readFileSync(f, 'utf8') }; }
    catch { return null; }
  }).filter(Boolean);

  const details = {};

  // Signal 1: no commented-out code or debug prints anywhere
  const hasCommentedCode = allContent.some(({ content }) =>
    /\/\/\s*(console\.log|print|TODO|FIXME|debug|temp|hack|old)/i.test(content) ||
    /#\s*(print|TODO|FIXME|debug|temp)/i.test(content)
  );
  details.hasCommentedCode = hasCommentedCode;

  // Signal 2: suspiciously uniform variable naming (camelCase perfection, no abbreviations)
  const namingScore = scoreNamingUniformity(allContent.map(f => f.content));
  details.namingUniformityScore = namingScore;

  // Signal 3: every function has a JSDoc/docstring comment
  const docCoverage = scoreDocCoverage(allContent.map(f => f.content));
  details.docCoverage = docCoverage;

  // Signal 4: no WIP patterns (console.log, print(), debugger, breakpoint)
  const hasWIPCode = allContent.some(({ content }) =>
    /console\.log\s*\(|debugger;|pdb\.set_trace|breakpoint\(\)|print\s*\(/.test(content)
  );
  details.hasWIPCode = hasWIPCode;

  // Signal 5: file sizes are suspiciously uniform
  const sizes = allContent.map(f => f.content.length);
  details.fileSizeVariance = variance(sizes);
  const uniformFiles = details.fileSizeVariance < 500 && files.length > 3;

  // Weighted confidence score (0-100)
  let confidence = 0;
  if (!hasCommentedCode) confidence += 25;
  if (!hasWIPCode)        confidence += 25;
  if (namingScore > 80)   confidence += 20;
  if (docCoverage > 0.8)  confidence += 20;
  if (uniformFiles)       confidence += 10;

  const flags = [];
  if (!hasWIPCode)      flags.push('no_wip_patterns');
  if (!hasCommentedCode) flags.push('no_commented_code');
  if (docCoverage > 0.9) flags.push('suspiciously_high_doc_coverage');
  if (namingScore > 90)  flags.push('perfect_variable_naming');

  return {
    ai_gen_flag: confidence >= 60,
    ai_gen_confidence: confidence,
    flags,
    details
  };
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

function scoreNamingUniformity(contents) {
  // Extract identifiers, check ratio of well-formed camelCase vs abbreviations/single-letters
  const allIdents = contents.flatMap(c => c.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) || []);
  if (allIdents.length === 0) return 0;
  const camelCase = allIdents.filter(id => /^[a-z][a-zA-Z0-9]+$/.test(id) && id.length > 4);
  return Math.round((camelCase.length / allIdents.length) * 100);
}

function scoreDocCoverage(contents) {
  let fnCount = 0, docCount = 0;
  for (const content of contents) {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const isFn = /^\s*(function |async function |\w+ = \(|const \w+ = \(|def \w+\()/.test(lines[i]);
      if (isFn) {
        fnCount++;
        // Check if there's a comment in the 3 lines before
        const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
        if (/\/\*\*|\/\/|"""/.test(prev)) docCount++;
      }
    }
  }
  return fnCount === 0 ? 0 : docCount / fnCount;
}

function variance(arr) {
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length;
}

module.exports = { detectAIGenerated };