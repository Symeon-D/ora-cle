// ui/header.js: Header icon bar, edit mode and reset buttons.
import { renderClusterBar } from '../clustering/manual-ui.js';
import { getPanelClusters } from '../clustering/manual.js';
import { setActivePanelId } from '../panels.js';
import { getPanelData } from '../pipeline.js';
import { renderAll } from '../plot/render.js';
import { CLUSTER_PALETTE, PANEL_COLORS, activePanel, controls, defaultAppearance, defaultFilters, openTermKeys, state } from '../state.js';
import { v } from '../utils.js';

export function updateGenePanelBtn() {
  const btn = v('pib-genes');
  const sideBtn = v('geneMatrixBtn');
  if (!btn) return;
  const hasGenes = state.panels.some(p => p.rawData.some(d => d.genes && d.genes.length > 0));
  btn.disabled = !hasGenes;
  btn.dataset.noGenes = hasGenes ? '' : '1';
  btn.title = hasGenes
    ? 'Show Gene Matrix per Term'
    : 'Gene data not found — load a gProfiler CSV (with intersections column) or native file with intersection/genes column';
  if (sideBtn) {
    sideBtn.disabled = !hasGenes;
    sideBtn.title = btn.title;
  }
  // If no genes: turn off accordion mode so + buttons disappear
  if (!hasGenes && state.accordionMode) {
    state.accordionMode = false;
    btn.classList.remove('active');
    if (sideBtn) { sideBtn.classList.remove('active'); sideBtn.textContent = '≡ Show Gene Matrix'; }
    openTermKeys.clear();
  }
}

export function updateFilterClustersBtn() {
  const btn = v('filterClustersBtn');
  if (!btn) return;
  const hasClusters = state.panels.some(p =>
    getPanelClusters(p).some(c => c.id !== 0 && c.terms.length > 0)
  );
  btn.disabled = !hasClusters;
}

export function filterTopPerCluster() {
  const btn = v('filterClustersBtn');
  if (btn && btn.disabled) return;
  state.panels.forEach(panel => {
    const clusters = getPanelClusters(panel);
    if (!clusters.length) return;
    const data = getPanelData(panel);
    clusters.forEach(cluster => {
      if (cluster.id === 0) return;
      const clusterTerms = data
        .filter(d => cluster.terms.includes(d.term_name))
        .sort((a, b) => b['-log10(padj)'] - a['-log10(padj)']);
      if (clusterTerms.length <= 1) return;
      clusterTerms.slice(1).forEach(d => panel.hiddenTerms.add(d.term_name));
    });
  });
  renderAll();
}

export function updateDeleteBtn() {
  const btn = v('deletePanelBtn');
  if (btn) {
    const hasActive = state.activePanelId !== null && state.panels.some(p=>p.id===state.activePanelId && p.rawData.length);
    btn.classList.toggle('active-delete', hasActive);
    btn.style.opacity = hasActive ? '1' : '0.45';
    btn.style.cursor  = hasActive ? 'pointer' : 'default';
  }
  // HTML icon bar delete button
  const pibDel = v('pib-delete');
  if (pibDel) {
    const hasActive = state.activePanelId !== null && state.panels.some(p=>p.id===state.activePanelId && p.rawData.length);
    pibDel.classList.toggle('enabled', hasActive);
    pibDel.disabled = !hasActive;
  }
}

export function updateMoveBtn() {
  const up = v('moveUpBtn'), dn = v('moveDownBtn');
  if (up && dn) {
    const idx = state.panels.findIndex(p=>p.id===state.activePanelId);
    const show = state.panels.length > 1;
    up.style.opacity = (show && idx > 0) ? '1' : '0.3';
    dn.style.opacity = (show && idx < state.panels.length-1) ? '1' : '0.3';
  }
  // HTML icon bar move buttons
  const pibUp = v('pib-up'), pibDn = v('pib-down');
  if (pibUp && pibDn) {
    const idx = state.panels.findIndex(p=>p.id===state.activePanelId);
    const multi = state.panels.length > 1;
    pibUp.disabled  = !(multi && idx > 0);
    pibDn.disabled  = !(multi && idx < state.panels.length-1);
  }
}

// ── Edit mode ──────────────────────────────────────────────────────────────────
export function positionEditBar() {
  const tag = v('edit-bar-panel-tag');
  if (!tag) return;
  const p = activePanel();
  if (!p) { tag.innerHTML = ''; return; }
  const pi = state.panels.findIndex(pp => pp.id === p.id);
  const color = PANEL_COLORS[pi % PANEL_COLORS.length];
  const dot = state.panels.length > 1
    ? `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>`
    : '';
  tag.innerHTML = `${dot}<span style="color:${color}">${p.title || 'Subplot ' + (pi+1)}</span>`;
}

export function toggleEditMode() {
  if (!state.panels.some(p=>p.rawData.length)) return;
  controls.editMode = !controls.editMode;
  const btn = v('editModeBtn');
  if (btn) { btn.classList.toggle('active', controls.editMode); btn.textContent = controls.editMode ? '✎ Editing…' : '✎ Edit Visible Terms'; }
  const pibEdit = v('pib-edit');
  if (pibEdit) pibEdit.classList.toggle('active', controls.editMode);
  const eb = v('edit-bar');
  if (controls.editMode) {
    state.panels.forEach(p => { p.editSnapshot = new Set(p.hiddenTerms); });
    positionEditBar();
    eb.classList.add('open');
  } else {
    eb.classList.remove('open');
  }
  updateResetBtn();
  renderAll();
}

export function applyEditMode() {
  controls.editMode = false;
  const btn = v('editModeBtn');
  if (btn) { btn.classList.remove('active'); btn.textContent = '✎ Edit Visible Terms'; }
  const pibEdit = v('pib-edit');
  if (pibEdit) pibEdit.classList.remove('active');
  v('edit-bar').classList.remove('open');
  updateResetBtn();
  renderAll();
}

export function cancelEditMode() {
  state.panels.forEach(p => { if(p.editSnapshot) p.hiddenTerms=new Set(p.editSnapshot); });
  applyEditMode();
}

// ── Reset ──────────────────────────────────────────────────────────────────────
export function contextReset() {
  const btn = v('resetBtn');
  if (state.clusterMode) {
    // Reset active panel clusters only — re-seed from its visible terms
    const ap = activePanel();
    if (ap) {
      const visibleTerms = getPanelData(ap).map(d => d.term_name);
      state.clusterCounter = 3;
      ap.clusters = [
        { id: 0, name: 'Ungrouped', color: '#90a4ae', terms: [...visibleTerms] },
        { id: 1, name: 'Cluster 1',  color: CLUSTER_PALETTE[0], terms: [] },
        { id: 2, name: 'Cluster 2',  color: CLUSTER_PALETTE[1], terms: [] },
      ];
    }
    renderClusterBar(); renderAll(); updateResetBtn();
  } else if (controls.editMode) {
    // Reset hidden terms but STAY in edit mode
    state.panels.forEach(p => { p.hiddenTerms = new Set(); });
    renderAll(); updateResetBtn();
  } else {
    resetAll();
  }
}

export function updateResetBtn() {
  const btn = v('resetBtn');
  const pibReset = v('pib-reset');
  const ebReset = v('eb-reset-btn');
  let label = '↺ Reset Filters';
  let title = 'Reset Filters';
  // If both modes active, edit mode takes priority for label
  if (state.clusterMode && controls.editMode) { label = '↺ Reset Edits'; title = 'Reset Edits'; }
  else if (state.clusterMode) { label = '↺ Reset Clustering'; title = 'Reset Clustering'; }
  else if (controls.editMode) { label = '↺ Reset Edits'; title = 'Reset Edits'; }
  if (btn) btn.textContent = label;
  if (pibReset) pibReset.title = title;
  if (ebReset) ebReset.title = title;
}

export function resetAll() {
  const ap = activePanel();
  const toReset = ap ? [ap] : state.panels;
  toReset.forEach(p => {
    p.hiddenTerms = new Set();
    p.filters = defaultFilters(p.rawData);
    p.appearance = defaultAppearance();
    // clusters are NOT reset here — use Cancel/Reset in cluster bar to clear those
  });
  controls.editMode=false;
  v('editModeBtn').classList.remove('active');
  v('editModeBtn').textContent='✎ Edit Visible Terms';
  v('edit-bar').classList.remove('open');
  controls.lolipop=true;
  const tog=v('lolipopToggle'); if(!tog.classList.contains('on')) tog.classList.add('on');
  if (state.activePanelId !== null) setActivePanelId(state.activePanelId);
  // If gene matrix is active, re-expand all terms that are now visible after reset
  if (state.accordionMode) {
    toReset.forEach(p => {
      getPanelData(p).forEach(d => openTermKeys.add(p.id + '::' + d.term_name));
    });
  }
  renderAll();
  updateGenePanelBtn();
}
