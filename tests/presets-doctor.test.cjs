const test = require('node:test');
const assert = require('node:assert/strict');

const { listExportPresets, findExportPreset } = require('../src/core/presets.js');
const { checkClaudeProvider, cleanDoctorOutput } = require('../src/core/provider-doctor.js');

test('ships beginner-facing HTML value presets', () => {
  const presets = listExportPresets();
  const ids = presets.map((preset) => preset.id);

  assert.deepEqual(ids, [
    'readable-note',
    'interactive-report',
    'presentation',
    'decision-memo',
    'shareable-article',
  ]);
  assert.equal(findExportPreset('interactive-report').previewSecurity, 'trusted');
  assert.equal(findExportPreset('shareable-article').mode, 'blog');
  assert.equal(findExportPreset('missing'), null);
});

test('doctor output is concise for modal display', () => {
  const cleaned = cleanDoctorOutput('\nline 1\n\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\n');

  assert.equal(cleaned, 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6');
});

test('Claude doctor reports missing CLI', async () => {
  const result = await checkClaudeProvider({
    runCommand: async () => ({ code: -1, output: 'spawn claude ENOENT' }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'missing');
  assert.match(result.message, /ENOENT/);
});

test('Claude doctor reports login failures from probe output', async () => {
  const calls = [];
  const result = await checkClaudeProvider({
    runCommand: async (_command, args) => {
      calls.push(args.join(' '));
      return calls.length === 1
        ? { code: 0, output: '2.1.138 (Claude Code)' }
        : { code: 1, output: 'Not logged in · Please run /login' };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'not-logged-in');
  assert.match(result.message, /\/login/);
  assert.equal(result.version, '2.1.138 (Claude Code)');
});

test('Claude doctor reports ready and unexpected-output states', async () => {
  const ready = await checkClaudeProvider({
    runCommand: async (_command, args) => args.includes('--version')
      ? { code: 0, output: '2.1.138 (Claude Code)' }
      : { code: 0, output: 'MARKTL_OK' },
  });
  const unexpected = await checkClaudeProvider({
    runCommand: async (_command, args) => args.includes('--version')
      ? { code: 0, output: '2.1.138 (Claude Code)' }
      : { code: 0, output: 'hello' },
  });

  assert.equal(ready.ok, true);
  assert.equal(ready.status, 'ready');
  assert.equal(unexpected.ok, false);
  assert.equal(unexpected.status, 'unexpected-output');
});
