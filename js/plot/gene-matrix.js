// plot/gene-matrix.js: Gene matrix (accordion) mode and its drawer.
import { getPanelData } from '../pipeline.js';
import { renderAll } from './render.js';
import { activePanel, openTermKeys, state } from '../state.js';

export function toggleAccordionMode() {
  const hasGenes = state.panels.some(p => p.rawData.some(d => d.genes && d.genes.length > 0));
  if (!hasGenes) return;
  state.accordionMode = !state.accordionMode;
  const btn = document.getElementById('pib-genes');
  if (btn) btn.classList.toggle('active', state.accordionMode);
  const sideBtn = document.getElementById('geneMatrixBtn');
  if (sideBtn) {
    sideBtn.classList.toggle('active', state.accordionMode);
    sideBtn.textContent = state.accordionMode ? '≡ Hide Gene Matrix' : '≡ Show Gene Matrix';
  }
  if (!state.accordionMode) {
    openTermKeys.clear();
  } else {
    // Expand all terms across all panels on enable
    state.panels.forEach(p => getPanelData(p).forEach(d => openTermKeys.add(p.id + '::' + d.term_name)));
  }
  renderAll();
}

export function expandAllTerms(targetPanel) {
  if (!state.accordionMode) { state.accordionMode = true; const b=document.getElementById('pib-genes'); if(b) b.classList.add('active'); }
  const ap = targetPanel || activePanel(); if (!ap) return;
  getPanelData(ap).forEach(d => openTermKeys.add(ap.id + '::' + d.term_name));
  renderAll();
}

export function collapseAllTerms(targetPanel) {
  const ap = targetPanel || activePanel(); if (!ap) return;
  // Only collapse terms belonging to the target panel
  [...openTermKeys].forEach(k => { if (k.startsWith(ap.id + '::')) openTermKeys.delete(k); });
  renderAll();
}

// Gene matrix uses SVG — no floating drawer needed
export function showGaDrawer() {}

export function hideGaDrawer() {}
