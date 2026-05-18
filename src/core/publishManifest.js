function buildPublishManifest(input) {
  const skipped = Array.isArray(input.skipped) ? input.skipped : [];
  const pages = Array.isArray(input.pages) ? input.pages : [];

  return {
    tool: 'YSDA Publisher',
    generatedAt: input.generatedAt,
    sourceFolder: input.sourceFolder,
    outputFolder: input.outputFolder,
    exportedCount: pages.length,
    skippedCount: skipped.filter((item) => item.status !== 'blocked').length,
    blockedCount: skipped.filter((item) => item.status === 'blocked').length,
    pages,
    skipped,
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
  };
}

module.exports = {
  buildPublishManifest,
};
