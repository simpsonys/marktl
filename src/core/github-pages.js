const path = require('node:path');

function parseRepo(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const [owner, repo] = cleaned.split('/');
  if (!owner || !repo) {
    return null;
  }
  return { owner, repo };
}

function normalizePublishPath(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/');
}

function buildPublishPath(basePath, slug, filePath) {
  return [normalizePublishPath(basePath), slug, filePath]
    .filter(Boolean)
    .join('/')
    .replace(/\/+/g, '/');
}

function buildPagesUrl(baseUrl, basePath, slug) {
  const root = String(baseUrl || '').trim().replace(/\/+$/g, '');
  if (!root) {
    return '';
  }
  const suffix = [normalizePublishPath(basePath), slug]
    .filter(Boolean)
    .map((part) => encodePathPart(part))
    .join('/');
  return `${root}/${suffix ? `${suffix}/` : ''}`;
}

function encodePathPart(value) {
  return String(value || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function inferPagesBaseUrl(repoValue) {
  const repo = parseRepo(repoValue);
  if (!repo) {
    return '';
  }
  if (repo.repo.toLowerCase() === `${repo.owner.toLowerCase()}.github.io`) {
    return `https://${repo.repo}`;
  }
  return `https://${repo.owner}.github.io/${repo.repo}`;
}

function mimeTypeForPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  }[extension] || 'application/octet-stream';
}

module.exports = {
  buildPagesUrl,
  buildPublishPath,
  inferPagesBaseUrl,
  mimeTypeForPath,
  normalizePublishPath,
  parseRepo,
};
