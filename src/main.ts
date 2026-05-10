import { Notice, Plugin, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import { MarktlExportModal } from './export-modal';
import { MarktlProgressModal } from './progress-modal';
import { MarktlPreviewView, VIEW_TYPE_MARKTL_PREVIEW } from './preview-view';
import { MarktlSettingTab } from './settings-tab';
import type { ExportOptions, MarktlSettings, PreviewState } from './types';

const { convertWithAiFallback } = require('./core/ai.js');
const { buildAssetFileName, extractMarkdownImageReferences, rewriteHtmlImageSources } = require('./core/assets.js');
const { slugify } = require('./core/html.js');

const DEFAULT_SETTINGS: MarktlSettings = {
  exportFolder: 'html-exports',
  artifactType: 'faithful-note',
  template: 'minimal',
  aiProvider: 'none',
  conversionMode: 'preserve',
  failurePolicy: 'fallback',
  previewSecurity: 'sanitized',
  shareTarget: 'local-link',
  timeoutMs: 300000,
  claudePath: '',
  geminiPath: '',
  copyShareLinkAfterExport: false,
};

interface OutputPlan {
  folder: string;
  basename: string;
  outputPath: string;
  assetFolder: string;
  assetRelativePrefix: string;
}

interface ImageAssetMapping {
  original: string;
  sourcePath: string;
  destinationPath: string;
  relativeSrc: string;
  aliases: string[];
}

export default class MarktlPlugin extends Plugin {
  settings: MarktlSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_MARKTL_PREVIEW,
      (leaf: WorkspaceLeaf) => new MarktlPreviewView(leaf),
    );

    this.addRibbonIcon('file-code-2', 'Export current note to HTML', () => {
      this.openExportModal();
    });

    this.addCommand({
      id: 'export-active-note-to-html',
      name: 'Export active note to HTML...',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = file instanceof TFile && file.extension === 'md';
        if (canRun && !checking) {
          this.openExportModal();
        }
        return canRun;
      },
    });

    this.addCommand({
      id: 'quick-export-active-note-to-html',
      name: 'Quick export active note to HTML',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        const canRun = file instanceof TFile && file.extension === 'md';
        if (canRun && !checking) {
          void this.exportActiveNote();
        }
        return canRun;
      },
    });

    this.addSettingTab(new MarktlSettingTab(this.app, this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MARKTL_PREVIEW);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    let shouldSave = false;
    if (['codex', 'gemini'].includes(this.settings.aiProvider as string)) {
      this.settings.aiProvider = 'none';
      shouldSave = true;
    }
    if (!Number.isFinite(this.settings.timeoutMs) || this.settings.timeoutMs <= 60000) {
      this.settings.timeoutMs = DEFAULT_SETTINGS.timeoutMs;
      shouldSave = true;
    }
    if (shouldSave) {
      await this.saveSettings();
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  openExportModal(): void {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== 'md') {
      new Notice('Open a Markdown note before exporting HTML.');
      return;
    }

    new MarktlExportModal(this.app, this, (options) => {
      void this.exportActiveNote(options);
    }).open();
  }

  async exportActiveNote(overrides: Partial<ExportOptions> = {}): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile) || file.extension !== 'md') {
      new Notice('Open a Markdown note before exporting HTML.');
      return;
    }

    const options = this.resolveExportOptions(overrides);
    const progress = new MarktlProgressModal(this.app);
    progress.open();
    progress.addStep(`Artifact: ${options.artifactType}`);
    progress.addStep(`Template: ${options.template}`);
    progress.addStep(`AI CLI: ${options.aiProvider === 'none' ? 'local fallback' : options.aiProvider}`);
    progress.addStep(`Mode: ${options.conversionMode}; preview: ${options.previewSecurity}`);
    progress.addStep(`Timeout: ${Math.round(this.settings.timeoutMs / 1000)}s`);

    try {
      progress.addStep('Reading active Markdown note...');
      const markdown = await this.app.vault.read(file);
      const outputPlan = await this.prepareOutputPlan(file, options);
      const assetResult = await this.resolveImageAssets(markdown, file, outputPlan);
      progress.addStep(assetResult.mappings.length > 0
        ? `Resolved ${assetResult.mappings.length} local image asset(s).`
        : 'No local image assets found.');
      progress.addStep(options.aiProvider === 'none' ? 'Running local converter...' : `Running ${options.aiProvider} CLI...`);
      const result = await convertWithAiFallback(markdown, {
        provider: options.aiProvider,
        artifactType: options.artifactType,
        mode: options.conversionMode,
        template: options.template,
        trusted: options.previewSecurity === 'trusted',
        strictAiFailures: options.failurePolicy === 'strict',
        timeoutMs: this.settings.timeoutMs,
        sourcePath: file.path,
        assetMappings: assetResult.mappings,
        cliPaths: {
          claude: this.settings.claudePath,
        },
      });
      progress.addStep(result.usedFallback ? 'Generated local fallback HTML.' : 'Generated AI HTML.');
      const html = rewriteHtmlImageSources(result.html, assetResult.mappings);
      const warnings = [...result.warnings, ...assetResult.warnings];

      progress.addStep('Writing HTML file to vault...');
      await this.copyImageAssets(assetResult.mappings);
      const outputPath = await this.writeHtmlFile(outputPlan, html, options, file.path);
      progress.addStep('Opening internal preview pane...');
      await this.openPreview({
        html,
        filePath: outputPath,
        warnings,
        trusted: options.previewSecurity === 'trusted',
      });

      if (options.copyShareLinkAfterExport) {
        progress.addStep('Copying local share link...');
        await this.copyShareLink(outputPath);
      }

      progress.complete(`Done: ${outputPath}`);
      if (result.usedFallback && options.aiProvider !== 'none') {
        new Notice('AI conversion failed; local fallback HTML was generated.');
      } else {
        new Notice(`HTML exported to ${outputPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      progress.fail(message);
      new Notice(`HTML export failed: ${message}`);
    }
  }

  private async prepareOutputPlan(source: TFile, options: ExportOptions): Promise<OutputPlan> {
    const folder = normalizePath(this.settings.exportFolder || DEFAULT_SETTINGS.exportFolder);
    if (!(await this.app.vault.adapter.exists(folder))) {
      await this.app.vault.createFolder(folder);
    }

    const basename = slugify(source.basename);
    const outputPath = options.shareTarget === 'static-bundle'
      ? normalizePath(`${folder}/share/${basename}/index.html`)
      : normalizePath(`${folder}/${basename}.html`);
    const assetFolder = options.shareTarget === 'static-bundle'
      ? normalizePath(`${folder}/share/${basename}/assets`)
      : normalizePath(`${folder}/${basename}-assets`);
    const assetRelativePrefix = options.shareTarget === 'static-bundle'
      ? 'assets'
      : `${basename}-assets`;

    return { folder, basename, outputPath, assetFolder, assetRelativePrefix };
  }

  private async writeHtmlFile(plan: OutputPlan, html: string, options: ExportOptions, sourcePath: string): Promise<string> {
    await this.ensureParentFolder(plan.outputPath);
    await this.app.vault.adapter.write(plan.outputPath, html);
    if (options.shareTarget === 'static-bundle') {
      await this.writeShareReadme(plan.folder, plan.basename, sourcePath, options);
    }
    return plan.outputPath;
  }

  private async resolveImageAssets(markdown: string, source: TFile, plan: OutputPlan): Promise<{ mappings: ImageAssetMapping[]; warnings: string[] }> {
    const references = extractMarkdownImageReferences(markdown);
    const warnings: string[] = [];
    const mappings: ImageAssetMapping[] = [];
    const usedNames = new Set<string>();

    for (const reference of references) {
      const target = String(reference.target || '');
      const imageFile = this.resolveImageFile(target, source);
      if (!imageFile) {
        warnings.push(`Image asset not found: ${target}`);
        continue;
      }

      const assetFileName = buildAssetFileName(imageFile.path, mappings.length + 1, usedNames);
      const destinationPath = normalizePath(`${plan.assetFolder}/${assetFileName}`);
      const relativeSrc = encodeURI(`${plan.assetRelativePrefix}/${assetFileName}`);

      mappings.push({
        original: target,
        sourcePath: imageFile.path,
        destinationPath,
        relativeSrc,
        aliases: [
          target,
          String(reference.raw || ''),
          imageFile.path,
          imageFile.name,
          normalizePath(target),
        ],
      });
    }

    return { mappings, warnings };
  }

  private resolveImageFile(target: string, source: TFile): TFile | null {
    const linked = this.app.metadataCache.getFirstLinkpathDest(target, source.path);
    if (linked instanceof TFile) {
      return linked;
    }

    const normalized = normalizePath(target);
    const direct = this.app.vault.getAbstractFileByPath(normalized);
    if (direct instanceof TFile) {
      return direct;
    }

    if (source.parent?.path) {
      const relative = this.app.vault.getAbstractFileByPath(normalizePath(`${source.parent.path}/${target}`));
      if (relative instanceof TFile) {
        return relative;
      }
    }

    const byName = this.app.vault.getFiles().find((file) => file.name === target || file.path.endsWith(`/${target}`));
    return byName instanceof TFile ? byName : null;
  }

  private async copyImageAssets(mappings: ImageAssetMapping[]): Promise<void> {
    const copied = new Set<string>();
    for (const mapping of mappings) {
      if (copied.has(mapping.destinationPath)) {
        continue;
      }
      copied.add(mapping.destinationPath);
      await this.ensureParentFolder(mapping.destinationPath);
      const data = await this.app.vault.adapter.readBinary(mapping.sourcePath);
      await this.app.vault.adapter.writeBinary(mapping.destinationPath, data);
    }
  }

  private resolveExportOptions(overrides: Partial<ExportOptions>): ExportOptions {
    return {
      template: overrides.template || this.settings.template,
      artifactType: overrides.artifactType || this.settings.artifactType,
      aiProvider: overrides.aiProvider || this.settings.aiProvider,
      conversionMode: overrides.conversionMode || this.settings.conversionMode,
      failurePolicy: overrides.failurePolicy || this.settings.failurePolicy,
      previewSecurity: overrides.previewSecurity || this.settings.previewSecurity,
      shareTarget: overrides.shareTarget || this.settings.shareTarget,
      copyShareLinkAfterExport: overrides.copyShareLinkAfterExport ?? this.settings.copyShareLinkAfterExport,
    };
  }

  private async ensureParentFolder(filePath: string): Promise<void> {
    const parts = filePath.split('/');
    parts.pop();
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.createFolder(current);
      }
    }
  }

  private async writeShareReadme(folder: string, basename: string, sourcePath: string, options: ExportOptions): Promise<void> {
    const readmePath = normalizePath(`${folder}/share/${basename}/README.md`);
    const content = [
      `# ${basename}`,
      '',
      'This folder is a static MarkTL HTML export bundle.',
      '',
      `- Source note: ${sourcePath}`,
      `- Artifact type: ${options.artifactType}`,
      `- Template: ${options.template}`,
      `- Preview security: ${options.previewSecurity}`,
      '',
      'Publish this folder with GitHub Pages, S3/R2, Netlify, Vercel, or any static host.',
      'Do not publish it if the source note contains private vault content.',
      '',
    ].join('\n');
    await this.app.vault.adapter.write(readmePath, content);
  }

  private async copyShareLink(outputPath: string): Promise<void> {
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getFullPath?: (path: string) => string;
    };
    const fullPath = adapter.getFullPath ? adapter.getFullPath(outputPath) : outputPath;
    const link = fullPath.startsWith('/')
      ? `file://${encodeURI(fullPath)}`
      : outputPath;

    await navigator.clipboard.writeText(link);
    new Notice('HTML share link copied.');
  }

  private async openPreview(state: PreviewState): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MARKTL_PREVIEW)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf('split', 'vertical');
      await leaf.setViewState({ type: VIEW_TYPE_MARKTL_PREVIEW, active: true });
    }

    const view = leaf.view;
    if (view instanceof MarktlPreviewView) {
      view.setPreview(state);
    }
    this.app.workspace.revealLeaf(leaf);
  }
}
