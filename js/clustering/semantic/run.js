// clustering/semantic/run.js: Semantic clustering button: runs the chosen method on the active panel.
import { renderClusterBar } from '../manual-ui.js';
import { hierarchicalCluster } from './linkage.js';
import { computeSimilarityMatrix } from './matrix.js';
import { icUnavailableMessage, loadGoDag, loadIC } from '../../go/data.js';
import { getPanelData } from '../../pipeline.js';
import { renderAll } from '../../plot/render.js';
import { CLUSTER_PALETTE, activePanel, state } from '../../state.js';
import { refreshMethodAvailability } from '../../ui/organism.js';
import { v } from '../../utils.js';

// ── Method description helper ─────────────────────────────────────────────────
export const METHOD_DESCRIPTIONS = {
  Wang:   "Uses the structure of the GO graph to measure how closely two terms are related. No extra data needed — works for any organism. Best starting point and closely matches rrvgo.",
  Resnik: "Two terms are more similar if their closest shared ancestor is more specific (annotates fewer genes). Rewards depth in the ontology.",
  Lin:    "Resnik score divided by the sum of both terms\' specificities, giving a 0–1 scale. More evenly distributed than raw Resnik.",
  Rel:    "Like Lin but further discounts ancestors that are very broad (annotate many genes). Often the best IC-based choice for GO.",
  Jiang:  "Converts a dissimilarity distance into a 0–1 similarity. Produces more clusters than other methods."
};

export function updateMethodDescription() {
  const sel = v('clusterMethod');
  const desc = v('methodDesc');
  const btn  = v('wangClusterBtn');
  if (!sel || !desc) return;
  const m = sel.value;
  desc.textContent = METHOD_DESCRIPTIONS[m] || '';
  if (btn) btn.textContent = `⚛ Cluster (${m})`;
}

export async function runWangClustering() {
  const ap = activePanel(); if (!ap) return;
  const threshold = parseFloat(v('wangThreshold')?.value||0.7);
  const method    = v('clusterMethod')?.value || 'Wang';
  const btn = v('wangClusterBtn');
  const statusEl = v('wangStatusMsg');
  if (btn) { btn.textContent='⏳ Clustering…'; btn.disabled=true; }
  if (statusEl) statusEl.textContent='';
  await new Promise(r=>setTimeout(r,30));
  try {
    const dag = await loadGoDag();
    if (!dag) {
      if (statusEl) statusEl.textContent='⚠ Could not load the GO graph (data/go-dag.json). Serve the folder over HTTP and run tools/build_data.py if the file is missing.';
      return;
    }
    const data = getPanelData(ap);
    const needsIC = method !== 'Wang';
    // IC is organism-specific and loaded on demand (Wang does not need it)
    const ic = needsIC ? await loadIC(state.organism) : null;
    const hasIC = !!ic && Object.keys(ic).length > 0;
    if (needsIC && !ic) refreshMethodAvailability();   // IC file failed to load: disable the IC methods

    // IC-based methods require embedded IC values
    if (needsIC && !hasIC) {
      if (statusEl) statusEl.textContent = icUnavailableMessage(method, state.organism);
      return;
    }

    const valid=[], invalid=[];
    data.forEach(d => {
      const inDag = d.term_id && dag[d.term_id];
      // IC methods: terms without IC → Ungrouped (matches rrvgo exactly)
      const inIC  = !needsIC || (!hasIC ? true : ic[d.term_id] !== undefined);
      if (inDag && inIC) valid.push(d);
      else invalid.push(d);
    });
    if (valid.length<2) {
      if (statusEl) statusEl.textContent=`Need ≥2 terms with GO IDs in DAG! Found ${valid.length}.`;
      return;
    }
    const n=valid.length;
    const termIds = valid.map(d => d.term_id);
    const sim = computeSimilarityMatrix(termIds, dag, ic || {}, method);
    // Replace NaN with 0 (terms that couldn't be compared)
    for (let i=0;i<n;i++) for (let j=0;j<n;j++) if (isNaN(sim[i][j])) sim[i][j]=0;
    const assignment=hierarchicalCluster(sim,threshold);
    const nClusters=Math.max(...assignment)+1;
    const clusterTerms=Array.from({length:nClusters},()=>[]);
    valid.forEach((d,i)=>clusterTerms[assignment[i]].push(d));
    const scoreOf=d=>d['-log10(padj)']||0;
    const clusterScores=clusterTerms.map(ts=>Math.max(...ts.map(scoreOf)));
    const clusterRank=clusterScores.map((s,i)=>[s,i]).sort((a,b)=>b[0]-a[0]).map(([,i])=>i);
    const ungrouped={id:0,name:'Ungrouped',color:'#90a4ae',
      terms:invalid.map(d=>d.term_name)};
    // Sort clusters by term count descending
    clusterRank.sort((a,b)=>clusterTerms[b].length-clusterTerms[a].length);
    const userCls=clusterRank.map((origIdx,rank)=>({
      id:rank+1, name:`Cluster ${rank+1}`,
      color:CLUSTER_PALETTE[rank%CLUSTER_PALETTE.length],
      terms:clusterTerms[origIdx].sort((a,b)=>scoreOf(b)-scoreOf(a)).map(d=>d.term_name)
    }));
    ap.clusters=[...userCls,ungrouped];
    state.clusterCounter=userCls.length+1;
    if (!state.clusterMode) {
      state.clusterMode=true;
      const cmb=v('clusterModeBtn'); if(cmb) cmb.classList.add('active');
      const pibcl=v('pib-cluster'); if(pibcl) pibcl.classList.add('active');
      v('cluster-bar').classList.add('open');
    }
    renderClusterBar(); renderAll();
    const icNote = (needsIC || hasIC) ? ` [${method}]` : ' [Wang]';
    const msg=`✓ ${valid.length} terms${icNote} → ${nClusters} clusters`+
      (invalid.length?` (+${invalid.length} ungrouped)`:'');
    if (statusEl) statusEl.textContent=msg;
  } finally {
    if (btn) { btn.textContent=`⚛ Cluster (${v('clusterMethod')?.value||'Wang'})`; btn.disabled=false; }
  }
}
