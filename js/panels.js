// panels.js: Panel management: add, delete, move, activate.
import { renderClusterBar } from './clustering/manual-ui.js';
import { syncClusterDefs } from './clustering/manual.js';
import { loadFileIntoPanel } from './io/upload.js';
import { renderAll } from './plot/render.js';
import { PANEL_COLORS, controls, defaultAppearance, defaultFilters, openTermKeys, state } from './state.js';
import { positionEditBar, updateDeleteBtn, updateGenePanelBtn, updateMoveBtn } from './ui/header.js';
import { v } from './utils.js';

export function setActivePanelId(id) {
  state.activePanelId = id;
  const p = state.panels.find(p => p.id === id);
  if (!p) return;
  // Push panel settings into sidebar controls
  // Dynamic topN max = number of terms in this panel's group
  if (p.rawData.length) {
    const grpTerms = p.rawData.filter(d => d.group_name === p.filters.groupName).length;
    const topNmax = grpTerms || p.rawData.length;
    v('topN').max = topNmax; v('topNNum').max = topNmax;
  }
  v('topN').value      = p.filters.topN;     v('topNNum').value      = p.filters.topN;
  if (p.rawData.length) {
    const interVals = [...new Set(p.rawData.map(d=>d.intersection_size))].sort((a,b)=>a-b);
    v('minInter').min = interVals[0]; v('minInterNum').min = interVals[0];
    v('minInter').max = interVals[interVals.length-1]; v('minInterNum').max = interVals[interVals.length-1];
    const termVals = [...new Set(p.rawData.map(d=>d.term_size))].sort((a,b)=>a-b);
    v('maxTerm').min = termVals[0]; v('maxTermNum').min = termVals[0];
    v('maxTerm').max = termVals[termVals.length-1]; v('maxTermNum').max = termVals[termVals.length-1];
  }
  v('minInter').value  = p.filters.minInter;  v('minInterNum').value  = p.filters.minInter;
  v('minTerm').value   = p.filters.minTerm||1; v('minTermNum').value   = p.filters.minTerm||1;
  v('maxTerm').value   = p.filters.maxTerm;   v('maxTermNum').value   = p.filters.maxTerm;
  if (p.rawData.length) {
    const feVals = p.rawData.map(d=>d['log2(Fold_Enrichment)']||0);
    const feMin = Math.min(...feVals);
    const feMax = Math.max(...feVals);
    v('minLog2FE').min = feMin; v('minLog2FENum').min = feMin;
    v('minLog2FE').max = feMax; v('minLog2FENum').max = feMax;
  }
  const feDefault = p.filters.minLog2FE ?? -100;
  v('minLog2FE').value = feDefault; v('minLog2FENum').value = feDefault;
  v('dotScale').value  = p.appearance.dotScale;  v('dotScaleNum').value  = p.appearance.dotScale;
  v('lineWidth').value = p.appearance.lineWidth; v('lineWidthNum').value = p.appearance.lineWidth;
  v('colorLow').value  = p.appearance.colorLow;
  v('colorHigh').value = p.appearance.colorHigh;
  v('sizeMode').value   = p.appearance.sizeMode;
  v('fontSize').value   = p.appearance.fontSize  || 13; v('fontSizeNum').value   = p.appearance.fontSize  || 13;
  v('titleSize').value  = p.appearance.titleSize || 16; v('titleSizeNum').value  = p.appearance.titleSize || 16;
  // Update cluster select for this panel
  if (p.rawData.length) {
    const groups = [...new Set(p.rawData.map(d=>d.group_name))];
    const sel = v('clusterSelect');
    sel.innerHTML = groups.map(g=>`<option${g===p.filters.groupName?' selected':''}>${g}</option>`).join('');
    v('cluster-section').style.display = groups.length > 1 ? 'block' : 'none';
    sel.onchange = () => {
      p.filters.groupName = sel.value;
      const grpTerms = p.rawData.filter(d => d.group_name === sel.value).length;
      v('topN').max = grpTerms; v('topNNum').max = grpTerms;
      renderAll();
    };
    const fmtLabels = { gprofiler:'gProfiler', genecodis:'GeneCodis' };
    const fmtBadge = p.fmt ? ` <span style="font-size:.55rem;color:#7c83fd;background:#7c83fd18;border:1px solid #7c83fd44;border-radius:4px;padding:1px 5px;margin-left:4px;">${fmtLabels[p.fmt]||p.fmt}</span>` : '';
    v('fileLabel').innerHTML = p.title;
    const us = v('upload-status');
    us.className = 'success'; us.textContent = '✓ Loaded successfully';
  }
  // Active panel indicator
  const ind = v('active-panel-indicator');
  const color = PANEL_COLORS[state.panels.findIndex(pp=>pp.id===id) % PANEL_COLORS.length];
  ind.style.display = state.panels.length > 1 ? 'inline-flex' : 'none';
  ind.style.alignItems = 'center';
  ind.style.background = color + '22';
  ind.style.color = color;
  ind.style.border = `1px solid ${color}55`;
  ind.textContent = `⬤ ${p.title || 'Plot '+(state.panels.findIndex(pp=>pp.id===id)+1)}`;
  updateDeleteBtn();
  updateMoveBtn();
  updateGenePanelBtn();
  if (controls.editMode) positionEditBar();
  if (state.clusterMode) { syncClusterDefs(); renderClusterBar(); }
  renderAll();
}

export function addPanel(file) {
  const id = state.panelCounter++;
  const panel = {
    id, title: `Plot ${id+1}`,
    rawData: [], hiddenTerms: new Set(), editSnapshot: null,
    filters: defaultFilters([]),
    appearance: defaultAppearance(),
    isCollapsed: false
  };
  state.panels.push(panel);
  state.activePanelId = id;
  updateDropZones();
  if (file) loadFileIntoPanel(panel, file);
  else renderAll();
  return panel;
}

export function deleteActivePanel() {
  if (state.activePanelId === null) return;
  if (localStorage.getItem('skipDeleteConfirm') === '1') { removePanel(state.activePanelId); return; }
  // Sync checkbox state from localStorage before showing
  const cb = v('dc-no-ask'); if (cb) cb.checked = false;
  v('delete-confirm-overlay').classList.add('show');
}

export function confirmDeletePanel() {
  if (v('dc-no-ask').checked) localStorage.setItem('skipDeleteConfirm','1');
  v('delete-confirm-overlay').classList.remove('show');
  if (state.activePanelId !== null) removePanel(state.activePanelId);
}

export function dismissDeleteConfirm() {
  v('delete-confirm-overlay').classList.remove('show');
}

export function moveActivePanel(dir) {
  if (state.activePanelId === null || state.panels.length < 2) return;
  const idx = state.panels.findIndex(p => p.id === state.activePanelId);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.panels.length) return;
  // Swap
  [state.panels[idx], state.panels[newIdx]] = [state.panels[newIdx], state.panels[idx]];
  renderAll();
  updateDeleteBtn();
  updateMoveBtn();
  updateGenePanelBtn();
}

export function removePanel(id) {
  state.panels = state.panels.filter(p => p.id !== id);
  if (state.panels.length === 0) {
    state.panelCounter = 0;
    state.activePanelId = null;
    // Reset gene matrix mode so a newly uploaded file doesn't enter it automatically
    state.accordionMode = false;
    openTermKeys.clear();
    const geneBtn = v('geneMatrixBtn');
    if (geneBtn) { geneBtn.classList.remove('active'); geneBtn.textContent = '≡ Show Gene Matrix'; }
    const sidePib = v('pib-genes');
    if (sidePib) sidePib.classList.remove('active');
    // Reset edit mode
    if (controls.editMode) {
      controls.editMode = false;
      const editBtn = v('editModeBtn'); if (editBtn) { editBtn.classList.remove('active'); editBtn.textContent = '✎ Edit Visible Terms'; }
      const pibEdit = v('pib-edit'); if (pibEdit) pibEdit.classList.remove('active');
      v('edit-bar').classList.remove('open');
    }
    v('main-drop-overlay').classList.remove('hidden');
    d3.select('#combined-svg').selectAll('*').remove();
    v('drop-zones-layer').innerHTML = '';
    v('active-panel-indicator').style.display = 'none';
    v('fileLabel').innerHTML = 'drag &amp; drop or click';
    const _us = v('upload-status'); if (_us) { _us.className = ''; }
    const stc = v('sticky-term-column'); if (stc) { stc.style.display = 'none'; stc.innerHTML = ''; }
    state._stickyTermInfo = null;
    return;
  }
  if (state.activePanelId === id) state.activePanelId = state.panels[0].id;
  setActivePanelId(state.activePanelId);
  renderAll();
}

export function updateDropZones() {
  const layer = v('drop-zones-layer');
  layer.innerHTML = '';
  // Drop zones are positioned during renderAll() after layout is known
}
