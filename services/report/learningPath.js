// services/report/learningPath.js
// Rule-based recommender — Phase 1. No ML needed.
// Maps weak evaluation dimensions → next project + resources.

const LEARNING_PATH = {
  error_handling: {
    nextProject: 'REST API with global error middleware',
    resources: [
      { title: 'MDN: Error handling', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Control_flow_and_error_handling' },
      { title: 'Express error handling guide', url: 'https://expressjs.com/en/guide/error-handling.html' }
    ]
  },
  testing: {
    nextProject: 'TDD Todo App (Jest + Supertest)',
    resources: [
      { title: 'Jest docs', url: 'https://jestjs.io/docs/getting-started' },
      { title: 'Testing Node.js — Fireship', url: 'https://www.youtube.com/watch?v=FKnzS_icp20' }
    ]
  },
  architecture: {
    nextProject: 'MVC blog with PostgreSQL',
    resources: [
      { title: 'Clean Architecture summary', url: 'https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html' },
      { title: 'Node.js project structure guide', url: 'https://bullet.io/blog/node-project-structure' }
    ]
  },
  security: {
    nextProject: 'Auth system with JWT + bcrypt',
    resources: [
      { title: 'OWASP Top 10', url: 'https://owasp.org/www-project-top-ten/' },
      { title: 'JWT.io intro', url: 'https://jwt.io/introduction' }
    ]
  },
  code_quality: {
    nextProject: 'Refactor a legacy Express app using SOLID principles',
    resources: [
      { title: 'Refactoring Guru', url: 'https://refactoring.guru/refactoring' },
      { title: 'Clean Code JS', url: 'https://github.com/ryanmcdermott/clean-code-javascript' }
    ]
  },
  documentation: {
    nextProject: 'Fully documented REST API with Swagger/OpenAPI',
    resources: [
      { title: 'Swagger docs', url: 'https://swagger.io/docs/' },
      { title: 'JSDoc guide', url: 'https://jsdoc.app/' }
    ]
  }
};

/**
 * Given the scores object from Yisol's evaluation output,
 * return a list of recommended next steps for weak dimensions.
 *
 * @param {Object} scores - e.g. { error_handling: 45, testing: 30, architecture: 80 }
 * @param {number} threshold - dimensions scoring below this are considered weak (default 60)
 * @returns {Array} up to 3 recommendations, sorted by weakest first
 */
function getRecommendations(scores = {}, threshold = 60) {
  const weak = Object.entries(scores)
    .filter(([, score]) => score < threshold)
    .sort(([, a], [, b]) => a - b) // weakest first
    .slice(0, 3);                   // top 3 only

  return weak.map(([dimension, score]) => {
    const path = LEARNING_PATH[dimension];
    if (!path) return null;
    return {
      dimension,
      score,
      nextProject: path.nextProject,
      resources: path.resources
    };
  }).filter(Boolean);
}

module.exports = { getRecommendations };