const { extractMarkdownImageReferences } = require('./assets.js');
const { inferTitle, splitFrontmatter } = require('./converter.js');

const DEFAULT_MARKERS = [
  'CONFIDENTIAL',
  'INTERNAL ONLY',
  'DO NOT PUBLISH',
  '비공개',
  '대외비',
];

function evaluatePublishSafety(markdown, options = {}) {
  const sourcePath = options.sourcePath || '';
  const parsed = splitFrontmatter(markdown);
  const frontmatter = parseFrontmatter(parsed.frontmatter);
  const metadata = buildMetadata(frontmatter, parsed.body, sourcePath, options);
  const reasons = [];
  const warnings = [];
  const diagnostics = [];

  if (frontmatter.publish !== true) {
    reasons.push('Missing publish: true frontmatter.');
  }

  if (metadata.visibility !== 'public-safe') {
    reasons.push(`Visibility is ${metadata.visibility}; public web-book export requires visibility: public-safe.`);
  }

  if (options.requireReviewedForPublicSafe !== false && metadata.visibility === 'public-safe' && frontmatter.reviewed !== true) {
    reasons.push('Public-safe notes require reviewed: true.');
  }

  const text = String(markdown || '');
  for (const term of uniqueStrings([...(options.blockedTerms || []), ...DEFAULT_MARKERS])) {
    if (term && text.toLowerCase().includes(term.toLowerCase())) {
      reasons.push(`Blocked term found: ${term}`);
    }
  }

  for (const fragment of uniqueStrings(options.blockedUrlFragments || [])) {
    if (fragment && text.toLowerCase().includes(fragment.toLowerCase())) {
      reasons.push(`Blocked URL/domain fragment found: ${fragment}`);
    }
  }

  for (const pattern of findInternalLookingUrls(text)) {
    reasons.push(`Internal-looking URL found: ${pattern}`);
  }

  for (const finding of findUnsafeRawHtmlPatterns(parsed.body, { startLine: getBodyStartLine(text) })) {
    const message = formatUnsafeFinding(finding);
    diagnostics.push({
      type: finding.category,
      severity: finding.blocked ? 'error' : 'warning',
      line: finding.line,
      context: finding.context,
      match: finding.match,
      message,
    });
    if (finding.blocked) {
      reasons.push(message);
    } else {
      warnings.push(message);
    }
  }

  const localImages = extractMarkdownImageReferences(text).map((reference) => reference.target);
  if (localImages.length > 0) {
    warnings.push(`Local image references must be bundled: ${localImages.join(', ')}`);
  }

  const blocked = reasons.some((reason) => /Blocked|Internal-looking|script|iframe|javascript|event handlers|require reviewed/i.test(reason));
  const allowed = reasons.length === 0;

  return {
    allowed,
    status: allowed ? 'included' : blocked ? 'blocked' : 'skipped',
    reasons,
    warnings,
    diagnostics,
    metadata,
    body: parsed.body,
    frontmatter,
  };
}

function parseFrontmatter(frontmatterText) {
  const result = {};
  const lines = String(frontmatterText || '').replace(/\r\n/g, '\n').split('\n');
  let activeKey = '';

  for (const line of lines) {
    if (!line.trim() || /^\s*#/.test(line)) {
      continue;
    }
    const listItem = /^\s*-\s*(.+?)\s*$/.exec(line);
    if (listItem && activeKey) {
      result[activeKey] = Array.isArray(result[activeKey]) ? result[activeKey] : [];
      result[activeKey].push(cleanScalar(listItem[1]));
      continue;
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!match) {
      activeKey = '';
      continue;
    }
    activeKey = match[1];
    result[activeKey] = parseScalar(match[2]);
  }

  return result;
}

function buildMetadata(frontmatter, body, sourcePath, options) {
  const visibility = stringValue(frontmatter.visibility) || options.defaultVisibility || 'internal-draft';
  const tags = arrayValue(frontmatter.tags).map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);
  const title = stringValue(frontmatter.title) || inferTitle(body, sourcePath);
  const summary = stringValue(frontmatter.summary) || buildSummary(body);

  return {
    title,
    visibility,
    reviewed: frontmatter.reviewed === true,
    tags,
    summary,
  };
}

function parseScalar(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^(true|yes)$/i.test(trimmed)) {
    return true;
  }
  if (/^(false|no)$/i.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1)
      .split(',')
      .map(cleanScalar)
      .filter(Boolean);
  }
  return cleanScalar(trimmed);
}

function cleanScalar(value) {
  return String(value || '').trim().replace(/^["']|["']$/g, '');
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function arrayValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim());
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function buildSummary(markdown) {
  return String(markdown || '')
    .replace(/^#\s+.+$/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[\[[^\]]+]]/g, '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/\[[^\]]+]\([^)]+\)/g, '$1')
    .replace(/[#*_`>~-]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 220);
}

function findInternalLookingUrls(text) {
  const findings = [];
  const urlPattern = /\bhttps?:\/\/[^\s)>"']+/gi;
  for (const match of String(text || '').matchAll(urlPattern)) {
    const url = match[0];
    if (/\/\/(?:localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[0-1])\.|[^/\s]+(?:\.local|\.internal))(?:[:/]|$)/i.test(url)) {
      findings.push(url);
    }
  }
  return findings;
}

function findUnsafeRawHtmlPatterns(markdown, options = {}) {
  const findings = [];
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const startLine = Math.max(1, Number(options.startLine) || 1);
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = startLine + index;
    if (/^\s*(```|~~~)/.test(line)) {
      scanCodeExampleLine(line, lineNumber, findings);
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      scanCodeExampleLine(line, lineNumber, findings);
      continue;
    }

    for (const span of extractInlineCodeSpans(line)) {
      scanCodeExampleLine(span.text, lineNumber, findings);
    }

    scanRenderedLine(stripInlineCodeSpansForSafety(line), lineNumber, findings);
  }

  return findings;
}

function getBodyStartLine(markdown) {
  const normalized = String(markdown || '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return 1;
  }
  const closeIndex = normalized.indexOf('\n---\n', 4);
  if (closeIndex === -1) {
    return 1;
  }
  const bodyStartIndex = closeIndex + 5;
  const leadingBlankLines = (/^\n*/.exec(normalized.slice(bodyStartIndex)) || [''])[0].length;
  return normalized.slice(0, bodyStartIndex + leadingBlankLines).split('\n').length;
}

function scanRenderedLine(line, lineNumber, findings) {
  const text = String(line || '');

  for (const match of text.matchAll(/<\s*(script|iframe)\b[^>]*>/gi)) {
    findings.push(buildFinding({
      category: `${match[1].toLowerCase()}-tag`,
      context: 'rendered-raw-html',
      line: lineNumber,
      match: match[0],
      blocked: true,
    }));
  }

  for (const match of text.matchAll(/<[^>\n]*\s(on[a-z][\w:-]*)\s*=/gi)) {
    findings.push(buildFinding({
      category: 'inline-event-handler',
      context: 'rendered-raw-html',
      line: lineNumber,
      match: match[1],
      blocked: true,
    }));
  }

  for (const match of text.matchAll(/<[^>\n]*\s([a-z][\w:-]*)\s*=\s*(?:"\s*javascript:|'\s*javascript:|javascript:)/gi)) {
    findings.push(buildFinding({
      category: 'javascript-url',
      context: 'rendered-raw-html',
      line: lineNumber,
      match: match[1],
      blocked: true,
    }));
  }

  for (const match of text.matchAll(/!?\[[^\]]*]\(\s*<?\s*javascript:/gi)) {
    findings.push(buildFinding({
      category: 'javascript-url',
      context: 'rendered-markdown-link',
      line: lineNumber,
      match: match[0],
      blocked: true,
    }));
  }
}

function scanCodeExampleLine(line, lineNumber, findings) {
  const text = String(line || '');
  if (/javascript:/i.test(text)) {
    findings.push(buildFinding({
      category: 'javascript-url',
      context: 'code-example',
      line: lineNumber,
      match: 'javascript:',
      blocked: false,
    }));
  }

  for (const match of text.matchAll(/<[^>\n]*\s(on[a-z][\w:-]*)\s*=/gi)) {
    findings.push(buildFinding({
      category: 'inline-event-handler',
      context: 'code-example',
      line: lineNumber,
      match: match[1],
      blocked: false,
    }));
  }
}

function extractInlineCodeSpans(line) {
  const spans = [];
  for (const match of String(line || '').matchAll(/`([^`]+)`/g)) {
    spans.push({ text: match[1], index: match.index || 0 });
  }
  return spans;
}

function stripInlineCodeSpansForSafety(line) {
  return String(line || '').replace(/`[^`]+`/g, (match) => ' '.repeat(match.length));
}

function buildFinding(input) {
  return {
    category: input.category,
    context: input.context,
    line: input.line,
    match: input.match,
    blocked: Boolean(input.blocked),
  };
}

function formatUnsafeFinding(finding) {
  const status = finding.blocked ? 'blocked' : 'warning';
  const context = finding.context === 'code-example'
    ? 'code/example context'
    : finding.context;
  const action = finding.blocked
    ? 'Unsafe raw rendered content is not allowed in public-safe folder export'
    : 'Unsafe-looking text appeared in code/example context and was not blocked';
  return `Line ${finding.line}: ${finding.category} ${status} in ${context} (${finding.match}): ${action}.`;
}

function uniqueStrings(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

module.exports = {
  buildSummary,
  evaluatePublishSafety,
  findUnsafeRawHtmlPatterns,
  parseFrontmatter,
};
