# YSDA Publisher MVP

YSDA Publisher is a fork direction from MarkTL. It keeps the active-note HTML export, then adds a folder-level static web-book export for reviewed Markdown notes.

The MVP is generic. It can publish study notes, project notes, decision memos, weekly digests, and other reviewed Markdown collections. Examples use neutral terms such as Voice Assistant, Voice Service, and Voice Interaction.

## Publishable Note Frontmatter

Only reviewed public-safe notes are included in folder export:

```yaml
---
publish: true
visibility: public-safe
reviewed: true
tags: [study, system-design]
summary: Short optional summary for the index.
---
```

Notes without `publish: true` are skipped. Public-safe notes without `reviewed: true` are skipped when the default review requirement is enabled.

## Active Note Export

Use the command palette:

```text
YSDA Publisher: Export active note to HTML
```

This preserves the existing single-note MarkTL export path, including local fallback conversion, optional AI CLI conversion, preview, image bundling, static bundle export, and GitHub Pages export settings.

## Folder Web-Book Export

Configure these settings in YSDA Publisher settings:

- `Web-book source folder`: vault-relative folder to scan recursively.
- `Web-book output folder`: defaults to `html-exports/ysda-publisher`.
- `Web-book site title`: defaults to `YSDA Publisher`.
- `Web-book description`: rendered on the generated index.
- `Blocked terms`: one term per line.
- `Blocked URL/domain fragments`: one fragment per line.

Then run:

```text
YSDA Publisher: Export folder as web book
```

## Command-line Export

Run the sample export from a terminal:

```bash
npm run export:webbook:sample
```

Run with custom source and output folders:

```bash
npm run export:webbook -- --source sample-notes --output html-exports/ysda-publisher
```

The CLI defaults are:

- source: `sample-notes`
- output: `html-exports/ysda-publisher`
- site title: `YSDA Publisher`
- default visibility: `public-safe`
- require reviewed: `true`

Preview the generated static site locally:

```bash
python3 -m http.server 8080 -d html-exports/ysda-publisher
```

Then open `http://localhost:8080/`.

Manual safety blocking test:

```bash
cat > sample-notes/99-block-test.md <<'EOF'
---
publish: true
visibility: public-safe
reviewed: false
title: Block Test
---

# Block Test

This note should be blocked because reviewed is false.
EOF

npm run export:webbook:sample

grep -R "blocked\|Block Test\|reviewed" -n html-exports/ysda-publisher/safety-report.html html-exports/ysda-publisher/safety-report.json html-exports/ysda-publisher/publish-manifest.json | head -80

rm sample-notes/99-block-test.md
npm run export:webbook:sample
```

The blocked count should increase while `99-block-test.md` exists and return to zero after removal.

## Output Structure

The folder export writes a static artifact:

```text
html-exports/ysda-publisher/
  .nojekyll
  index.html
  search.json
  publish-manifest.json
  safety-report.html
  safety-report.json
  pages/
    <slug>/
      index.html
      assets/
        ...
```

Open `index.html` to read the web book. The manifest records exported, skipped, and blocked notes for traceability.

## Safety Gate

The MVP safety gate blocks or skips notes before export. It checks:

- missing `publish: true`
- missing or non-public-safe visibility
- public-safe notes without `reviewed: true`
- configured blocked terms
- configured blocked URL/domain fragments
- internal-looking URLs such as localhost, private IP URLs, `.local`, and `.internal`
- raw `<script>` or `<iframe>` HTML
- inline event handlers or `javascript:` URLs
- unresolved local images that cannot be bundled

The safety report is generated even when all notes pass.

## Known Limitations

- Markdown compatibility is intentionally basic and follows the existing converter.
- Obsidian wikilinks, Mermaid, callouts, heading anchors, and table rendering need hardening in the next milestone.
- Folder export does not publish to GitHub Pages directly; it creates a static folder ready for hosting.
- Search output is generated and the index has simple filtering, but there is no full search UI yet.
- Broken non-image links are not deeply diagnosed in this MVP.
- Command-line export cleans the output folder before writing so stale page files from removed source notes do not remain.

## Next Milestone

Milestone 2 should focus on Markdown compatibility and UX hardening: stronger Obsidian syntax support, better link/image diagnostics, and clearer export error messages.
