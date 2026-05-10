const path = require('node:path');
const { slugify } = require('./html.js');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp']);

function extractMarkdownImageReferences(markdown) {
  const references = [];
  const seen = new Set();
  const text = String(markdown || '');

  for (const match of text.matchAll(/!\[\[([^\]]+)]]/g)) {
    const raw = String(match[1] || '').trim();
    const target = normalizeImageTarget(raw);
    addReference(references, seen, target, raw);
  }

  for (const match of text.matchAll(/!\[([^\]]*)]\(([^)]+)\)/g)) {
    const raw = String(match[2] || '').trim();
    const target = normalizeImageTarget(raw);
    addReference(references, seen, target, raw);
  }

  return references;
}

function normalizeImageTarget(value) {
  let target = String(value || '').trim();
  if (target.startsWith('<') && target.endsWith('>')) {
    target = target.slice(1, -1).trim();
  }
  target = target.split('|')[0].trim();
  target = target.split('#')[0].trim();
  return decodeUriSafely(target);
}

function isLocalImageTarget(target) {
  const value = String(target || '').trim();
  if (!value || /^(?:https?:|data:|blob:|mailto:|#)/i.test(value)) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(path.extname(value).toLowerCase());
}

function buildAssetFileName(originalPath, index, used = new Set()) {
  const extension = path.extname(originalPath).toLowerCase();
  const base = slugify(path.basename(originalPath, path.extname(originalPath))) || `image-${index}`;
  let candidate = `${base}${extension}`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}${extension}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function rewriteHtmlImageSources(html, mappings) {
  const replacements = buildReplacementMap(mappings);
  if (replacements.size === 0) {
    return String(html || '');
  }

  return String(html || '').replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi, (match, prefix, quote, src) => {
    const normalized = normalizeImageTarget(src);
    const replacement = replacements.get(src) || replacements.get(normalized) || replacements.get(decodeUriSafely(src));
    if (!replacement) {
      return match;
    }
    return `${prefix}${quote}${replacement}${quote}`;
  });
}

function buildAiAssetInstruction(mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return '';
  }
  const lines = mappings
    .map((mapping) => `- ${mapping.original}: ${mapping.relativeSrc}`)
    .join('\n');
  return `\nLocal image assets are available. Preserve these images and use the mapped src values exactly:\n${lines}`;
}

function buildReplacementMap(mappings) {
  const replacements = new Map();
  for (const mapping of mappings || []) {
    if (!mapping || !mapping.relativeSrc) {
      continue;
    }
    for (const key of mapping.aliases || []) {
      if (key) {
        replacements.set(key, mapping.relativeSrc);
        replacements.set(`./${key}`, mapping.relativeSrc);
        replacements.set(encodeURI(key), mapping.relativeSrc);
        replacements.set(`./${encodeURI(key)}`, mapping.relativeSrc);
      }
    }
  }
  return replacements;
}

function addReference(references, seen, target, raw) {
  if (!isLocalImageTarget(target) || seen.has(target)) {
    return;
  }
  seen.add(target);
  references.push({ target, raw });
}

function decodeUriSafely(value) {
  try {
    return decodeURI(String(value || ''));
  } catch {
    return String(value || '');
  }
}

module.exports = {
  buildAiAssetInstruction,
  buildAssetFileName,
  extractMarkdownImageReferences,
  isLocalImageTarget,
  normalizeImageTarget,
  rewriteHtmlImageSources,
};
