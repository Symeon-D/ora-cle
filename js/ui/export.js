// ui/export.js: PNG and CSV export.
import { getPanelClusters, getTermCluster } from '../clustering/manual.js';
import { getPanelData } from '../pipeline.js';
import { renderAll } from '../plot/render.js';
import { state } from '../state.js';
import { v } from '../utils.js';

// ── PNG Export ─────────────────────────────────────────────────────────────────
export function downloadPNG() {
  // Temporarily deselect panel so highlight border/fill don't appear in export
  const savedActiveId = state.activePanelId;
  state.activePanelId = null;
  renderAll();
  const svgEl = v('combined-svg');
  if (!svgEl||!svgEl.getAttribute('width')) { state.activePanelId = savedActiveId; renderAll(); alert('No chart to save yet.'); return; }
  const W=+svgEl.getAttribute('width'), H=+svgEl.getAttribute('height'), SCALE=2.5;
  const clone=svgEl.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.removeAttribute('style'); clone.style.background='white';
  const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');
  bg.setAttribute('width',W); bg.setAttribute('height',H); bg.setAttribute('fill','white');
  clone.insertBefore(bg,clone.firstChild);
  const st=document.createElementNS('http://www.w3.org/2000/svg','style');
  st.textContent='text{font-family:monospace;}';
  clone.insertBefore(st,clone.firstChild);
  const b64=btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
  const canvas=document.createElement('canvas');
  canvas.width=W*SCALE; canvas.height=H*SCALE;
  const ctx=canvas.getContext('2d');
  const img=new Image();
  img.onload=()=>{ ctx.fillStyle='white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height); const a=document.createElement('a'); a.href=canvas.toDataURL('image/png'); a.download='GO_enrichment.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); state.activePanelId=savedActiveId; renderAll(); };
  img.src='data:image/svg+xml;base64,'+b64;
}

export function downloadCSV() {
  // Collect visible data from all panels, respecting filters, hidden terms, clusters
  const rows = [];

  // Header columns
  const cols = [
    'panel', 'term_id', 'term_name', 'p_value', '-log10(padj)',
    'term_size', 'intersection_size', 'query_size',
    'log2(Fold_Enrichment)', 'genes', 'cluster', 'cluster_name'
  ];

  state.panels.forEach(panel => {
    const data = getPanelData(panel);  // already filtered + hidden terms removed
    const panelName = panel.title || ('Panel ' + (state.panels.indexOf(panel)+1));
    const hasClusters = getPanelClusters(panel).length > 0;

    data.forEach(d => {
      const cl = hasClusters ? getTermCluster(d.term_name, panel) : null;
      rows.push({
        panel:                  panelName,
        term_id:                d.term_id || '',
        term_name:              d.term_name || '',
        p_value:                d.p_value != null ? d.p_value : '',
        '-log10(padj)':         d['-log10(padj)'] != null ? d['-log10(padj)'] : '',
        term_size:              d.term_size != null ? d.term_size : '',
        intersection_size:      d.intersection_size != null ? d.intersection_size : '',
        query_size:             d.query_size != null ? d.query_size : '',
        'log2(Fold_Enrichment)': d['log2(Fold_Enrichment)'] != null ? d['log2(Fold_Enrichment)'] : '',
        genes:                  (d.genes || []).join(','),
        cluster:                cl ? cl.id : '',
        cluster_name:           cl ? cl.name : ''
      });
    });
  });

  if (!rows.length) { alert('No visible terms to export.'); return; }

  // Build CSV string
  const escape = v => {
    const s = String(v == null ? '' : v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? '"' + s.replace(/"/g, '""') + '"'
      : s;
  };
  const lines = [cols.join(',')];
  rows.forEach(r => lines.push(cols.map(c => escape(r[c])).join(',')));
  const csv = lines.join('\n');

  // Download
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  // Use panel title if single panel, else generic name
  const fname = state.panels.length === 1
    ? (state.panels[0].title || 'GO_enrichment') + '.csv'
    : 'GO_enrichment.csv';
  a.download = fname;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
