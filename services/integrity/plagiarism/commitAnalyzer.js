const simpleGit = require('simple-git');

async function analyzeCommitHistory(projectPath) {
  const git = simpleGit(projectPath);

  let commits;
  try {
    const log = await git.log(['--format=%H|%ae|%s|%aI', '--no-merges']);
    commits = log.all.map(c => {
      const [hash, email, message, date] = c.hash.split('|');
      return { hash, email, message, date: new Date(date) };
    });
  } catch (err) {
    return { commit_regularity_score: 0, flags: ['git_read_failed'], details: { error: err.message } };
  }

  if (commits.length === 0) {
    return { commit_regularity_score: 0, flags: ['no_commits'], details: {} };
  }

  const details = {};

  const countScore = Math.min(commits.length / 20, 1) * 100;
  details.commitCount = commits.length;

  const dates = commits.map(c => c.date.getTime()).sort((a, b) => a - b);
  const spanDays = (dates[dates.length - 1] - dates[0]) / (1000 * 60 * 60 * 24);
  const spanScore = Math.min(spanDays / 7, 1) * 100;
  details.spanDays = Math.round(spanDays);

  const isSingleDump = detectSingleDump(dates);
  details.isSingleDump = isSingleDump;

  const msgScore = scoreMsgQuality(commits);
  details.msgScore = Math.round(msgScore);

  let score = (spanScore * 0.45 + countScore * 0.30 + msgScore * 0.25);
  if (isSingleDump) score = Math.min(score, 30);

  const flags = [];
  if (isSingleDump)       flags.push('single_dump_detected');
  if (commits.length < 5) flags.push('very_few_commits');
  if (spanDays < 1)       flags.push('all_commits_same_day');

  return { commit_regularity_score: Math.round(score), flags, details };
}

function detectSingleDump(sortedTimestamps) {
  if (sortedTimestamps.length < 3) return false;
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  let maxInWindow = 0;
  for (let i = 0; i < sortedTimestamps.length; i++) {
    const windowEnd = sortedTimestamps[i] + TWO_HOURS;
    const inWindow = sortedTimestamps.filter(t => t >= sortedTimestamps[i] && t <= windowEnd).length;
    maxInWindow = Math.max(maxInWindow, inWindow);
  }
  return maxInWindow / sortedTimestamps.length > 0.8;
}

function scoreMsgQuality(commits) {
  const genericPatterns = /^(init|initial commit|wip|update|fix|test|commit|asdf|aaa|done|stuff)$/i;
  const goodPrefixes = /^(feat|fix|refactor|chore|docs|test|style|perf|ci)(\(.+\))?:/i;
  let total = 0;
  for (const c of commits) {
    const msg = (c.message || '').trim();
    if (msg.length < 5)                 total += 0;
    else if (genericPatterns.test(msg)) total += 20;
    else if (goodPrefixes.test(msg))    total += 100;
    else if (msg.length > 20)           total += 60;
    else                                total += 40;
  }
  return total / commits.length;
}

module.exports = { analyzeCommitHistory };