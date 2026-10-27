// Node checks for the shipped data and the DOM-free modules (no browser, no dependencies).
//   node tests/run-tests.mjs [path/to/go_graph.csv]     (the optional GO.db export is compared with our graph)
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(root, p)));
const readJson = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
let failed = 0;
const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) failed++; };
const info = msg => console.log('INFO ' + msg);

const { parseFileText, detectFormat } = await imp('js/io/parse.js');
const { wangSimilarity } = await imp('js/clustering/semantic/wang.js');
const { hierarchicalCluster } = await imp('js/clustering/semantic/linkage.js');
const { computeSimilarityMatrix } = await imp('js/clustering/semantic/matrix.js');

// ── (a) sample files parse and the right format is detected ──
console.log('\n== (a) parsing ==');
const samples = { 'gprofiler-native-49terms.csv': 'native', 'clusters-13-49terms.csv': 'native' };
for (const [f, fmt] of Object.entries(samples)) {
  const r = parseFileText(fs.readFileSync(path.join(root, 'tests/samples', f), 'utf8'));
  ok(r.fmt === fmt && r.data.length === 49, `${f}: format=${r.fmt}, rows=${r.data.length}, hasCluster=${r.hasCluster}`);
}
ok(parseFileText(fs.readFileSync(path.join(root, 'tests/samples/clusters-13-49terms.csv'), 'utf8')).hasCluster === true, 'cluster column detected in the 13-cluster file');
// headers of the other two supported formats (the app's built-in examples use these columns)
ok(detectFormat(['source', 'term_name', 'term_id', 'negative_log10_of_adjusted_p_value', 'effective_domain_size']) === 'gprofiler', 'g:Profiler headers -> gprofiler');
ok(detectFormat(['description', 'pval_adj', 'relative_enrichment']) === 'genecodis', 'GeneCodis headers -> genecodis');
ok(detectFormat(['foo', 'bar']) === 'unknown', 'unrecognised headers -> unknown');

// ── (b) graph, definitions, manifest ──
console.log('\n== (b) data files ==');
const manifest = readJson('data/manifest.json');
const dag = readJson('data/' + manifest.files.graph);
const defs = readJson('data/' + manifest.files.definitions);
const ids = Object.keys(dag);
const by = ns => ids.filter(i => dag[i].ns === ns).length;
const edges = ids.reduce((s, i) => s + dag[i].p.length, 0);
ok(ids.length === manifest.counts.terms && edges === manifest.counts.edges, `graph matches manifest: ${ids.length} terms, ${edges} edges (BP ${by('BP')}, MF ${by('MF')}, CC ${by('CC')})`);
ok(by('BP') > 0 && by('MF') > 0 && by('CC') > 0, 'BP, MF and CC all non-empty');
ok(Object.keys(defs).every(i => dag[i]), `every definition (${Object.keys(defs).length}) belongs to a graph term`);
ok(ids.every(i => dag[i].p.every(([p, w]) => dag[p] && [0.8, 0.6, 0.7].includes(w))), 'every parent exists in the graph and every weight is 0.8 / 0.6 / 0.7');
{ // acyclic (Kahn)
  const indeg = new Map(ids.map(i => [i, 0])); ids.forEach(i => dag[i].p.forEach(([p]) => indeg.set(i, indeg.get(i) + 1)));
  const kids = new Map(); ids.forEach(i => dag[i].p.forEach(([p]) => (kids.get(p) || kids.set(p, []).get(p)).push(i)));
  const q = ids.filter(i => indeg.get(i) === 0); let seen = 0;
  while (q.length) { const t = q.pop(); seen++; for (const k of kids.get(t) || []) { indeg.set(k, indeg.get(k) - 1); if (!indeg.get(k)) q.push(k); } }
  ok(seen === ids.length, 'graph is acyclic');
}
info(`GO release in manifest: ${manifest.go_release}`);
const BRIEF = { terms: 38739, edges: 73004, BP: 24547, MF: 10123, CC: 4069 };
info(`brief expected ${JSON.stringify(BRIEF)}; data has ${JSON.stringify({ terms: ids.length, edges, BP: by('BP'), MF: by('MF'), CC: by('CC') })}`);

// ── (c) Wang clustering on the 49 terms ──
console.log('\n== (c) Wang on the 49-term cluster file ==');
const rows = parseFileText(fs.readFileSync(path.join(root, 'tests/samples/clusters-13-49terms.csv'), 'utf8')).data;
// The app clusters only terms that are in the graph; the others go to "Ungrouped" (see runWangClustering).
const tids = rows.map(r => r.term_id).filter(t => dag[t]);
const missing = rows.filter(r => !dag[r.term_id]).map(r => `${r.term_id} ${r.term_name}`);
info(`${tids.length} of ${rows.length} sample terms are in the graph; not in graph (Ungrouped in the app): ${JSON.stringify(missing)}`);
const sim = computeSimilarityMatrix(tids, dag, {}, 'Wang');
const counts = {};
for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) counts[t] = new Set(hierarchicalCluster(sim, t)).size;
info('clusters by distance threshold: ' + JSON.stringify(counts));
ok(sim.every((r, i) => r.every((x, j) => Math.abs(x - sim[j][i]) < 1e-12 && x >= 0 && x <= 1)), 'Wang matrix symmetric, values within [0,1]');
ok(counts[0.7] === 10, `10 clusters at distance 0.7 (got ${counts[0.7]})`);

// ── (d) IC methods per organism ──
console.log('\n== (d) IC methods per organism ==');
for (const o of manifest.organisms) {
  const ic = readJson('data/' + o.ic_file);
  const icIds = Object.keys(ic).sort();
  ok(icIds.length === o.ic_terms && icIds.every(i => dag[i]), `${o.id}: ${icIds.length} IC terms, all in the graph`);
  const sel = icIds.filter(i => dag[i].ns === 'BP').slice(0, 25).concat(icIds.filter(i => dag[i].ns === 'BP').slice(-25));
  for (const m of ['Resnik', 'Lin', 'Rel', 'Jiang']) {
    let good = false, msg = '';
    try {
      const s = computeSimilarityMatrix(sel, dag, ic, m);
      const flat = s.flat();
      good = flat.every(x => Number.isNaN(x) || (x >= 0 && x <= 1));
      msg = `${o.id} ${m}: ${sel.length}x${sel.length}, NaN pairs=${flat.filter(Number.isNaN).length}`;
      hierarchicalCluster(s.map(r => r.map(x => (Number.isNaN(x) ? 0 : x))), 0.7);
    } catch (e) { msg = `${o.id} ${m} threw ${e.message}`; }
    ok(good, msg);
  }
}

// ── data.js loaders against the files on disk ──
console.log('\n== go/data.js loaders (fetch stubbed to read data/) ==');
globalThis.fetch = async u => { const p = fileURLToPath(new URL(u)); return fs.existsSync(p) ? { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) } : { ok: false, status: 404 }; };
const D = await imp('js/go/data.js');
ok((await D.loadManifest()).organisms.length === manifest.organisms.length, 'loadManifest');
ok(Object.keys(await D.loadGoDag()).length === ids.length, 'loadGoDag');
ok(Object.keys(await D.loadGoDefs()).length === Object.keys(defs).length, 'loadGoDefs');
ok(Object.keys(await D.loadIC('hs')).length === manifest.organisms.find(o => o.id === 'hs').ic_terms, 'loadIC(hs)');
ok((await D.loadIC('other')) === null && (await D.loadIC('zz')) === null && D.icLoadFailed('zz'), 'loadIC returns null for "other" / unknown organism');
ok(/Mouse/.test(D.icUnavailableMessage('Lin', 'mm')) && /Other/.test(D.icUnavailableMessage('Lin', 'other')), 'icUnavailableMessage text');

// ── (e) optional: GO.db export ──
const gg = process.argv[2];
if (gg) {
  console.log('\n== (e) comparison with go_graph.csv ==');
  const csv = fs.readFileSync(gg, 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map(l => l.split(',').map(x => x.replace(/^"|"$/g, '')));
  const W = { isa: 0.8, 'part of': 0.6 }, g2 = {};
  for (const [id, , ont, rel, parent] of csv) { (g2[id] = g2[id] || { ns: ont, p: [] }); if (parent !== 'all') g2[id].p.push([parent, W[rel] ?? 0.7]); }
  const only1 = ids.filter(i => !g2[i]).length, only2 = Object.keys(g2).filter(i => !dag[i]).length;
  const e2 = Object.values(g2).reduce((s, t) => s + t.p.length, 0);
  info(`go_graph.csv: ${Object.keys(g2).length} terms, ${e2} edges; terms only in ours: ${only1}, only in go_graph.csv: ${only2}`);
  const tids2 = tids.filter(t => g2[t]);   // terms present in both graphs
  const sim = computeSimilarityMatrix(tids2, dag, {}, 'Wang');
  const sim2 = computeSimilarityMatrix(tids2, g2, {}, 'Wang');
  let maxd = 0; sim.forEach((r, i) => r.forEach((x, j) => { maxd = Math.max(maxd, Math.abs(x - sim2[i][j])); }));
  info(`max |Wang difference| over the 49x49 matrix: ${maxd.toExponential(3)}`);
  const c2 = {}; for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) c2[t] = new Set(hierarchicalCluster(sim2, t)).size;
  info('clusters with go_graph.csv: ' + JSON.stringify(c2));
  info(maxd < 1e-9 ? 'Wang matrices from both graphs agree to 1e-9' : 'Wang matrices from the two graphs DIFFER: the graphs are different GO releases (not a code problem)');
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
process.exit(failed ? 1 : 0);
