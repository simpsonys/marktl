const path = require('node:path');
const { buildAssetFileName, extractMarkdownImageReferences, rewriteHtmlImageSources } = require('./assets.js');
const { convertMarkdownToHtml } = require('./converter.js');
const { slugify } = require('./html.js');
const { buildPublishManifest } = require('./publishManifest.js');
const { evaluatePublishSafety } = require('./publishSafety.js');
const { buildSearchEntry } = require('./searchIndex.js');
const { renderSafetyReport, renderWebBookIndex, renderWebBookPage } = require('../templates/ysdaWebBook.js');

const DEFAULT_WEB_BOOK_OPTIONS = {
  sourceFolder: 'sample-notes',
  outputFolder: 'html-exports/ysda-publisher',
  siteTitle: 'YSDA Publisher',
  siteDescription: 'Reviewed Markdown notes published as a static web book.',
  defaultVisibility: 'public-safe',
  requireReviewedForPublicSafe: true,
  blockedTerms: [
    'CONFIDENTIAL',
    'INTERNAL ONLY',
    'DO NOT PUBLISH',
    '비공개',
    '대외비',
  ],
  blockedUrlFragments: [
    '.local',
    '.internal',
    'intranet',
    'localhost',
  ],
  cleanOutput: true,
};

async function exportWebBook(options = {}) {
  const adapter = options.adapter;
  if (!adapter) {
    throw new Error('exportWebBook requires an adapter.');
  }

  const config = {
    ...DEFAULT_WEB_BOOK_OPTIONS,
    ...options,
    blockedTerms: normalizeList(options.blockedTerms, DEFAULT_WEB_BOOK_OPTIONS.blockedTerms),
    blockedUrlFragments: normalizeList(options.blockedUrlFragments, DEFAULT_WEB_BOOK_OPTIONS.blockedUrlFragments),
    requireReviewedForPublicSafe: parseBooleanOption(options.requireReviewedForPublicSafe, DEFAULT_WEB_BOOK_OPTIONS.requireReviewedForPublicSafe),
    cleanOutput: parseBooleanOption(options.cleanOutput, DEFAULT_WEB_BOOK_OPTIONS.cleanOutput),
  };
  const sourceFolder = normalizePath(config.sourceFolder);
  const outputFolder = normalizePath(config.outputFolder);
  const generatedAt = config.generatedAt || new Date().toISOString();
  const progress = typeof config.onProgress === 'function' ? config.onProgress : () => {};

  if (!sourceFolder) {
    throw new Error('Source folder is required.');
  }
  if (!outputFolder) {
    throw new Error('Output folder is required.');
  }

  progress(`Source folder: ${sourceFolder}`);
  progress(`Output folder: ${outputFolder}`);

  if (config.cleanOutput && adapter.removeDir) {
    await adapter.removeDir(outputFolder);
  }
  await adapter.ensureDir(outputFolder);
  await adapter.writeText(joinPath(outputFolder, '.nojekyll'), '');

  const markdownFiles = (await adapter.listMarkdownFiles(sourceFolder))
    .map((file) => ({
      path: normalizePath(file.path || file),
      mtime: file.mtime,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  progress(`Scanning ${markdownFiles.length} Markdown note(s)...`);

  const pages = [];
  const skipped = [];
  const warnings = [];
  const searchEntries = [];
  const pageHtmlBySlug = new Map();
  const slugCounts = new Map();

  for (const file of markdownFiles) {
    progress(`Checking ${file.path}...`);
    const markdown = await adapter.readText(file.path);
    const safety = evaluatePublishSafety(markdown, {
      sourcePath: file.path,
      defaultVisibility: config.defaultVisibility,
      requireReviewedForPublicSafe: config.requireReviewedForPublicSafe,
      blockedTerms: config.blockedTerms,
      blockedUrlFragments: config.blockedUrlFragments,
    });

    if (!safety.allowed) {
      skipped.push({
        title: safety.metadata.title,
        sourcePath: file.path,
        status: safety.status,
        visibility: safety.metadata.visibility,
        reasons: safety.reasons,
        warnings: safety.warnings,
      });
      continue;
    }

    const slug = buildWebBookSlug(file.path, sourceFolder, safety.metadata.title, slugCounts);
    const pageFolder = joinPath(outputFolder, 'pages', slug);
    const assetFolder = joinPath(pageFolder, 'assets');
    const assetResult = await resolveImageAssets(markdown, {
      sourcePath: file.path,
      assetFolder,
      assetRelativePrefix: 'assets',
      adapter,
    });

    if (assetResult.warnings.length > 0) {
      skipped.push({
        title: safety.metadata.title,
        sourcePath: file.path,
        status: 'blocked',
        visibility: safety.metadata.visibility,
        reasons: assetResult.warnings,
        warnings: safety.warnings,
      });
      continue;
    }

    const converted = convertMarkdownToHtml(markdown, {
      template: 'ysda-web-book',
      trusted: false,
      sourcePath: file.path,
    });
    const articleHtml = extractArticleHtml(rewriteHtmlImageSources(converted, assetResult.mappings));
    const pageUrl = `pages/${slug}/`;
    const pageRecord = {
      title: safety.metadata.title,
      slug,
      url: pageUrl,
      sourcePath: file.path,
      tags: safety.metadata.tags,
      visibility: safety.metadata.visibility,
      updatedAt: file.mtime ? new Date(file.mtime).toISOString() : generatedAt,
      summary: safety.metadata.summary,
      readingTimeMinutes: estimateReadingTime(safety.body || markdown),
      warnings: [...safety.warnings],
    };

    pages.push(pageRecord);
    searchEntries.push(buildSearchEntry(pageRecord, safety.body || markdown));
    pageHtmlBySlug.set(slug, articleHtml);
    await copyImageAssets(assetResult.mappings, adapter);
  }

  for (const [index, page] of pages.entries()) {
    const pagePath = joinPath(outputFolder, page.url, 'index.html');
    await adapter.writeText(pagePath, renderWebBookPage({
      ...page,
      previous: index > 0 ? pages[index - 1] : null,
      next: index < pages.length - 1 ? pages[index + 1] : null,
      articleHtml: pageHtmlBySlug.get(page.slug) || '',
      generatedAt,
      siteTitle: config.siteTitle,
    }));
  }

  const manifest = buildPublishManifest({
    generatedAt,
    sourceFolder,
    outputFolder,
    pages,
    skipped,
    warnings,
  });
  const safetyReport = {
    generatedAt,
    sourceFolder,
    outputFolder,
    summary: {
      exportedCount: pages.length,
      skippedCount: skipped.filter((item) => item.status !== 'blocked').length,
      blockedCount: skipped.filter((item) => item.status === 'blocked').length,
    },
    pages,
    skipped,
    warnings,
  };

  await adapter.writeText(joinPath(outputFolder, 'search.json'), JSON.stringify(searchEntries, null, 2));
  await adapter.writeText(joinPath(outputFolder, 'publish-manifest.json'), JSON.stringify(manifest, null, 2));
  await adapter.writeText(joinPath(outputFolder, 'safety-report.json'), JSON.stringify(safetyReport, null, 2));
  await adapter.writeText(joinPath(outputFolder, 'safety-report.html'), renderSafetyReport(safetyReport, {
    siteTitle: config.siteTitle,
  }));
  await adapter.writeText(joinPath(outputFolder, 'index.html'), renderWebBookIndex({
    siteTitle: config.siteTitle,
    siteDescription: config.siteDescription,
    generatedAt,
    pages,
    skipped,
    warnings,
  }));

  return {
    generatedAt,
    sourceFolder,
    outputFolder,
    exportedCount: manifest.exportedCount,
    skippedCount: manifest.skippedCount,
    blockedCount: manifest.blockedCount,
    pages,
    skipped,
    warnings,
    manifest,
    safetyReport,
    searchEntries,
  };
}

async function resolveImageAssets(markdown, options) {
  const references = extractMarkdownImageReferences(markdown);
  const warnings = [];
  const mappings = [];
  const usedNames = new Set();

  for (const reference of references) {
    const target = String(reference.target || '');
    const resolved = await options.adapter.resolveAsset(target, options.sourcePath);
    if (!resolved) {
      warnings.push(`Image asset not found: ${target}`);
      continue;
    }

    const assetFileName = buildAssetFileName(resolved.path, mappings.length + 1, usedNames);
    const destinationPath = joinPath(options.assetFolder, assetFileName);
    const relativeSrc = encodeURI(joinPath(options.assetRelativePrefix, assetFileName));

    mappings.push({
      original: target,
      sourcePath: resolved.path,
      destinationPath,
      relativeSrc,
      aliases: [
        target,
        String(reference.raw || ''),
        resolved.path,
        path.basename(resolved.path),
        normalizePath(target),
      ],
    });
  }

  return { mappings, warnings };
}

async function copyImageAssets(mappings, adapter) {
  const copied = new Set();
  for (const mapping of mappings) {
    if (copied.has(mapping.destinationPath)) {
      continue;
    }
    copied.add(mapping.destinationPath);
    const data = await adapter.readBinary(mapping.sourcePath);
    await adapter.writeBinary(mapping.destinationPath, data);
  }
}

function createNodeWebBookAdapter(fs, rootDir = process.cwd()) {
  const root = path.resolve(rootDir);
  return {
    async listMarkdownFiles(sourceFolder) {
      const absoluteSource = resolveInsideRoot(root, sourceFolder);
      const files = [];
      await walkMarkdownFiles(absoluteSource, files, root);
      return files;
    },
    async readText(filePath) {
      return fs.promises.readFile(resolveInsideRoot(root, filePath), 'utf8');
    },
    async writeText(filePath, text) {
      const absolutePath = resolveInsideRoot(root, filePath);
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, text, 'utf8');
    },
    async readBinary(filePath) {
      return fs.promises.readFile(resolveInsideRoot(root, filePath));
    },
    async writeBinary(filePath, data) {
      const absolutePath = resolveInsideRoot(root, filePath);
      await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.promises.writeFile(absolutePath, data);
    },
    async ensureDir(folderPath) {
      await fs.promises.mkdir(resolveInsideRoot(root, folderPath), { recursive: true });
    },
    async removeDir(folderPath) {
      const absolutePath = resolveInsideRoot(root, folderPath);
      await fs.promises.rm(absolutePath, { recursive: true, force: true });
    },
    async resolveAsset(target, sourcePath) {
      return resolveNodeAsset(fs, root, target, sourcePath);
    },
  };
}

async function walkMarkdownFiles(directory, files, root) {
  let entries = [];
  try {
    entries = await require('node:fs').promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(absolutePath, files, root);
      continue;
    }
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') {
      continue;
    }
    const stat = await require('node:fs').promises.stat(absolutePath);
    files.push({
      path: normalizePath(path.relative(root, absolutePath)),
      mtime: stat.mtimeMs,
    });
  }
}

async function resolveNodeAsset(fs, root, target, sourcePath) {
  const candidates = [];
  const normalizedTarget = normalizePath(target);
  if (normalizedTarget) {
    candidates.push(normalizedTarget);
  }
  if (sourcePath) {
    candidates.push(normalizePath(path.join(path.dirname(sourcePath), target)));
  }

  for (const candidate of candidates) {
    try {
      const absolutePath = resolveInsideRoot(root, candidate);
      const stat = await fs.promises.stat(absolutePath);
      if (stat.isFile()) {
        return { path: normalizePath(path.relative(root, absolutePath)) };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function resolveInsideRoot(root, filePath) {
  const absolutePath = path.resolve(root, filePath || '.');
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path is outside the export root: ${filePath}`);
  }
  return absolutePath;
}

function buildWebBookSlug(sourcePath, sourceFolder, title, counts) {
  const folder = normalizePath(sourceFolder).replace(/\/+$/g, '');
  const relative = normalizePath(sourcePath).replace(new RegExp(`^${escapeRegExp(folder)}/?`), '');
  const base = slugify(relative.replace(/\.md$/i, '') || title || sourcePath);
  const hash = shortHash(relative || sourcePath);
  const candidate = `${base}-${hash}`;
  const count = counts.get(candidate) || 0;
  counts.set(candidate, count + 1);
  return count > 0 ? `${candidate}-${count + 1}` : candidate;
}

function estimateReadingTime(markdown) {
  return Math.max(1, Math.ceil(String(markdown || '').split(/\s+/).filter(Boolean).length / 220));
}

function extractArticleHtml(html) {
  const match = /<article[^>]*>\s*([\s\S]*?)\s*<\/article>/i.exec(String(html || ''));
  return (match ? match[1] : String(html || '')).replace(/<pre class="frontmatter">[\s\S]*?<\/pre>\s*/i, '').trim();
}

function normalizeList(value, fallback) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }
  return fallback;
}

function parseBooleanOption(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (/^(true|yes|1)$/i.test(value)) {
      return true;
    }
    if (/^(false|no|0)$/i.test(value)) {
      return false;
    }
  }
  return fallback;
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/g, '');
}

function joinPath(...parts) {
  return normalizePath(parts.filter(Boolean).join('/'));
}

function shortHash(value) {
  let hash = 5381;
  for (const char of String(value || '')) {
    hash = ((hash << 5) + hash) + char.charCodeAt(0);
    hash >>>= 0;
  }
  return hash.toString(36).slice(0, 6);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  DEFAULT_WEB_BOOK_OPTIONS,
  buildWebBookSlug,
  createNodeWebBookAdapter,
  exportWebBook,
  extractArticleHtml,
  normalizePath,
  parseBooleanOption,
};
