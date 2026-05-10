const exportPresets = [
  {
    id: 'readable-note',
    name: 'Readable Note',
    description: 'Faithful, clean reading view with better typography.',
    artifactType: 'faithful-note',
    template: 'editorial',
    mode: 'preserve',
    previewSecurity: 'sanitized',
  },
  {
    id: 'interactive-report',
    name: 'Interactive Report',
    description: 'HTML-native controls: table of contents, collapsible sections, copy buttons.',
    artifactType: 'interactive-explainer',
    template: 'interactive-report',
    mode: 'presentation',
    previewSecurity: 'trusted',
  },
  {
    id: 'presentation',
    name: 'Presentation',
    description: 'Slide-like sections for reviewing or presenting a note.',
    artifactType: 'slide-deck',
    template: 'deck',
    mode: 'presentation',
    previewSecurity: 'trusted',
  },
  {
    id: 'decision-memo',
    name: 'Decision Memo',
    description: 'Options, tradeoffs, risks, recommendation, and next actions.',
    artifactType: 'decision-memo',
    template: 'research-memo',
    mode: 'presentation',
    previewSecurity: 'trusted',
  },
  {
    id: 'shareable-article',
    name: 'Shareable Article',
    description: 'Polished article layout with bundled images and static-hosting-ready output.',
    artifactType: 'research-report',
    template: 'editorial',
    mode: 'blog',
    previewSecurity: 'sanitized',
  },
  {
    id: 'playground',
    name: 'Playground',
    description: 'Editable working surface with sliders and copyable state.',
    artifactType: 'interactive-explainer',
    template: 'playground',
    mode: 'presentation',
    previewSecurity: 'trusted',
  },
];

function listExportPresets() {
  return exportPresets.slice();
}

function findExportPreset(id) {
  return exportPresets.find((preset) => preset.id === id) || null;
}

module.exports = {
  findExportPreset,
  listExportPresets,
};
