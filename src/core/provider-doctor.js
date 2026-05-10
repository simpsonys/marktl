const { spawn } = require('node:child_process');
const { mergePath } = require('./ai.js');

async function checkClaudeProvider(options = {}) {
  const command = options.command || 'claude';
  const timeoutMs = Number(options.timeoutMs || 15_000);
  const runner = options.runCommand || runCommand;

  const version = await runner(command, ['--version'], timeoutMs);
  if (version.code !== 0) {
    return {
      ok: false,
      status: 'missing',
      message: cleanDoctorOutput(version.output) || 'Claude Code CLI was not found or did not start.',
      version: '',
    };
  }

  const probe = await runner(command, ['-p', 'Return only this exact text: MARKTL_OK'], timeoutMs);
  if (probe.code !== 0) {
    const output = cleanDoctorOutput(probe.output);
    return {
      ok: false,
      status: output.toLowerCase().includes('not logged in') ? 'not-logged-in' : 'probe-failed',
      message: output || 'Claude Code CLI is installed, but the login probe failed.',
      version: cleanDoctorOutput(version.output),
    };
  }

  return {
    ok: /MARKTL_OK/i.test(probe.output),
    status: /MARKTL_OK/i.test(probe.output) ? 'ready' : 'unexpected-output',
    message: /MARKTL_OK/i.test(probe.output)
      ? 'Claude Code CLI is installed, logged in, and ready.'
      : cleanDoctorOutput(probe.output) || 'Claude Code CLI responded, but not with the expected probe text.',
    version: cleanDoctorOutput(version.output),
  };
}

function runCommand(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        PATH: mergePath(process.env.PATH),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGTERM');
      resolve({ code: -1, output: `Provider doctor timed out after ${timeoutMs}ms.` });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code: -1, output: error.message });
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve({ code: code || 0, output });
    });
  });
}

function cleanDoctorOutput(value = '') {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join('\n');
}

module.exports = {
  checkClaudeProvider,
  cleanDoctorOutput,
  runCommand,
};
