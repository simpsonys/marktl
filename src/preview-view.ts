import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type { PreviewState } from './types';

export const VIEW_TYPE_MARKTL_PREVIEW = 'marktl-html-preview';

const emptyState: PreviewState = {
  html: '<!doctype html><html><body><p>No preview loaded.</p></body></html>',
  filePath: '',
  warnings: [],
  trusted: false,
  previewSecurity: 'sanitized',
};

export class MarktlPreviewView extends ItemView {
  private state: PreviewState = emptyState;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_MARKTL_PREVIEW;
  }

  getDisplayText(): string {
    return 'HTML Preview';
  }

  getIcon(): string {
    return 'file-code-2';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  setPreview(state: PreviewState): void {
    this.state = state;
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass('marktl-preview-container');

    const header = container.createDiv({ cls: 'marktl-preview-header' });
    header.createEl('strong', { text: this.state.filePath || 'HTML Preview' });
    header.createSpan({
      cls: this.state.trusted ? 'marktl-preview-trusted' : 'marktl-preview-sanitized',
      text: this.state.trusted ? 'Trusted interactive' : 'Sanitized static',
    });

    let frame!: HTMLIFrameElement;
    const tools = container.createDiv({ cls: 'marktl-preview-tools' });
    this.addToolButton(tools, 'Copy as prompt', () => this.copyPrompt(frame));
    this.addToolButton(tools, 'Copy outline', () => this.copyOutline(frame));
    this.addToolButton(tools, 'Copy section feedback', () => this.copySectionFeedback(frame));
    this.addToolButton(tools, 'Open generated file', () => this.openGeneratedFile());

    for (const warning of this.state.warnings) {
      container.createDiv({ cls: 'marktl-preview-warning', text: warning });
    }

    const renderQa = container.createDiv({ cls: 'marktl-preview-render-qa', text: 'Render QA: waiting for preview...' });

    frame = container.createEl('iframe', {
      cls: 'marktl-preview-frame',
      attr: {
        sandbox: this.state.trusted ? 'allow-same-origin allow-scripts' : 'allow-same-origin',
      },
    });
    frame.addEventListener('load', () => {
      this.runRenderQa(frame, renderQa);
    });
    frame.srcdoc = this.state.html;
  }

  private addToolButton(container: HTMLElement, label: string, onClick: () => void | Promise<void>): void {
    const button = container.createEl('button', { text: label });
    button.type = 'button';
    button.addEventListener('click', () => {
      void onClick();
    });
  }

  private async copyPrompt(frame: HTMLIFrameElement): Promise<void> {
    const text = this.getFrameText(frame) || this.stripHtml(this.state.html);
    await navigator.clipboard.writeText([
      'Use this YSDA Publisher HTML artifact as context for the next iteration.',
      '',
      `Artifact: ${this.state.title || this.state.filePath || 'HTML Preview'}`,
      `Preview security: ${this.state.previewSecurity}`,
      '',
      text,
    ].join('\n'));
    new Notice('Copied preview prompt.');
  }

  private async copyOutline(frame: HTMLIFrameElement): Promise<void> {
    const outline = this.getOutline(frame);
    if (!outline) {
      await navigator.clipboard.writeText(this.state.title || this.state.filePath || 'HTML Preview');
      new Notice('No headings found; copied artifact title.');
      return;
    }
    await navigator.clipboard.writeText(outline);
    new Notice('Copied preview outline.');
  }

  private async copySectionFeedback(frame: HTMLIFrameElement): Promise<void> {
    const section = this.getFirstSection(frame);
    const fallback = this.getFrameText(frame) || this.stripHtml(this.state.html);
    await navigator.clipboard.writeText([
      'Give feedback on this YSDA Publisher HTML artifact section.',
      '',
      `Artifact: ${this.state.title || this.state.filePath || 'HTML Preview'}`,
      `Section: ${section.heading || 'Whole document fallback'}`,
      '',
      section.text || fallback,
      '',
      'Focus on what should be clearer, more visual, or more interactive.',
    ].join('\n'));
    new Notice(section.heading ? 'Copied section feedback prompt.' : 'Copied whole-document feedback prompt.');
  }

  private openGeneratedFile(): void {
    if (!this.state.filePath) {
      new Notice('No generated file path is available.');
      return;
    }
    const adapter = this.app.vault.adapter as typeof this.app.vault.adapter & {
      getFullPath?: (path: string) => string;
    };
    const fullPath = adapter.getFullPath ? adapter.getFullPath(this.state.filePath) : this.state.filePath;
    const target = fullPath.startsWith('/') ? `file://${encodeURI(fullPath)}` : encodeURI(fullPath);
    window.open(target, '_blank', 'noopener,noreferrer');
  }

  private runRenderQa(frame: HTMLIFrameElement, statusEl: HTMLElement): void {
    try {
      const doc = frame.contentDocument;
      if (!doc) {
        statusEl.setText('Render QA: unable to inspect preview document.');
        statusEl.addClass('marktl-preview-render-qa-warning');
        return;
      }

      const warnings: string[] = [];
      const bodyText = doc.body?.innerText?.trim() || '';
      if (bodyText.length < 20) {
        warnings.push('preview appears nearly empty');
      }
      if (!doc.querySelector('h1')) {
        warnings.push('no visible H1');
      }
      const brokenImages = Array.from(doc.images).filter((image) => image.complete && image.naturalWidth === 0);
      if (brokenImages.length > 0) {
        warnings.push(`${brokenImages.length} broken image(s)`);
      }
      if (this.state.trusted && !doc.querySelector('button,input,select,textarea,[contenteditable="true"]') && !doc.querySelector('script[src*="giscus.app/client.js"]')) {
        warnings.push('trusted preview has no interactive controls');
      }
      const scrollHeight = doc.scrollingElement?.scrollHeight || doc.body?.scrollHeight || 0;
      if (scrollHeight > 0 && scrollHeight < 120) {
        warnings.push('rendered content is unusually short');
      }

      statusEl.setText(warnings.length > 0
        ? `Render QA: ${warnings.join('; ')}.`
        : 'Render QA: preview loaded, content and assets look reachable.');
      statusEl.toggleClass('marktl-preview-render-qa-warning', warnings.length > 0);
    } catch (error) {
      statusEl.setText('Render QA: preview inspection was blocked by iframe security.');
      statusEl.addClass('marktl-preview-render-qa-warning');
    }
  }

  private getFrameDocument(frame: HTMLIFrameElement): Document | null {
    try {
      return frame.contentDocument;
    } catch {
      return null;
    }
  }

  private getFrameText(frame: HTMLIFrameElement): string {
    const doc = this.getFrameDocument(frame);
    return doc?.body?.innerText?.trim() || '';
  }

  private getOutline(frame: HTMLIFrameElement): string {
    const doc = this.getFrameDocument(frame);
    if (!doc) {
      return '';
    }
    const headings = Array.from(doc.querySelectorAll('h1,h2,h3'));
    return headings
      .map((heading) => {
        const level = Number(heading.tagName.slice(1));
        return `${'  '.repeat(Math.max(0, level - 1))}- ${heading.textContent?.trim() || 'Untitled'}`;
      })
      .join('\n');
  }

  private getFirstSection(frame: HTMLIFrameElement): { heading: string; text: string } {
    const doc = this.getFrameDocument(frame);
    const heading = doc?.querySelector('h2,h1,h3');
    if (!doc || !heading) {
      return { heading: '', text: '' };
    }
    const parts = [heading.textContent?.trim() || 'Untitled'];
    let node = heading.nextElementSibling;
    while (node && !/^H[1-3]$/.test(node.tagName)) {
      parts.push(node.textContent?.trim() || '');
      node = node.nextElementSibling;
    }
    return {
      heading: heading.textContent?.trim() || 'Untitled',
      text: parts.filter(Boolean).join('\n\n'),
    };
  }

  private stripHtml(html: string): string {
    return String(html || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
