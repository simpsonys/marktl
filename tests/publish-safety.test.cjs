const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPublishManifest } = require('../src/core/publishManifest.js');
const { evaluatePublishSafety, parseFrontmatter } = require('../src/core/publishSafety.js');
const { buildSearchEntry } = require('../src/core/searchIndex.js');
const { renderSafetyReport, renderWebBookIndex, renderWebBookPage } = require('../src/templates/ysdaWebBook.js');

test('parses simple publish frontmatter values', () => {
  const frontmatter = parseFrontmatter('publish: true\nvisibility: public-safe\nreviewed: true\ntags: [study, system-design]');

  assert.equal(frontmatter.publish, true);
  assert.equal(frontmatter.visibility, 'public-safe');
  assert.equal(frontmatter.reviewed, true);
  assert.deepEqual(frontmatter.tags, ['study', 'system-design']);
});

test('allows reviewed public-safe notes and skips unreviewed or unpublished notes', () => {
  const safe = evaluatePublishSafety(`---
publish: true
visibility: public-safe
reviewed: true
tags: [study]
---
# Voice Interaction Review

Readable note.
`, { sourcePath: 'notes/voice.md', requireReviewedForPublicSafe: true });

  assert.equal(safe.allowed, true);
  assert.equal(safe.metadata.title, 'Voice Interaction Review');
  assert.deepEqual(safe.metadata.tags, ['study']);

  const unreviewed = evaluatePublishSafety('---\npublish: true\nvisibility: public-safe\nreviewed: false\n---\n# Draft', {
    requireReviewedForPublicSafe: true,
  });
  assert.equal(unreviewed.allowed, false);
  assert.equal(unreviewed.status, 'skipped');
  assert.match(unreviewed.reasons.join('\n'), /reviewed: true/);

  const unpublished = evaluatePublishSafety('# No frontmatter', {});
  assert.equal(unpublished.allowed, false);
  assert.match(unpublished.reasons.join('\n'), /publish: true/);
});

test('blocks configured terms, internal URLs, and raw executable HTML', () => {
  const result = evaluatePublishSafety(`---
publish: true
visibility: public-safe
reviewed: true
---
# Unsafe

See http://intranet.local/page.
<iframe src="https://example.com"></iframe>
`, {
    blockedTerms: ['DO NOT PUBLISH'],
    blockedUrlFragments: ['intranet'],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.status, 'blocked');
  assert.match(result.reasons.join('\n'), /intranet/);
  assert.match(result.reasons.join('\n'), /iframe/);
});

test('renders web book index, page, safety report, search entry, and manifest', () => {
  const page = {
    title: 'Voice Service Notes',
    slug: 'voice-service-notes-abc123',
    url: 'pages/voice-service-notes-abc123/',
    sourcePath: 'sample-notes/01-system-design.md',
    tags: ['study'],
    visibility: 'public-safe',
    summary: 'A reviewed note.',
    updatedAt: '2026-05-18T00:00:00.000Z',
    readingTimeMinutes: 2,
  };
  const index = renderWebBookIndex({
    siteTitle: 'YSDA Publisher',
    siteDescription: 'Reviewed notes',
    generatedAt: '2026-05-18T00:00:00.000Z',
    pages: [page],
    skipped: [],
  });
  const html = renderWebBookPage({
    ...page,
    siteTitle: 'YSDA Publisher',
    generatedAt: '2026-05-18T00:00:00.000Z',
    articleHtml: '<h2>Overview</h2><p>Body</p>',
  });
  const safetyReport = renderSafetyReport({ generatedAt: '2026-05-18T00:00:00.000Z', pages: [page], skipped: [] });
  const search = buildSearchEntry(page, '# Voice Service Notes\nBody');
  const manifest = buildPublishManifest({ generatedAt: '2026-05-18T00:00:00.000Z', sourceFolder: 'sample-notes', outputFolder: 'html-exports/ysda-publisher', pages: [page], skipped: [] });

  assert.match(index, /YSDA Publisher/);
  assert.match(index, /pages\/voice-service-notes-abc123\//);
  assert.match(html, /Contents/);
  assert.match(html, /id="overview"/);
  assert.match(safetyReport, /All scanned notes passed/);
  assert.equal(search.url, page.url);
  assert.equal(manifest.tool, 'YSDA Publisher');
  assert.equal(manifest.exportedCount, 1);
});
