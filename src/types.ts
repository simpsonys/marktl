export type AiProvider = 'none' | 'claude';
export type ArtifactType = 'faithful-note' | 'strategy-brief' | 'research-report' | 'decision-memo' | 'interactive-explainer' | 'slide-deck';
export type ConversionMode = 'preserve' | 'presentation' | 'blog' | 'landing';
export type FailurePolicy = 'fallback' | 'strict';
export type PreviewSecurity = 'sanitized' | 'trusted';
export type ShareTarget = 'local-link' | 'static-bundle';

export interface MarktlSettings {
  exportFolder: string;
  setupCompleted: boolean;
  artifactType: ArtifactType;
  template: string;
  aiProvider: AiProvider;
  conversionMode: ConversionMode;
  failurePolicy: FailurePolicy;
  previewSecurity: PreviewSecurity;
  shareTarget: ShareTarget;
  timeoutMs: number;
  claudePath: string;
  geminiPath: string;
  copyShareLinkAfterExport: boolean;
}

export interface ExportOptions {
  artifactType: ArtifactType;
  template: string;
  aiProvider: AiProvider;
  conversionMode: ConversionMode;
  failurePolicy: FailurePolicy;
  previewSecurity: PreviewSecurity;
  shareTarget: ShareTarget;
  copyShareLinkAfterExport: boolean;
}

export interface ExportSummary {
  outputPath: string;
  usedFallback: boolean;
  aiProvider: AiProvider;
  assetCount: number;
  warnings: string[];
  shareTarget: ShareTarget;
  copiedShareLink: boolean;
}

export interface PreviewState {
  html: string;
  filePath: string;
  warnings: string[];
  trusted: boolean;
}
