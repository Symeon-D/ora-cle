// io/examples.js: Format-error toast, supported-format examples and built-in example data.
import { parseFileText } from './parse.js';
import { addPanel, setActivePanelId, updateDropZones } from '../panels.js';
import { renderAll } from '../plot/render.js';
import { activePanel, defaultAppearance, defaultFilters, state } from '../state.js';
import { v } from '../utils.js';

// ── Sidebar toggle ─────────────────────────────────────────────────────────────

// ── Format error & examples ───────────────────────────────────────────────────
export function showFormatError(msg, filename) {
  const toast = v('format-error-toast');
  v('toast-error-body').textContent = `"${filename}" — ${msg}`;
  toast.classList.add('show');
  // Auto-expand the supported formats section
  const ex = v('format-examples');
  if (ex && !ex.classList.contains('open')) {
    ex.classList.add('open');
    const btn = v('show-examples-btn');
    if (btn) btn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Hide format examples';
  }
  // Also ensure drop overlay is visible
  v('main-drop-overlay').classList.remove('hidden');
  setTimeout(() => toast.classList.remove('show'), 8000);
}

export function showExamplesFromToast() {
  v('format-error-toast').classList.remove('show');
  const ex = v('format-examples');
  ex.classList.add('open');
  v('show-examples-btn').textContent = '▲ Hide format examples';
}

export function toggleFormatExamples(e) {
  e.stopPropagation();
  const ex = v('format-examples');
  const btn = v('show-examples-btn');
  const open = ex.classList.toggle('open');
  btn.innerHTML = open
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Hide format examples'
    : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Show supported formats &amp; examples';
}

export function loadExampleData(fmt) {
  const examples = {
    native: `term_name\t-log10(padj)\tterm_size\tintersection_size\tquery_size\tlog2(Fold_Enrichment)\tp_value
axon development\t8.42\t312\t18\t85\t3.21\t3.8e-9
synapse organization\t6.17\t198\t12\t85\t2.95\t6.7e-7
neuron projection morphogenesis\t5.84\t267\t14\t85\t2.78\t1.4e-6
dendrite development\t5.11\t241\t13\t85\t2.64\t7.8e-6
regulation of synaptic plasticity\t4.73\t154\t10\t85\t2.91\t1.9e-5
myelination\t4.55\t89\t8\t85\t3.44\t2.8e-5
glial cell differentiation\t4.22\t143\t9\t85\t2.70\t6.0e-5
axon guidance\t3.98\t188\t10\t85\t2.53\t1.0e-4
learning or memory\t3.61\t112\t7\t85\t2.66\t2.5e-4
long-term potentiation\t3.40\t67\t6\t85\t3.14\t4.0e-4`,

    gprofiler: `source,term_name,term_id,highlighted,adjusted_p_value,negative_log10_of_adjusted_p_value,term_size,query_size,intersection_size,effective_domain_size,intersections
GO:BP,negative regulation of cellular process,GO:0048523,true,5.3e-5,4.275,5540,20,16,24018,Gene1
GO:BP,regulation of phosphorylation,GO:0042325,false,6.1e-5,4.214,753,20,8,24018,Gene2
GO:BP,regulation of protein modification,GO:0031399,false,7.2e-5,4.143,942,20,9,24018,Gene3
GO:BP,negative regulation of phosphorylation,GO:0042326,false,1.2e-4,3.921,447,20,7,24018,Gene1
GO:BP,negative regulation of kinase activity,GO:0033673,false,2.1e-4,3.678,312,20,6,24018,Gene2
GO:MF,protein phosphatase inhibitor activity,GO:0004864,true,9.05e-8,7.043,47,20,5,24018,Gene1
GO:MF,phosphatase inhibitor activity,GO:0019212,false,1.38e-7,6.859,51,20,5,24018,Gene2
GO:MF,phosphatase regulator activity,GO:0019207,false,2.91e-7,6.536,56,20,5,24018,Gene1
GO:MF,protein serine/threonine phosphatase inhibitor activity,GO:0004864,false,1.18e-6,5.928,22,20,4,24018,Gene3
GO:MF,enzyme inhibitor activity,GO:0004857,false,3.24e-5,4.489,290,20,5,24018,Gene2
REAC,BRF1 binds and destabilizes mRNA,REAC:R-MMU-870392,false,0.0247,1.607,16,20,2,24018,Gene1
TF,Factor: LRF motif GGGGKY,TF:M01856,false,0.00418,2.379,5094,20,14,24018,Gene1
TF,Factor: IKZF1 motif GGGAA,TF:M00935,false,0.00418,2.379,3904,20,11,24018,Gene2`,

    genecodis: `description\tannotation_id\tgenes_found\tinput_size\tterm_genes\tuniverse\tpval\tpval_adj\trelative_enrichment\tannotsbias\tgenes
glial cell differentiation\tGO:0010001\t8\t35\t33\t25033\t8.35e-17\t1.04e-14\t173.4\t0\tGene1 Gene2
axon development\tGO:0061564\t7\t35\t188\t25033\t1.2e-10\t3.2e-12\t84.2\t0\tGene1 Gene3
synapse organization\tGO:0050808\t6\t35\t198\t25033\t3.4e-9\t2.1e-11\t68.5\t0\tGene2 Gene4
neuron migration\tGO:0001764\t5\t35\t143\t25033\t2.1e-8\t4.8e-10\t79.1\t0\tGene1 Gene5
myelination\tGO:0042552\t5\t35\t89\t25033\t4.5e-8\t8.2e-10\t127.3\t0\tGene3 Gene6
dendrite development\tGO:0016358\t5\t35\t241\t25033\t1.8e-7\t2.5e-9\t47.0\t0\tGene2 Gene7
regulation of neurogenesis\tGO:0050767\t4\t35\t312\t25033\t3.2e-6\t1.9e-8\t29.1\t0\tGene1 Gene8
oligodendrocyte differentiation\tGO:0048709\t4\t35\t98\t25033\t8.9e-6\t3.8e-8\t92.6\t0\tGene4 Gene9
brain development\tGO:0007420\t6\t35\t421\t25033\t1.1e-5\t4.1e-8\t32.4\t0\tGene2 Gene5
learning or memory\tGO:0007611\t3\t35\t112\t25033\t2.4e-5\t7.6e-8\t60.9\t0\tGene1 Gene3`
  };

  const text = examples[fmt];
  if (!text) return;
  const parsed = parseFileText(text);
  if (!parsed.data.length) return;

  // gProfiler with multiple sources → one subplot per source (same as real file load)
  if (parsed.fmt === 'gprofiler') {
    const sources = [...new Set(parsed.data.map(d => d.group_name))];
    if (sources.length > 1) {
      sources.forEach(src => {
        const srcData = parsed.data.filter(d => d.group_name === src);
        if (!srcData.length) return;
        const id = state.panelCounter++;
        const p = {
          id, title: src,
          rawData: srcData, fmt: 'gprofiler',
          hiddenTerms: new Set(), editSnapshot: null,
          filters: defaultFilters(srcData),
          appearance: defaultAppearance()
        };
        p.filters.groupName = src;
        state.panels.push(p);
      });
      v('main-drop-overlay').classList.add('hidden');
      setActivePanelId(state.panels[0].id);
      updateDropZones();
      renderAll();
      return;
    }
  }

  // Single source / native / genecodis
  let panel = activePanel();
  if (!panel || panel.rawData.length) panel = addPanel(null);
  panel.rawData = parsed.data;
  panel.fmt     = parsed.fmt;
  panel.title   = fmt === 'gprofiler' ? 'gProfiler Example' : fmt === 'genecodis' ? 'GeneCodis Example' : 'Native Example';
  panel.hiddenTerms = new Set();
  panel.filters = defaultFilters(panel.rawData);
  v('main-drop-overlay').classList.add('hidden');
  setActivePanelId(panel.id);
  renderAll();
}
