// OPTIONAL regression test: old single-file app vs new modular app, both run in jsdom (NOT a real browser).
// Same input and same simulated clicks/inputs on both; the serialised chart SVG and sidebar state must be identical.
//   npm i --no-save jsdom d3@7.8.5      (dev-only, outside the shipped app)
//   node tests/dom-regression.mjs <old index.html> <sample csv> [<more sample csvs>]
// jsdom has no layout engine: widths are 0 and SVG text is not measured, so this proves the code paths run and
// produce the same markup, not that the page looks right.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const req = createRequire(path.join(process.env.DEV_MODULES || root, 'noop.js'));
const { JSDOM } = req('jsdom');
const D3_FILE = path.join(process.env.DEV_MODULES || root, 'node_modules/d3/dist/d3.min.js');
const d3src = fs.readFileSync(D3_FILE, 'utf8');
const [,, oldHtmlPath, ...samples] = process.argv;
if (!oldHtmlPath || !samples.length) { console.error('usage: node tests/dom-regression.mjs <old index.html> <csv>...'); process.exit(2); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
function patchSvg(win) {   // deterministic stand-ins for layout APIs jsdom lacks
  const P = win.SVGElement.prototype;
  P.getBBox = function () { const t = (this.textContent || '').length; return { x: 0, y: 0, width: t * 6, height: 12 }; };
  P.getComputedTextLength = function () { return (this.textContent || '').length * 6; };
  win.HTMLCanvasElement.prototype.getContext = () => ({ measureText: s => ({ width: String(s).length * 6 }), font: '' });
}

// ---------- OLD app: run its inline script inside its own jsdom window ----------
const oldHtml = fs.readFileSync(oldHtmlPath, 'utf8').replace(/<script src="https:\/\/cdnjs[^>]*d3[^>]*><\/script>/, '');
const oldErrors = [];
const oldDom = new JSDOM(oldHtml, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/old/',
  beforeParse(w) { patchSvg(w); w.console.error = (...a) => oldErrors.push(a.map(String).join(' ')); w.DecompressionStream = globalThis.DecompressionStream; w.TextDecoder = globalThis.TextDecoder; } });
const OW = oldDom.window;
OW.eval(d3src);
const oldEval = code => OW.eval(code);

// ---------- NEW app: modules imported into Node with the new page's window as the globals ----------
const newHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const newErrors = [];
const newDom = new JSDOM(newHtml, { pretendToBeVisual: true, url: 'http://localhost/new/' });
const NW = newDom.window; patchSvg(NW);
NW.console.error = (...a) => newErrors.push(a.map(String).join(' '));
for (const k of ['window','document','localStorage','FileReader','Blob','Image','XMLSerializer','getComputedStyle','requestAnimationFrame','navigator','MouseEvent','alert','Option'])
  Object.defineProperty(globalThis, k, { value: k === 'window' ? NW : NW[k], configurable: true, writable: true });
globalThis.getComputedStyle = NW.getComputedStyle.bind(NW);
globalThis.requestAnimationFrame = NW.requestAnimationFrame.bind(NW);
{ const m = { exports: {} }; new Function('module', 'exports', d3src)(m, m.exports); globalThis.d3 = m.exports; }
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {           // the page is served over http in real life; here read data/ from disk
  const url = new URL(u);
  if (url.protocol !== 'file:') return realFetch(u);
  const p = fileURLToPath(url);
  if (!fs.existsSync(p)) return { ok: false, status: 404, json: async () => { throw new Error('404'); } };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) };
};
console.error = (...a) => newErrors.push(a.map(String).join(' '));
const M = {
  main: await import(pathToFileURL(path.join(root, 'js/main.js'))),
  state: await import(pathToFileURL(path.join(root, 'js/state.js'))),
  upload: await import(pathToFileURL(path.join(root, 'js/io/upload.js'))),
  examples: await import(pathToFileURL(path.join(root, 'js/io/examples.js'))),
};
const S = M.state.state;

// ---------- helpers ----------
const norm = h => h.replace(/\s(?:onclick|oninput|onchange|onblur)="[^"]*"/g, '').replace(/\sdata-(?:on-\w+|dir|toggle|key|example|range|num|then)="[^"]*"/g, '');
const snap = doc => ({
  svg: doc.getElementById('combined-svg')?.outerHTML || '',
  side: ['clusterSelect','fileLabel','upload-status','active-panel-indicator','cluster-bar','topN','topNNum','minInter','minInterNum','minTerm','maxTerm','minLog2FE','dotScale','fontSize','geneMatrixBtn','editModeBtn','clusterModeBtn','filterClustersBtn','deletePanelBtn','sticky-term-column','main-drop-overlay']
    .map(id => { const e = doc.getElementById(id); return e ? `${id}|${e.className}|${e.value ?? ''}|${e.disabled ?? ''}|${e.getAttribute('style') || ''}|${e.textContent.length > 4000 ? e.textContent.length : norm(e.innerHTML)}` : id + '|missing'; }).join('\n'),
});
function diff(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `first difference at char ${i}\n  old: …${a.slice(Math.max(0, i - 60), i + 120)}\n  new: …${b.slice(Math.max(0, i - 60), i + 120)}`; }
let failures = 0, checks = 0;
function compare(label) {
  checks++;
  const a = snap(OW.document), b = snap(globalThis.document);
  const ok = a.svg === b.svg && a.side === b.side;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + `  (svg ${a.svg.length} chars)`);
  if (!ok) { failures++; console.log('  ' + (a.svg !== b.svg ? 'SVG: ' + diff(a.svg, b.svg) : 'SIDEBAR: ' + diff(a.side, b.side))); }
}
const fire = (doc, win, id, type) => { const e = doc.getElementById(id); e.dispatchEvent(new win.Event(type, { bubbles: true })); };
const setVal = (id, val) => { for (const [doc] of [[OW.document], [globalThis.document]]) doc.getElementById(id).value = val; };
const both = (id, type) => { fire(OW.document, OW, id, type); fire(globalThis.document, NW, id, type); };
const click = id => { OW.document.getElementById(id).click(); globalThis.document.getElementById(id).click(); };

// ---------- scenarios ----------
await sleep(300);
compare('initial page (no data)');
for (const file of samples) {
  const text = fs.readFileSync(file, 'utf8'), name = path.basename(file);
  oldEval('panels = []; panelCounter = 0; activePanelId = 0;'); S.panels.length = 0; S.panelCounter = 0; S.activePanelId = 0;
  OW.processFile(new OW.File([text], name));  M.upload.processFile(new NW.File([text], name));
  await sleep(400);
  compare(`load ${name.slice(0, 40)}…`);
  const n = S.panels[0]?.rawData.length;
  console.log(`      panels=${S.panels.length} rows=${n}`);
  if (process.env.DEBUG_RENDER) { try { (await import(pathToFileURL(path.join(root, 'js/plot/render.js')))).render(); } catch (e) { console.log('RENDER THREW:', e.stack.split('\n').slice(0, 5).join('\n')); } process.exit(0); }
  setVal('topN', 10);            both('topN', 'input');         compare('  topN slider -> 10 (oninput vs delegated input)');
  setVal('topNNum', 20);         both('topNNum', 'change');     compare('  topN number box -> 20 (change)');
  setVal('minInter', 3);         both('minInter', 'input');     compare('  minInter slider');
  setVal('minLog2FENum', 1.5);   both('minLog2FENum', 'change');compare('  minLog2FE number box');
  setVal('dotScale', 12);        both('dotScale', 'input');     compare('  dot size slider (appearance)');
  setVal('colorLow', '#00ff00'); both('colorLow', 'input');     compare('  low colour input');
  setVal('sizeMode', 'count');   both('sizeMode', 'change');    compare('  size mode select');
  click('lolipopToggle');                                       compare('  lollipop toggle off');
  setVal('legendScale', 1.4);    both('legendScale', 'input');  compare('  legend scale (render)');
  click('geneMatrixBtn');                                       compare('  gene matrix on');
  click('geneMatrixBtn');                                       compare('  gene matrix off');
  click('editModeBtn');                                         compare('  edit mode on');
  click('editModeBtn');                                         compare('  edit mode off');
  click('clusterModeBtn');                                      compare('  manual clustering on');
  click('filterClustersBtn');                                   compare('  filter top per cluster');
  click('clusterModeBtn');                                      compare('  manual clustering off');
  // blur on a number box (inline onblur vs delegated focusout)
  setVal('minTermNum', 100);     both('minTermNum', 'blur');
  for (const [doc, win] of [[OW.document, OW], [globalThis.document, NW]]) doc.getElementById('minTermNum').dispatchEvent(new win.FocusEvent('focusout', { bubbles: true }));
  compare('  minTerm number box blur (focusout)');
}
// example data buttons
for (const kind of ['gprofiler', 'genecodis']) {
  oldEval('panels = []; panelCounter = 0; activePanelId = 0;'); S.panels.length = 0; S.panelCounter = 0; S.activePanelId = 0;
  OW.loadExampleData(kind); M.examples.loadExampleData(kind); await sleep(300);
  compare('example data: ' + kind);
}
console.log(`\nconsole.error old: ${oldErrors.length}  new: ${newErrors.length}`);
[...oldErrors.slice(0, 3).map(e => 'old: ' + e.slice(0, 200)), ...newErrors.slice(0, 5).map(e => 'new: ' + e.slice(0, 300))].forEach(x => console.log('  ' + x));
console.log(`\n${checks - failures}/${checks} comparisons identical`);
process.exit(failures ? 1 : 0);
