// io/formats/gprofiler.js: g:Profiler export. Fills the normalised row `n` from the raw row `obj`. No DOM access.

// g:Profiler
export function normaliseGprofiler(obj, n) {
  n.term_name         = obj['term_name'] || obj['Term Name'] || '';
  n.term_id           = obj['term_id'] || obj['Term ID'] || '';
  n['-log10(padj)']   = +obj['negative_log10_of_adjusted_p_value'] || 0;
  n.term_size         = +obj['term_size'] || 0;
  n.intersection_size = +obj['intersection_size'] || 0;
  n.query_size        = +obj['query_size'] || 0;
  n.p_value           = +obj['adjusted_p_value'] || 0;
  // FE = (intersection/query) / (term_size/effective_domain_size)
  const effDom = +obj['effective_domain_size'] || 1;
  const fe = n.query_size > 0 && effDom > 0
    ? (n.intersection_size / n.query_size) / (n.term_size / effDom)
    : 1;
  n['log2(Fold_Enrichment)'] = fe > 0 ? Math.log2(fe) : 0;
  n.group_name = obj['source'] || 'All';
  n.genes = (obj['intersections'] || '').split(',').map(g=>g.trim()).filter(Boolean);
}
