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

function buildShareHomeUrl(baseUrl, basePath) {
  const root = String(baseUrl || '').trim().replace(/\/+$/g, '');
  if (!root) {
    return '';
  }
  const suffix = normalizePublishPath(basePath);
  return `${root}/${suffix ? `${encodePathPart(suffix)}/` : ''}`;
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

function updateShareIndex(existingIndex, entry) {
  const now = entry.updatedAt || new Date().toISOString();
  const current = Array.isArray(existingIndex?.items) ? existingIndex.items : [];
  const items = [
    {
      ...entry,
      updatedAt: now,
    },
    ...current.filter((item) => item && item.slug !== entry.slug),
  ].sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));

  return {
    version: 1,
    updatedAt: now,
    items,
  };
}

function renderShareIndexHtml(index, options = {}) {
  const title = options.title || 'MarkTL Shared HTML';
  const baseUrl = String(options.baseUrl || '').replace(/\/+$/g, '');
  const items = Array.isArray(index?.items) ? index.items : [];
  const list = items.map((item) => {
    const href = item.url || (baseUrl ? `${baseUrl}/${encodeURIComponent(item.slug)}/` : `${encodeURIComponent(item.slug)}/`);
    return `<article class="item"><a href="${escapeHtml(href)}">${escapeHtml(item.title || item.slug)}</a><span>${escapeHtml(item.updatedAt || '')}</span><p>${escapeHtml(item.sourcePath || '')}</p></article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f7f7f4;color:#1f2933}
main{max-width:960px;margin:0 auto;padding:40px 20px}
h1{font-size:34px;margin:0 0 8px}.meta{color:#68737d;margin:0 0 24px}
.item{background:#fff;border:1px solid #dde2e6;border-radius:8px;margin:12px 0;padding:16px}
.item a{color:#174ea6;font-size:20px;font-weight:700;text-decoration:none}.item span{display:block;color:#68737d;margin-top:6px}.item p{color:#4b5563;margin:8px 0 0}
</style>
</head>
<body><main><h1>${escapeHtml(title)}</h1><p class="meta">${items.length} published document(s)</p>${list || '<p>No published documents yet.</p>'}</main></body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  buildPagesUrl,
  buildPublishPath,
  buildShareHomeUrl,
  inferPagesBaseUrl,
  mimeTypeForPath,
  normalizePublishPath,
  parseRepo,
  renderShareIndexHtml,
  updateShareIndex,
};
