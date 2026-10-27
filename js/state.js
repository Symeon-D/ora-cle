// state.js
// Shared application state. Imported by every module that needs it.
// Bindings that were reassigned in the old single-file script (`let panels = []; ... panels = x`)
// live as properties of `state`, because an imported binding cannot be reassigned from another module.

// Each panel: { id, title, rawData, hiddenTerms, editSnapshot, filters, appearance }
// filters: { topN, minInter, maxTerm, groupName }
// appearance: { dotScale, lineWidth, colorLow, colorHigh, sizeMode }
export const state = {
  panels: [],
  panelCounter: 0,
  activePanelId: 0,
  clusterMode: false,
  clusterCounter: 0,
  dragSrcTerm: null,
  dragHoverPill: null,
  assignMenuOpen: false,
  accordionMode: false,
  _stickyInfo: null,
  _stickyTermInfo: null,
  organism: null,   // id of the selected organism ('other' = none); set by ui/organism.js
};

// Global controls (shared)
export const controls = { lolipop: true, editMode: false };

export const PANEL_COLORS = ['#4fc3f7','#f06292','#4db6ac','#ff8a65','#ba68c8','#81c784','#ffb74d'];
export const CLUSTER_PALETTE = [
  '#7c83fd','#f06292','#4db6ac','#ff8a65','#ba68c8',
  '#4fc3f7','#81c784','#ffb74d','#e57373','#64b5f6',
  '#4dd0e1','#aed581','#ffd54f','#ce93d8','#80cbc4'
];
export const openTermKeys = new Set();

export function activePanel() { return state.panels.find(p => p.id === state.activePanelId) || state.panels[0]; }

export function defaultFilters(rawData) {
  const minInterActual = rawData.length ? Math.min(...rawData.map(d=>d.intersection_size)) : 1;
  const minTermActual  = rawData.length ? Math.min(...rawData.map(d=>d.term_size)) : 1;
  return {
    topN:      rawData.length,
    minInter:  minInterActual,
    minTerm:   minTermActual,
    maxTerm:   rawData.length ? Math.max(...rawData.map(d=>d.term_size)) : 5000,
    minLog2FE: rawData.length ? Math.min(...rawData.map(d=>d['log2(Fold_Enrichment)']||0)) - 0.01 : -100,
    groupName: rawData[0]?.group_name || 'All'
  };
}

export function defaultAppearance() {
  return { dotScale:8, lineWidth:2, colorLow:'#2196f3', colorHigh:'#f44336', sizeMode:'percentage', fontSize:13, titleSize:16 };
}
