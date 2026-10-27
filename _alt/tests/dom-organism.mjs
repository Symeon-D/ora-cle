// OPTIONAL jsdom check of the organism dropdown and the cluster button (new app only). Not a real browser.
//   DEV_MODULES=<folder with node_modules/jsdom and node_modules/d3> node tests/dom-organism.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV = process.env.DEV_MODULES || root;
const { JSDOM } = createRequire(path.join(DEV, 'x.js'))('jsdom');
const d3src = fs.readFileSync(path.join(DEV, 'node_modules/d3/dist/d3.min.js'), 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0; const ok = (c, m) => { process.stdout.write((c ? 'PASS ' : 'FAIL ') + m + '\n'); if (!c) failed++; };

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
const dom = new JSDOM(html, { pretendToBeVisual: true, url: 'http://localhost/site/' });
const W = dom.window;
W.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: (this.textContent || '').length * 6, height: 12 }; };
W.SVGElement.prototype.getComputedTextLength = function () { return (this.textContent || '').length * 6; };
W.HTMLCanvasElement.prototype.getContext = () => ({ measureText: s => ({ width: String(s).length * 6 }), font: '' });
for (const k of ['window','document','localStorage','FileReader','Blob','Image','XMLSerializer','navigator','MouseEvent','alert','Option'])
  Object.defineProperty(globalThis, k, { value: k === 'window' ? W : W[k], configurable: true, writable: true });
globalThis.getComputedStyle = W.getComputedStyle.bind(W); globalThis.requestAnimationFrame = W.requestAnimationFrame.bind(W);
{ const m = { exports: {} }; new Function('module', 'exports', d3src)(m, m.exports); globalThis.d3 = m.exports; }
let failIC = null;   // organism id whose IC file should 404
globalThis.fetch = async u => { const url = new URL(u), p = fileURLToPath(url);
  if (failIC && p.endsWith(`/ic/${failIC}.json`)) return { ok: false, status: 404 };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; };
console.log = () => {};  // silence the app's own loader logs

await import(pathToFileURL(path.join(root, 'js/main.js')));
const { state } = await import(pathToFileURL(path.join(root, 'js/state.js')));
const { processFile } = await import(pathToFileURL(path.join(root, 'js/io/upload.js')));
await sleep(300);
const $ = id => document.getElementById(id);
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

const sel = $('organismSelect');
const opts = [...sel.options].map(o => o.value);
ok(JSON.stringify(opts) === JSON.stringify(['mm','hs','rn','ce','dm','other']), 'dropdown options from manifest + "Other": ' + opts.join(','));
ok(sel.options[sel.options.length - 1].text === 'Other / not listed (Wang only)', 'last option label');
ok(sel.value === 'mm' && state.organism === 'mm', 'first visit default = Mouse');
ok(/GO release 2026-07-26/.test($('organismInfo').textContent) && /org\.Mm\.eg\.db 3\.23\.0/.test($('organismInfo').textContent), 'info line: ' + $('organismInfo').textContent);
ok(![...$('clusterMethod').options].some(o => o.disabled), 'IC methods enabled for Mouse');
ok($('sideDropZone').nextElementSibling?.contains(sel), 'the organism row is the element directly below the upload zone');

// switch organism via a real change event (delegated action)
sel.value = 'ce'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
ok(state.organism === 'ce' && W.localStorage.getItem('ora-cle.organism') === 'ce' && /org\.Ce\.eg\.db 3\.22\.0/.test($('organismInfo').textContent), 'switch to C. elegans: state, localStorage, info line');
sel.value = 'other'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
const disabled = ['Resnik','Lin','Rel','Jiang'].every(m => [...$('clusterMethod').options].find(o => o.value === m).disabled);
ok(disabled && !$('clusterMethod').querySelector('option[value=Wang]').disabled && $('icNote').style.display === 'block', 'Other: IC methods disabled, Wang enabled, note shown: ' + $('icNote').textContent);

// load the 13-cluster sample and run clustering through the real button
sel.value = 'mm'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
const text = fs.readFileSync(path.join(root, 'tests/samples/gprofiler-native-49terms.csv'), 'utf8');   // no pre-assigned clusters
processFile(new W.File([text], 'sample.csv')); await sleep(400);
$('wangClusterBtn').click(); await sleep(1500);
log('   Wang status:', $('wangStatusMsg').textContent);
ok(/Wang\] → \d+ clusters/.test($('wangStatusMsg').textContent), 'Wang run through the button');
$('clusterMethod').value = 'Lin'; $('clusterMethod').dispatchEvent(new W.Event('change', { bubbles: true }));
$('wangClusterBtn').click(); await sleep(3000);
log('   Lin (mouse) status:', $('wangStatusMsg').textContent);
ok(/Lin\] → \d+ clusters/.test($('wangStatusMsg').textContent), 'Lin run with the Mouse IC file');

// IC file fails to load for the chosen organism -> note + methods disabled + fallback to Wang
failIC = 'hs';
sel.value = 'hs'; sel.dispatchEvent(new W.Event('change', { bubbles: true }));
$('clusterMethod').value = 'Rel'; $('clusterMethod').dispatchEvent(new W.Event('change', { bubbles: true }));
$('wangClusterBtn').click(); await sleep(1500);
log('   Rel (hs, IC 404) status:', $('wangStatusMsg').textContent);
ok(/needs IC for Human/.test($('wangStatusMsg').textContent) && [...$('clusterMethod').options].find(o => o.value === 'Rel').disabled && $('clusterMethod').value === 'Wang', 'failed IC load: message, IC methods disabled, selection falls back to Wang');

// remembered choice after "reload": a fresh module graph is not possible in-process, so check what init reads
W.localStorage.setItem('ora-cle.organism', 'rn');
const { initOrganismSelector } = await import(pathToFileURL(path.join(root, 'js/ui/organism.js')));
await initOrganismSelector();
ok(sel.value === 'rn' && state.organism === 'rn', 'saved choice (rn) is restored by initOrganismSelector');
W.localStorage.setItem('ora-cle.organism', 'bogus'); await initOrganismSelector();
ok(sel.value === 'mm', 'unknown saved value falls back to Mouse');
process.exit(failed ? 1 : 0);
