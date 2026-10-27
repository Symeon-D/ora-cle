// clustering/manual.js: Manual clustering: cluster data model on panels. No DOM access.
import { CLUSTER_PALETTE, activePanel, state } from '../state.js';

// Build panel clusters from _rrvgoCluster field on rawData rows
export function applyRrvgoClusters(panel) {
  const rows = panel.rawData.filter(d => d._rrvgoCluster !== undefined);
  if (!rows.length) return;

  // Collect numeric cluster ids (non-ungrouped)
  const numericIds = [...new Set(
    rows.map(d => d._rrvgoCluster)
        .filter(c => c && !/^(ungrouped|na|)$/i.test(c) && !isNaN(+c))
        .map(c => +c)
  )].sort((a,b) => a-b);

  // Build cluster objects
  const ungrouped = { id: 0, name: 'Ungrouped', color: '#90a4ae', terms: [] };
  const clusterObjs = [ungrouped];
  numericIds.forEach((num, i) => {
    clusterObjs.push({
      id: num,
      name: `Cluster ${num}`,
      color: CLUSTER_PALETTE[(i) % CLUSTER_PALETTE.length],
      terms: []
    });
  });

  // Assign terms to clusters preserving data order
  rows.forEach(d => {
    const raw = d._rrvgoCluster;
    const isUngrouped = !raw || /^(ungrouped|na|)$/i.test(raw) || isNaN(+raw);
    if (isUngrouped) {
      ungrouped.terms.push(d.term_name);
    } else {
      const cl = clusterObjs.find(c => c.id === +raw);
      if (cl) cl.terms.push(d.term_name);
    }
  });

  // Set clusters: user clusters first, ungrouped last
  const userCls = clusterObjs.filter(c => c.id !== 0);
  panel.clusters = [...userCls, ungrouped];
  state.clusterCounter = Math.max(state.clusterCounter, numericIds.length > 0 ? Math.max(...numericIds) + 1 : 3);
}

// Per-panel cluster storage
export function getPanelClusters(panel) {
  if (!panel) return [];
  if (!panel.clusters) panel.clusters = [];
  return panel.clusters;
}

export function userClusters() { return getPanelClusters(activePanel()); }

// For backwards compat: set on active panel
export function setUserClusters(arr) { const p = activePanel(); if (p) p.clusters = arr; }

export function getTermCluster(termName, panel) {
  const cls = panel ? getPanelClusters(panel) : userClusters();
  for (const cl of cls) {
    if (cl.terms.includes(termName)) return cl;
  }
  return null;
}

// Ensure Ungrouped cluster contains exactly the visible terms not in any named cluster.
// Called each render cycle so filter changes are reflected immediately.
export function reconcileUngrouped(panel, visibleTerms) {
  const clusters = getPanelClusters(panel);
  if (!clusters.length) return;
  const ungrouped = clusters.find(c => c.id === 0);
  if (!ungrouped) return;
  const assignedTerms = new Set();
  clusters.forEach(c => { if (c.id !== 0) c.terms.forEach(t => assignedTerms.add(t)); });
  // Ungrouped = visible terms not assigned to any named cluster
  ungrouped.terms = visibleTerms.filter(t => !assignedTerms.has(t));
}

// Sync cluster definitions (id, name, color) across all panels.
// Each panel keeps its own term assignments; missing clusters get empty terms.
// New terms on a panel that aren't in any named cluster go to Ungrouped.
export function syncClusterDefs() {
  // Collect union of all cluster definitions across panels
  const defMap = new Map();  // id -> {id, name, color}
  state.panels.forEach(p => {
    (p.clusters || []).forEach(c => {
      if (!defMap.has(c.id)) defMap.set(c.id, { id: c.id, name: c.name, color: c.color });
    });
  });
  if (defMap.size === 0) return;
  // Ensure every panel has every cluster definition
  state.panels.forEach(p => {
    if (!p.clusters || p.clusters.length === 0) return;
    const existingIds = new Set(p.clusters.map(c => c.id));
    defMap.forEach((def, id) => {
      if (!existingIds.has(id)) {
        // Add missing cluster with empty terms
        p.clusters.push({ id: def.id, name: def.name, color: def.color, terms: [] });
      } else {
        // Sync name and color from definition (in case renamed/recolored)
        const cl = p.clusters.find(c => c.id === id);
        if (cl) { cl.name = def.name; cl.color = def.color; }
      }
    });
    // Preserve user-defined cluster order (moveTermToCluster manages ordering)
  });
}
