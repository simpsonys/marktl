const { buildSummary } = require('./publishSafety.js');

function buildSearchEntry(page, markdown) {
  return {
    title: String(page.title || ''),
    url: String(page.url || ''),
    sourcePath: String(page.sourcePath || ''),
    summary: String(page.summary || buildSummary(markdown)),
    tags: Array.isArray(page.tags) ? page.tags : [],
    visibility: String(page.visibility || 'public-safe'),
    updatedAt: String(page.updatedAt || ''),
  };
}

module.exports = {
  buildSearchEntry,
};
