// io/formats/genecodis.js: GeneCodis export. Fills the normalised row `n` from the raw row `obj`. No DOM access.

// GeneCodis
export function normaliseGenecodis(obj, n) {
  n.term_name         = obj['description'] || '';
  n.term_id           = obj['annotation_id'] || obj['term_id'] || obj['go_id'] || obj['Term ID'] || '';
  const padj          = +obj['pval_adj'] || +obj['pval'] || 1e-10;
  n['-log10(padj)']   = padj > 0 ? -Math.log10(padj) : 0;
  n.term_size         = +obj['term_genes'] || +obj['term_size'] || 0;
  n.intersection_size = +obj['genes_found'] || +obj['intersection_size'] || 0;
  n.query_size        = +obj['input_size'] || +obj['query_size'] || 0;
  n.p_value           = padj;
  // relative_enrichment is linear FE ratio
  const linFE = +obj['relative_enrichment'] || 1;
  n['log2(Fold_Enrichment)'] = linFE > 0 ? Math.log2(linFE) : 0;
  n.group_name = obj['group_name'] || 'All';
  n.genes = (obj['genes_list'] || obj['genes'] || '').split(/[,;\s]+/).map(g=>g.trim()).filter(Boolean);
}
