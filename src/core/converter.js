const path = require('node:path');
const { normalizeImageTarget } = require('./assets.js');
const { escapeHtml, slugify } = require('./html.js');
const { sanitizeHtml } = require('./sanitizer.js');
const { wrapWithTemplate } = require('./templates.js');

function convertMarkdownToHtml(markdown, options = {}) {
  const parsed = splitFrontmatter(markdown);
  const diagnostics = Array.isArray(options.diagnostics) ? options.diagnostics : [];
  const state = createRenderState(options, diagnostics);
  const bodyHtml = blocksToHtml(parsed.body, options, state);
  const frontmatterHtml = parsed.frontmatter
    ? `<pre class="frontmatter">${escapeHtml(parsed.frontmatter)}</pre>\n`
    : '';
  const title = inferTitle(parsed.body, options.sourcePath);
  const html = wrapWithTemplate(`${frontmatterHtml}${bodyHtml}`, {
    template: options.template,
    title,
    trusted: Boolean(options.trusted),
  });

  return sanitizeHtml(html, { trusted: Boolean(options.trusted) });
}

function splitFrontmatter(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: '', body: normalized };
  }

  const closeIndex = normalized.indexOf('\n---\n', 4);
  if (closeIndex === -1) {
    return { frontmatter: '', body: normalized };
  }

  return {
    frontmatter: normalized.slice(4, closeIndex).trim(),
    body: normalized.slice(closeIndex + 5).trimStart(),
  };
}

function inferTitle(markdown, sourcePath) {
  const heading = String(markdown || '').split('\n').find((line) => /^#\s+/.test(line));
  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }
  if (sourcePath) {
    return path.basename(sourcePath, path.extname(sourcePath));
  }
  return 'Exported note';
}

function blocksToHtml(markdown, options = {}, state = createRenderState(options, options.diagnostics)) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (/^```/.test(line)) {
      const language = line.replace(/^```/, '').trim().split(/\s+/)[0];
      const code = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const codeText = escapeHtml(code.join('\n'));
      if (language.toLowerCase() === 'mermaid') {
        blocks.push(`<pre class="mermaid">${codeText}</pre>`);
      } else {
        blocks.push(`<pre><code${language ? ` class="language-${escapeHtml(toClassSuffix(language))}"` : ''}>${codeText}</code></pre>`);
      }
      continue;
    }

    const callout = readCallout(lines, index, options, state);
    if (callout) {
      blocks.push(callout.html);
      index = callout.nextIndex;
      continue;
    }

    const table = readTable(lines, index, options, state);
    if (table) {
      blocks.push(table.html);
      index = table.nextIndex;
      continue;
    }

    const list = readList(lines, index, options, state);
    if (list) {
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const content = heading[2].replace(/\s+#+\s*$/, '').trim();
      const id = buildHeadingId(stripInlineMarkdown(content), state);
      blocks.push(`<h${level} id="${escapeHtml(id)}">${inlineMarkdown(content, options, state)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push('<hr>');
      index += 1;
      continue;
    }

    const blockquote = readBlockquote(lines, index, options, state);
    if (blockquote) {
      blocks.push(blockquote.html);
      index = blockquote.nextIndex;
      continue;
    }

    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${inlineMarkdown(paragraph.join(' '), options, state)}</p>`);
  }

  return blocks.join('\n');
}

function isBlockStart(line) {
  return /^(```|#{1,6}\s+|>\s*|\s*[-*]\s+|\s*\d+\.\s+)/.test(line)
    || /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)
    || readTable([line, '| - |'], 0);
}

function readCallout(lines, start, options = {}, state = createRenderState(options, options.diagnostics)) {
  const match = /^>\s*\[!([A-Za-z0-9_-]+)]\s*(.*)$/.exec(lines[start]);
  if (!match) {
    return null;
  }

  const type = toClassSuffix(match[1].toLowerCase());
  const title = match[2].trim() || match[1].toUpperCase();
  const body = [];
  let index = start + 1;
  while (index < lines.length && /^>/.test(lines[index])) {
    body.push(lines[index].replace(/^>\s?/, ''));
    index += 1;
  }

  return {
    html: `<aside class="callout callout-${escapeHtml(type)}"><div class="callout-title">${escapeHtml(title)}</div><div class="callout-body">${blocksToHtml(body.join('\n'), options, state)}</div></aside>`,
    nextIndex: index,
  };
}

function readTable(lines, start, options = {}, state = createRenderState(options, options.diagnostics)) {
  if (!/^\s*\|.+\|\s*$/.test(lines[start] || '') || !/^\s*\|[\s:-]+\|/.test(lines[start + 1] || '')) {
    return null;
  }

  const rows = [];
  let index = start;
  while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
    rows.push(splitTableRow(lines[index]));
    index += 1;
  }

  const header = rows[0];
  const body = rows.slice(2);
  const headerHtml = `<thead><tr>${header.map((cell) => `<th>${inlineMarkdown(cell, options, state)}</th>`).join('')}</tr></thead>`;
  const bodyHtml = `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell, options, state)}</td>`).join('')}</tr>`).join('')}</tbody>`;

  return {
    html: `<div class="table-wrap"><table>${headerHtml}${bodyHtml}</table></div>`,
    nextIndex: index,
  };
}

function splitTableRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function readList(lines, start, options = {}, state = createRenderState(options, options.diagnostics)) {
  const first = matchListLine(lines[start]);
  if (!first) {
    return null;
  }

  const items = [];
  let index = start;
  while (index < lines.length) {
    const item = matchListLine(lines[index]);
    if (!item || item.indent !== first.indent || item.ordered !== first.ordered) {
      break;
    }

    const childLines = [];
    index += 1;
    while (index < lines.length) {
      const next = matchListLine(lines[index]);
      if (next && next.indent === first.indent) {
        break;
      }
      if (lines[index].trim() && leadingSpaces(lines[index]) <= first.indent) {
        break;
      }
      childLines.push(lines[index].slice(Math.min(lines[index].length, first.indent + 2)));
      index += 1;
    }

    const childHtml = childLines.join('\n').trim()
      ? blocksToHtml(childLines.join('\n'), options, state)
      : '';
    items.push(`<li>${inlineMarkdown(item.content, options, state)}${childHtml ? `\n${childHtml}` : ''}</li>`);
  }

  const tag = first.ordered ? 'ol' : 'ul';
  return {
    html: `<${tag}>${items.join('')}</${tag}>`,
    nextIndex: index,
  };
}

function readBlockquote(lines, start, options, state) {
  if (!/^>\s*/.test(lines[start]) || /^>\s*\[!/.test(lines[start])) {
    return null;
  }

  const body = [];
  let index = start;
  while (index < lines.length && /^>\s*/.test(lines[index])) {
    body.push(lines[index].replace(/^>\s?/, ''));
    index += 1;
  }

  return {
    html: `<blockquote>${blocksToHtml(body.join('\n'), options, state)}</blockquote>`,
    nextIndex: index,
  };
}

function inlineMarkdown(value, options = {}, state = createRenderState(options, options.diagnostics)) {
  const text = String(value || '');
  let html = '';
  let index = 0;

  while (index < text.length) {
    const rest = text.slice(index);
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      html += `<code>${escapeHtml(code[1])}</code>`;
      index += code[0].length;
      continue;
    }

    const embed = /^!\[\[([^\]]+)]]/.exec(rest);
    if (embed) {
      html += renderImageEmbed(embed[1], options, state);
      index += embed[0].length;
      continue;
    }

    const image = /^!\[([^\]]*)]\(([^)]+)\)/.exec(rest);
    if (image) {
      html += renderMarkdownImage(image[1], image[2], options, state);
      index += image[0].length;
      continue;
    }

    const wikilink = /^\[\[([^\]]+)]]/.exec(rest);
    if (wikilink) {
      html += renderWikiLink(wikilink[1], options, state);
      index += wikilink[0].length;
      continue;
    }

    const link = /^\[([^\]]+)]\(([^)]+)\)/.exec(rest);
    if (link) {
      html += renderMarkdownLink(link[1], link[2], options, state);
      index += link[0].length;
      continue;
    }

    const strong = /^\*\*([^*]+)\*\*/.exec(rest);
    if (strong) {
      html += `<strong>${escapeHtml(strong[1])}</strong>`;
      index += strong[0].length;
      continue;
    }

    const emphasis = /^\*([^*\s][^*]*?)\*/.exec(rest);
    if (emphasis) {
      html += `<em>${escapeHtml(emphasis[1])}</em>`;
      index += emphasis[0].length;
      continue;
    }

    html += escapeHtml(text[index]);
    index += 1;
  }

  return html;
}

function renderWikiLink(raw, options, state) {
  const parsed = parseWikiLink(raw);
  if (!parsed.target && parsed.heading) {
    const label = parsed.alias || parsed.heading;
    return `<a class="wikilink" href="#${escapeHtml(slugify(parsed.heading))}">${escapeHtml(label)}</a>`;
  }

  const resolver = typeof options.resolveWikiLink === 'function' ? options.resolveWikiLink : null;
  const resolved = resolver ? resolver(parsed) : null;
  const label = parsed.alias || parsed.heading || parsed.target || raw;
  if (resolved && resolved.href) {
    return `<a class="wikilink" href="${escapeHtml(resolved.href)}">${escapeHtml(label)}</a>`;
  }

  pushDiagnostic(state, {
    type: 'unresolved-wikilink',
    severity: 'warning',
    target: parsed.target,
    heading: parsed.heading,
    message: `Unresolved wikilink: ${parsed.raw}`,
  });
  return `<span class="missing-link" title="Unresolved note link">${escapeHtml(label)}</span>`;
}

function renderImageEmbed(raw, options, state) {
  const [targetPart, aliasPart] = String(raw || '').split('|');
  const target = normalizeImageTarget(targetPart);
  const alt = String(aliasPart || '').trim() || path.basename(target) || target;
  const resolved = resolveImageSource(target, options);
  if (resolved) {
    return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}">`;
  }

  pushDiagnostic(state, {
    type: 'unresolved-image-embed',
    severity: 'warning',
    target,
    message: `Image embed not found: ${target}`,
  });
  return `<span class="missing-asset" role="note">Missing asset: ${escapeHtml(target || raw)}</span>`;
}

function renderMarkdownImage(alt, src, options, state) {
  const target = normalizeImageTarget(src);
  const resolved = resolveImageSource(target, options) || target;
  if (!resolved) {
    pushDiagnostic(state, {
      type: 'unresolved-image-embed',
      severity: 'warning',
      target,
      message: `Image target is empty: ${src}`,
    });
    return `<span class="missing-asset" role="note">Missing asset</span>`;
  }
  return `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}">`;
}

function renderMarkdownLink(label, href, options, state) {
  const target = String(href || '').trim();
  const safeLabel = inlineMarkdown(label, options, state);
  if (/^(?:javascript:|data:text\/html)/i.test(target)) {
    pushDiagnostic(state, {
      type: 'unsafe-link',
      severity: 'warning',
      target,
      message: `Unsafe link suppressed: ${target}`,
    });
    return `<span class="missing-link">${safeLabel}</span>`;
  }
  return `<a href="${escapeHtml(target)}">${safeLabel}</a>`;
}

function resolveImageSource(target, options) {
  if (typeof options.resolveImageEmbed === 'function') {
    return options.resolveImageEmbed(target);
  }

  for (const mapping of options.assetMappings || []) {
    const aliases = mapping.aliases || [];
    if (mapping.original === target || aliases.includes(target) || aliases.includes(normalizeImageTarget(target))) {
      return mapping.relativeSrc;
    }
  }

  return '';
}

function parseWikiLink(raw) {
  const value = String(raw || '').trim();
  const pipeIndex = value.indexOf('|');
  const targetAndHeading = pipeIndex === -1 ? value : value.slice(0, pipeIndex);
  const alias = pipeIndex === -1 ? '' : value.slice(pipeIndex + 1).trim();
  const hashIndex = targetAndHeading.indexOf('#');
  const target = (hashIndex === -1 ? targetAndHeading : targetAndHeading.slice(0, hashIndex)).trim();
  const heading = hashIndex === -1 ? '' : targetAndHeading.slice(hashIndex + 1).trim();
  return { raw: value, target, heading, alias };
}

function createRenderState(_options, diagnostics = []) {
  const values = Array.isArray(diagnostics) ? diagnostics : [];
  return {
    diagnostics: values,
    headingIds: new Map(),
    diagnosticKeys: new Set(values.map((item) => `${item.type}:${item.target || ''}:${item.heading || ''}`)),
  };
}

function pushDiagnostic(state, diagnostic) {
  if (!state || !Array.isArray(state.diagnostics)) {
    return;
  }
  const key = `${diagnostic.type}:${diagnostic.target || ''}:${diagnostic.heading || ''}`;
  if (state.diagnosticKeys.has(key)) {
    return;
  }
  state.diagnosticKeys.add(key);
  state.diagnostics.push(diagnostic);
}

function buildHeadingId(text, state) {
  const base = slugify(text);
  const count = state.headingIds.get(base) || 0;
  state.headingIds.set(base, count + 1);
  return count ? `${base}-${count + 1}` : base;
}

function stripInlineMarkdown(value) {
  return String(value || '')
    .replace(/!\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?]]/g, (_match, target, alias) => alias || target)
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?]]/g, (_match, target, alias) => alias || target)
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

function matchListLine(line) {
  const match = /^(\s*)(?:(\d+)\.|[-*])\s+(.+)$/.exec(line || '');
  if (!match) {
    return null;
  }
  return {
    indent: match[1].replace(/\t/g, '  ').length,
    ordered: Boolean(match[2]),
    content: match[3].trim(),
  };
}

function leadingSpaces(line) {
  const match = /^(\s*)/.exec(line || '');
  return match ? match[1].replace(/\t/g, '  ').length : 0;
}

function toClassSuffix(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'text';
}

module.exports = {
  blocksToHtml,
  convertMarkdownToHtml,
  inferTitle,
  inlineMarkdown,
  parseWikiLink,
  splitFrontmatter,
};
