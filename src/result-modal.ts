import { App, Modal, Notice, Setting } from 'obsidian';
import type { ExportSummary } from './types';

export class MarktlResultModal extends Modal {
  private summary: ExportSummary;
  private copyLink: (outputPath: string, preferredLink?: string) => Promise<string>;

  constructor(app: App, summary: ExportSummary, copyLink: (outputPath: string, preferredLink?: string) => Promise<string>) {
    super(app);
    this.summary = summary;
    this.copyLink = copyLink;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.setTitle('HTML export ready');

    const facts = contentEl.createDiv({ cls: 'marktl-summary-grid' });
    this.addFact(facts, 'Output', this.summary.outputPath);
    this.addFact(facts, 'AI', this.summary.aiProvider === 'none'
      ? 'Local converter'
      : this.summary.usedFallback ? `${this.summary.aiProvider} failed; local fallback used` : `${this.summary.aiProvider} generated HTML`);
    this.addFact(facts, 'Images', `${this.summary.assetCount} bundled local image(s)`);
    this.addFact(facts, 'Share target', this.describeShareTarget());
    if (this.summary.publicUrl) {
      this.addFact(facts, 'Public URL', this.summary.publicUrl);
    }

    if (this.summary.warnings.length > 0) {
      contentEl.createEl('h3', { text: 'Warnings' });
      const list = contentEl.createEl('ul', { cls: 'marktl-summary-warnings' });
      for (const warning of this.summary.warnings) {
        list.createEl('li', { text: warning });
      }
    }

    contentEl.createEl('p', {
      cls: 'marktl-modal-intro',
      text: this.summary.publicUrl
        ? 'This public URL is ready to share with other people.'
        : this.summary.shareTarget === 'static-bundle'
        ? 'This folder is ready for a static host. Public upload is intentionally a separate step.'
        : 'This link opens the generated file on this computer. Public share links require a static host.',
    });

    new Setting(contentEl)
      .addButton((button) => button
        .setButtonText(this.summary.publicUrl ? 'Copy public link' : 'Copy local link')
        .onClick(async () => {
          const link = await this.copyLink(this.summary.outputPath, this.summary.publicUrl);
          new Notice(`Copied: ${link}`);
        }))
      .addButton((button) => button
        .setButtonText('Close')
        .setCta()
        .onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private addFact(container: HTMLElement, label: string, value: string): void {
    const item = container.createDiv({ cls: 'marktl-summary-item' });
    item.createEl('span', { cls: 'marktl-summary-label', text: label });
    item.createEl('strong', { text: value });
  }

  private describeShareTarget(): string {
    if (this.summary.shareTarget === 'github-pages') {
      return 'GitHub Pages link';
    }
    return this.summary.shareTarget === 'static-bundle' ? 'Static hosting bundle' : 'Local file link';
  }
}
