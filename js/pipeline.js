// pipeline.js: Data pipeline: filter, sort, slice and cluster-order the rows of a panel. No DOM access.
import { getPanelClusters, getTermCluster } from './clustering/manual.js';
import { controls } from './state.js';

export function getPanelData(panel) {
  if (!panel || !panel.rawData.length) return [];
  let data = panel.rawData.filter(d => d.group_name === panel.filters.groupName);
  data = data.filter(d => d.intersection_size >= panel.filters.minInter && d.term_size >= (panel.filters.minTerm||1) && d.term_size <= panel.filters.maxTerm);
  if (panel.filters.minLog2FE !== undefined) data = data.filter(d => (d['log2(Fold_Enrichment)']||0) >= panel.filters.minLog2FE);
  data.sort((a,b) => b['-log10(padj)'] - a['-log10(padj)']);
  data = data.slice(0, panel.filters.topN);
  if (!controls.editMode) data = data.filter(d => !panel.hiddenTerms.has(d.term_name));
  data.forEach(d => { d._hidden = panel.hiddenTerms.has(d.term_name); });

  // When clustering: reorder so terms are grouped by cluster, sorted by -log10 within each
  if (getPanelClusters(panel).length > 0) {
    const clusterOrder = getPanelClusters(panel).map(c => c.id);
    data.sort((a, b) => {
      const ca = getTermCluster(a.term_name, panel);
      const cb = getTermCluster(b.term_name, panel);
      const ia = ca ? clusterOrder.indexOf(ca.id) : clusterOrder.length;
      const ib = cb ? clusterOrder.indexOf(cb.id) : clusterOrder.length;
      if (ia !== ib) return ia - ib;
      return b['-log10(padj)'] - a['-log10(padj)'];
    });
  }
  return data;
}
