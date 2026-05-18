#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_WEB_BOOK_OPTIONS,
  createNodeWebBookAdapter,
  exportWebBook,
  parseBooleanOption,
} = require('../src/core/webBookExport.js');

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

const sourceFolder = args.source || DEFAULT_WEB_BOOK_OPTIONS.sourceFolder;
const outputFolder = args.output || DEFAULT_WEB_BOOK_OPTIONS.outputFolder;
const siteTitle = args['site-title'] || DEFAULT_WEB_BOOK_OPTIONS.siteTitle;
const siteDescription = args['site-description'] || DEFAULT_WEB_BOOK_OPTIONS.siteDescription;
const defaultVisibility = args['default-visibility'] || DEFAULT_WEB_BOOK_OPTIONS.defaultVisibility;
const requireReviewedForPublicSafe = parseBooleanOption(args['require-reviewed'], DEFAULT_WEB_BOOK_OPTIONS.requireReviewedForPublicSafe);
const failOnBlocked = parseBooleanOption(args['fail-on-blocked'], false);

try {
  const result = await exportWebBook({
    sourceFolder,
    outputFolder,
    siteTitle,
    siteDescription,
    defaultVisibility,
    requireReviewedForPublicSafe,
    adapter: createNodeWebBookAdapter(fs, process.cwd()),
  });

  console.log('YSDA Publisher web book export complete');
  console.log(`source: ${result.sourceFolder}`);
  console.log(`output: ${result.outputFolder}`);
  console.log(`exported: ${result.exportedCount}`);
  console.log(`skipped: ${result.skippedCount}`);
  console.log(`blocked: ${result.blockedCount}`);

  if (failOnBlocked && result.blockedCount > 0) {
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`YSDA Publisher web book export failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      continue;
    }
    const key = value.slice(2);
    if (!key) {
      continue;
    }
    const next = values[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      index += 1;
    } else {
      parsed[key] = 'true';
    }
  }
  return parsed;
}

function printHelp() {
  console.log(`YSDA Publisher web-book export

Usage:
  node scripts/export-web-book.mjs --source sample-notes --output html-exports/ysda-publisher

Flags:
  --source <folder>              Source Markdown folder. Default: sample-notes
  --output <folder>              Output artifact folder. Default: html-exports/ysda-publisher
  --site-title <title>           Index title. Default: YSDA Publisher
  --site-description <text>      Index description.
  --default-visibility <value>   Default note visibility. Default: public-safe
  --require-reviewed <bool>      Require reviewed: true. Default: true
  --fail-on-blocked <bool>       Exit non-zero when blocked notes exist. Default: false
`);
}
