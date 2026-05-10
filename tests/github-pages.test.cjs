const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPagesUrl,
  buildPublishPath,
  inferPagesBaseUrl,
  mimeTypeForPath,
  normalizePublishPath,
  parseRepo,
} = require('../src/core/github-pages.js');

test('parses GitHub repository settings', () => {
  assert.deepEqual(parseRepo('reallygood83/marktl-shares'), { owner: 'reallygood83', repo: 'marktl-shares' });
  assert.deepEqual(parseRepo('https://github.com/reallygood83/marktl-shares.git'), { owner: 'reallygood83', repo: 'marktl-shares' });
  assert.equal(parseRepo('missing'), null);
});

test('builds stable GitHub Pages paths and URLs', () => {
  assert.equal(normalizePublishPath('/exports//marktl/'), 'exports/marktl');
  assert.equal(buildPublishPath('/exports/', 'my-note', 'assets/chart.png'), 'exports/my-note/assets/chart.png');
  assert.equal(buildPagesUrl('https://reallygood83.github.io/marktl-shares/', 'exports', 'my note'), 'https://reallygood83.github.io/marktl-shares/exports/my%20note/');
  assert.equal(inferPagesBaseUrl('reallygood83/marktl-shares'), 'https://reallygood83.github.io/marktl-shares');
  assert.equal(inferPagesBaseUrl('reallygood83/reallygood83.github.io'), 'https://reallygood83.github.io');
});

test('returns MIME types for publishable files', () => {
  assert.equal(mimeTypeForPath('index.html'), 'text/html; charset=utf-8');
  assert.equal(mimeTypeForPath('assets/chart.webp'), 'image/webp');
  assert.equal(mimeTypeForPath('unknown.bin'), 'application/octet-stream');
});
