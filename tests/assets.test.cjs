const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAiAssetInstruction,
  buildAssetFileName,
  extractMarkdownImageReferences,
  rewriteHtmlImageSources,
} = require('../src/core/assets.js');

test('extracts local Obsidian and Markdown image references only', () => {
  const references = extractMarkdownImageReferences(`
![[diagram.png]]
![[Attachments/시장 전략.webp|Market strategy]]
![Chart](charts/revenue growth.png)
![Remote](https://example.com/remote.png)
![Inline](data:image/png;base64,abc)
`);

  assert.deepEqual(references.map((reference) => reference.target), [
    'diagram.png',
    'Attachments/시장 전략.webp',
    'charts/revenue growth.png',
  ]);
  assert.equal(references[1].raw, 'Attachments/시장 전략.webp|Market strategy');
});

test('builds collision-safe asset names', () => {
  const used = new Set();

  assert.equal(buildAssetFileName('Attachments/My Chart.png', 1, used), 'my-chart.png');
  assert.equal(buildAssetFileName('Other/My Chart.png', 2, used), 'my-chart-2.png');
  assert.equal(buildAssetFileName('이미지 파일.webp', 3, used), '이미지-파일.webp');
});

test('rewrites HTML image src values to bundled asset paths', () => {
  const html = '<main><img src="./diagram.png" alt=""><img src="charts/revenue%20growth.png"><img src="https://example.com/x.png"></main>';
  const rewritten = rewriteHtmlImageSources(html, [
    {
      relativeSrc: 'note-assets/diagram.png',
      aliases: ['diagram.png'],
    },
    {
      relativeSrc: 'note-assets/revenue-growth.png',
      aliases: ['charts/revenue growth.png'],
    },
  ]);

  assert.match(rewritten, /src="note-assets\/diagram\.png"/);
  assert.match(rewritten, /src="note-assets\/revenue-growth\.png"/);
  assert.match(rewritten, /src="https:\/\/example\.com\/x\.png"/);
});

test('adds asset mapping guidance to AI prompts', () => {
  const instruction = buildAiAssetInstruction([
    { original: 'diagram.png', relativeSrc: 'note-assets/diagram.png' },
  ]);

  assert.match(instruction, /Local image assets are available/);
  assert.match(instruction, /diagram\.png: note-assets\/diagram\.png/);
});
