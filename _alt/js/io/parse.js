// io/parse.js: File parsing: separator handling, format detection, row normalisation. No DOM access.
import { normaliseGprofiler } from './formats/gprofiler.js';
import { normaliseGenecodis } from './formats/genecodis.js';
import { normaliseNative } from './formats/native.js';

export function parseLine(line, sep) {
  if (sep !== ',') return line.split('\t');
  const res=[]; let cur='', inQ=false;
  for (const c of line) {
    if (c==='"') inQ=!inQ;
    else if (c===',' && !inQ) { res.push(cur); cur=''; }
    else cur+=c;
  }
  res.push(cur); return res;
}

// ── Universal format detector ─────────────────────────────────────────────────
export function detectFormat(headers) {
  const h = headers.map(x => x.toLowerCase());
  // Native first: has term_name + -log10(padj) — takes priority over anything else
  if (h.includes('term_name') && h.includes('-log10(padj)'))
    return 'native';
  // gProfiler: has the long p-value column name (never present in native)
  if (h.includes('negative_log10_of_adjusted_p_value') ||
      (h.includes('effective_domain_size') && h.includes('source')))
    return 'gprofiler';
  // GeneCodis
  if (h.includes('relative_enrichment') || (h.includes('description') && h.includes('pval_adj')))
    return 'genecodis';
  // Native fallback: has term_name + fold enrichment but maybe different padj column name
  if (h.includes('term_name') && h.includes('log2(fold_enrichment)'))
    return 'native';
  // Unrecognised
  return 'unknown';
}

// Normalise one raw row (header -> string) into the internal row shape.
export function normaliseRow(obj, fmt) {
  const n = {}; // normalised row

  if (fmt === 'gprofiler') {
    normaliseGprofiler(obj, n);
  } else if (fmt === 'genecodis') {
    normaliseGenecodis(obj, n);
  } else {
    normaliseNative(obj, n);
  }
  // Detect any cluster column (cluster, rrvgo_cluster, part_cluster, etc.)
  const clusterKey = Object.keys(obj).find(k => /cluster/i.test(k));
  if (clusterKey) n._rrvgoCluster = obj[clusterKey].trim();
  return n;
}

export function parseFileText(text) {
  const sep = text.includes('\t') ? '\t' : ',';
  // Strip lines starting with '#' (e.g. g:Profiler metadata headers)
  const lines = text.trim().split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'));
  const headers = lines[0].split(sep).map(h => h.replace(/\r/g,'').replace(/^"|"$/g,'').trim());
  const fmt = detectFormat(headers);
  if (fmt === 'unknown') return { data: [], fmt: 'unknown', error: `Unrecognised file format — see supported formats above. Detected columns: ${headers.slice(0,6).join(', ')}…` };

  const data = lines.slice(1).map(line => {
    const vals = parseLine(line, sep);
    const obj = {};
    headers.forEach((h,i) => { obj[h] = (vals[i]||'').replace(/\r/g,'').replace(/^"|"$/g,'').trim(); });
    return normaliseRow(obj, fmt);
  }).filter(d => d.term_name);

  const hasCluster = data.some(d => d._rrvgoCluster !== undefined);
  return { data, fmt, hasCluster };
}
