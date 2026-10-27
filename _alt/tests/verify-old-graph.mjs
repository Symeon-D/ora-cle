// Verification step 1: run the ORIGINAL (pre-refactor) Wang + hierarchicalCluster code,
// sliced straight out of the old index.html, on the OLD embedded graph, and check that the
// 13-cluster file is reproduced at distance threshold 0.7.
// usage: node tests/verify-old-graph.mjs <old index.html> <13-cluster csv>
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const acorn = require(process.env.ACORN_PATH || 'acorn');

const [,, htmlPath, csvPath] = process.argv;
if (!htmlPath || !csvPath) { console.error('usage: node tests/verify-old-graph.mjs <old index.html> <clusters csv>'); process.exit(2); }
const html = fs.readFileSync(htmlPath, 'utf8').replace(/\r\n/g, '\n');
const a = html.indexOf('<script>\n', html.indexOf('</style>')) + 9;
const script = html.slice(a, html.indexOf('</script>', a));
const blob = /const GO_DAG_B64 = "([^"]+)"/.exec(script)[1];
const dag = JSON.parse(zlib.gunzipSync(Buffer.from(blob, 'base64')).toString('utf8')).terms;
const ast = acorn.parse(script, { ecmaVersion: 2022, ranges: true });
const grab = n => { const f = ast.body.find(x => x.type === 'FunctionDeclaration' && x.id.name === n); return script.slice(f.start, f.end); };
const { wangSimilarity, hierarchicalCluster } = new Function(grab('wangSimilarity') + grab('hierarchicalCluster') + 'return {wangSimilarity,hierarchicalCluster}')();

const rows = fs.readFileSync(csvPath, 'utf8').replace(/\r/g, '').trim().split('\n');
const parse = l => { const r = []; let c = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { r.push(c); c = ''; } else c += ch; } r.push(c); return r; };
const h = parse(rows[0]); const iT = h.indexOf('term_id'), iC = h.indexOf('cluster');
const recs = rows.slice(1).map(parse).map(r => ({ id: r[iT], cl: r[iC] }));
console.log('terms', recs.length, 'in old graph', recs.filter(r => dag[r.id]).length);
const ids = recs.map(r => r.id), n = ids.length;
const sim = Array.from({ length: n }, () => new Array(n).fill(0));
for (let i = 0; i < n; i++) { sim[i][i] = 1; for (let j = i + 1; j < n; j++) sim[i][j] = sim[j][i] = wangSimilarity(ids[i], ids[j], dag); }
const part = a => { const m = new Map(); a.forEach((c, i) => { if (!m.has(c)) m.set(c, []); m.get(c).push(ids[i]); }); return [...m.values()].map(g => g.sort().join('|')).sort(); };
const expected = part(recs.map(r => r.cl));
for (const t of [0.5, 0.6, 0.7, 0.8, 0.9]) console.log('threshold', t, '->', new Set(hierarchicalCluster(sim, t)).size, 'clusters');
const got = part(hierarchicalCluster(sim, 0.7));
console.log('expected clusters in file:', expected.length, '| got at 0.7:', got.length, '| identical partition:', JSON.stringify(got) === JSON.stringify(expected));
process.exit(JSON.stringify(got) === JSON.stringify(expected) ? 0 : 1);
