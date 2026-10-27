// ui/sidebar.js: Sidebar controls: sliders, filters, appearance.
import { getPanelData } from '../pipeline.js';
import { renderAll } from '../plot/render.js';
import { activePanel, controls, defaultAppearance, openTermKeys, state } from '../state.js';
import { colorVal, numVal, snapToNearest, v } from '../utils.js';

export function toggleCtrl(toggleId, key) {
  v(toggleId).classList.toggle('on');
  controls[key] = v(toggleId).classList.contains('on');
  renderAll();
}

// Apply sidebar filter change to active panel only
export function applyPanelFilter(which) {
  const p = activePanel(); if (!p) return;
  if (which === 'topN')      p.filters.topN      = numVal('topN');
  if (which === 'minInter') {
    const interVals = [...new Set(p.rawData.map(d=>d.intersection_size))].sort((a,b)=>a-b);
    const snapped = snapToNearest(numVal('minInter'), interVals);
    v('minInter').value = snapped; v('minInterNum').value = snapped;
    p.filters.minInter = snapped;
  }
  if (which === 'minTerm') {
    const termVals2 = [...new Set(p.rawData.map(d=>d.term_size))].sort((a,b)=>a-b);
    const snapped2 = snapToNearest(numVal('minTerm'), termVals2);
    v('minTerm').value = snapped2; v('minTermNum').value = snapped2;
    p.filters.minTerm = snapped2;
  }
  if (which === 'maxTerm') {
    const termVals = [...new Set(p.rawData.map(d=>d.term_size))].sort((a,b)=>a-b);
    const snapped = snapToNearest(numVal('maxTerm'), termVals);
    v('maxTerm').value = snapped; v('maxTermNum').value = snapped;
    p.filters.maxTerm = snapped;
  }
  if (which === 'minLog2FE') {
    if (p.rawData.length) {
      const feVals = p.rawData.map(d=>d['log2(Fold_Enrichment)']||0);
      v('minLog2FE').min = v('minLog2FENum').min = Math.min(...feVals);
      v('minLog2FE').max = v('minLog2FENum').max = Math.max(...feVals);
    }
    p.filters.minLog2FE = +v('minLog2FE').value;
  }

  if (which === 'topN') {
    // User changed topN: update other sliders' limits and clamp values to topN terms
    let d = p.rawData.filter(dd => dd.group_name === p.filters.groupName);
    d.sort((a,b) => b['-log10(padj)'] - a['-log10(padj)']);
    d = d.slice(0, p.filters.topN);
    if (d.length) {
      const interMin = Math.min(...d.map(dd=>dd.intersection_size));
      const interMax = Math.max(...d.map(dd=>dd.intersection_size));
      v('minInter').min = interMin; v('minInterNum').min = interMin;
      v('minInter').max = interMax; v('minInterNum').max = interMax;
      const clampedInter = snapToNearest(Math.max(interMin, Math.min(interMax, p.filters.minInter)), [...new Set(d.map(dd=>dd.intersection_size))].sort((a,b)=>a-b));
      p.filters.minInter = clampedInter;
      v('minInter').value = clampedInter; v('minInterNum').value = clampedInter;

      const termMin = Math.min(...d.map(dd=>dd.term_size));
      const termMax = Math.max(...d.map(dd=>dd.term_size));
      v('minTerm').min = termMin; v('minTermNum').min = termMin;
      v('minTerm').max = termMax; v('minTermNum').max = termMax;
      v('maxTerm').min = termMin; v('maxTermNum').min = termMin;
      v('maxTerm').max = termMax; v('maxTermNum').max = termMax;
      const clampedTerm = snapToNearest(Math.max(termMin, Math.min(termMax, p.filters.maxTerm)), [...new Set(d.map(dd=>dd.term_size))].sort((a,b)=>a-b));
      p.filters.maxTerm = clampedTerm;
      v('maxTerm').value = clampedTerm; v('maxTermNum').value = clampedTerm;

      const feVals = d.map(dd=>dd['log2(Fold_Enrichment)']||0);
      const feMin  = Math.min(...feVals), feMax = Math.max(...feVals);
      v('minLog2FE').min = v('minLog2FENum').min = feMin;
      v('minLog2FE').max = v('minLog2FENum').max = feMax;
      const clampedFE = Math.max(feMin, Math.min(feMax, p.filters.minLog2FE ?? feMin));
      p.filters.minLog2FE = clampedFE;
      v('minLog2FE').value = clampedFE; v('minLog2FENum').value = clampedFE;
    }
  } else {
    // minInter / maxTerm / minLog2FE changed: topN = all available terms
    const preTopN = (() => {
      let d = p.rawData.filter(dd => dd.group_name === p.filters.groupName);
      d = d.filter(dd => dd.intersection_size >= p.filters.minInter && dd.term_size >= (p.filters.minTerm||1) && dd.term_size <= p.filters.maxTerm);
      if (p.filters.minLog2FE !== undefined) d = d.filter(dd => (dd['log2(Fold_Enrichment)']||0) >= p.filters.minLog2FE);
      return d.length;
    })();
    p.filters.topN = preTopN;
    v('topN').max = preTopN; v('topNNum').max = preTopN;
    v('topN').value = preTopN; v('topNNum').value = preTopN;
  }
  if (state.accordionMode && p) {
    const visSet = new Set(getPanelData(p).map(d => p.id + '::' + d.term_name));
    // Prune keys for terms no longer visible
    [...openTermKeys].forEach(k => { if (k.startsWith(p.id + '::') && !visSet.has(k)) openTermKeys.delete(k); });
    // Auto-expand newly visible terms (e.g. when topN is increased)
    if (openTermKeys.size > 0) {
      visSet.forEach(k => openTermKeys.add(k));
    }
  }
  renderAll();
}

export function applyPanelAppearance() {
  const p = activePanel(); if (!p) return;
  p.appearance.dotScale  = numVal('dotScale');
  p.appearance.lineWidth  = numVal('lineWidth');
  p.appearance.colorLow   = colorVal('colorLow');
  p.appearance.colorHigh  = colorVal('colorHigh');
  p.appearance.sizeMode   = v('sizeMode').value;
  p.appearance.fontSize   = numVal('fontSize');
  p.appearance.titleSize  = numVal('titleSize');
  renderAll();
}

export function resetAppearance() {
  const ap = activePanel();
  const toReset = ap ? [ap] : state.panels;
  const def = defaultAppearance();
  toReset.forEach(p => { p.appearance = defaultAppearance(); });
  // Sync sidebar sliders to defaults
  v('dotScale').value    = def.dotScale;    v('dotScaleNum').value    = def.dotScale;
  v('lineWidth').value   = def.lineWidth;   v('lineWidthNum').value   = def.lineWidth;
  v('colorLow').value    = def.colorLow;
  v('colorHigh').value   = def.colorHigh;
  v('fontSize').value    = def.fontSize;    v('fontSizeNum').value    = def.fontSize;
  v('titleSize').value   = def.titleSize;   v('titleSizeNum').value   = def.titleSize;
  v('legendScale').value = 1;               v('legendScaleNum').value = 1;
  v('plotScale').value = 1;                v('plotScaleNum').value = 1;
  renderAll();
}

export function toggleSidebar() {
  document.body.classList.toggle('sidebar-collapsed');
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  const icon = v('sidebar-toggle-icon');
  if (icon) {
    icon.innerHTML = collapsed
      ? '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>'
      : '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>';
  }
  const edgeTab = v('sidebar-edge-tab');
  if (edgeTab) {
    edgeTab.innerHTML = collapsed
      ? '<svg viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3,2 7,8 3,14"/></svg>'
      : '<svg viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="7,2 3,8 7,14"/></svg>';
  }
  setTimeout(() => { if(state.panels.some(p=>p.rawData.length)) renderAll(); }, 310);
}
