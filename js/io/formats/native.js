// io/formats/native.js: Native format (pass-through). Fills the normalised row `n` from the raw row `obj`. No DOM access.

// Native format
export function normaliseNative(obj, n) {
  n.term_name         = obj['term_name'] || '';
  n.term_id           = obj['term_id'] || obj['go_id'] || obj['Term ID'] || '';
  // Handle Excel-corrupted -log10(padj) column name (#NAME? is Excel's formula error display)
  n['-log10(padj)']   = +obj['-log10(padj)'] || +obj['#NAME?'] || +obj['-log10(p_adj)'] || +obj['-log10(pval)'] || 0;
  n.term_size         = +obj['term_size'] || 0;
  n.intersection_size = +obj['intersection_size'] || 0;
  n.query_size        = +obj['query_size'] || 0;
  n['log2(Fold_Enrichment)'] = +obj['log2(Fold_Enrichment)'] || 0;
  n.p_value           = +obj['p_value'] || 0;
  n.group_name        = obj['group_name'] || 'All';
  n.genes = (obj['intersection'] || obj['intersections'] || obj['genes'] || '').split(/[,;\s]+/).map(g=>g.trim()).filter(Boolean);
}
