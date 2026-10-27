// go/data.js: Lazy loading of the generated GO data files in data/ (see tools/build_data.py).
//   data/manifest.json   GO release, organism list, file names, counts
//   data/go-dag.json     graph shared by all organisms
//   data/go-defs.json    term definitions shared by all organisms
//   data/ic/<id>.json    information content, one file per organism
// Nothing is fetched until a function here is called, and every file is fetched at most once.
// No DOM access.

// The data folder is located relative to THIS module (js/go/data.js -> ../../data/), not relative to
// the page, so it works from a GitHub Pages sub-path (https://user.github.io/repo/) and from any folder.
export const DATA_BASE = new URL('../../data/', import.meta.url);

const cache = new Map();            // key -> Promise of the loaded value
const failedIC = new Set();         // organism ids whose IC file could not be loaded
let manifest = null;

async function fetchJson(relPath) {
  const res = await fetch(new URL(relPath, DATA_BASE));
  if (!res.ok) throw new Error(`${relPath}: HTTP ${res.status}`);
  return res.json();
}

// Fetch once and cache the result; a failed load is not cached, so a later call can retry.
function once(key, load) {
  if (!cache.has(key)) {
    cache.set(key, load().catch(err => { cache.delete(key); throw err; }));
  }
  return cache.get(key);
}

// ── Manifest ──────────────────────────────────────────────────────────────────
// Returns the manifest object, or null if it could not be loaded.
export async function loadManifest() {
  if (manifest) return manifest;
  try {
    manifest = await once('manifest', () => fetchJson('manifest.json'));
    return manifest;
  } catch (e) { console.error('Failed to load GO data manifest:', e); return null; }
}
// Synchronous access after loadManifest() has resolved (null before that / on failure).
export function getManifest() { return manifest; }
export function getOrganism(id) { return manifest?.organisms?.find(o => o.id === id) || null; }

// ── GO graph (shared) ─────────────────────────────────────────────────────────
// { "GO:...": { n: name, ns: "BP|MF|CC", p: [[parentId, weight], ...] } }, or null on failure.
let goDag = null;
export async function loadGoDag() {
  if (goDag) return goDag;
  try {
    const m = await loadManifest();
    goDag = await once('dag', () => fetchJson(m?.files?.graph || 'go-dag.json'));
    console.log('GO DAG loaded: ' + Object.keys(goDag).length + ' terms');
    return goDag;
  } catch (e) { console.error('Failed to load GO DAG:', e); return null; }
}

// ── GO definitions (shared) ───────────────────────────────────────────────────
// { "GO:...": { d: definition, s: sources (optional), c: comment (optional) } }, or null on failure.
let goDefs = null;
export async function loadGoDefs() {
  if (goDefs) return goDefs;
  try {
    const m = await loadManifest();
    goDefs = await once('defs', () => fetchJson(m?.files?.definitions || 'go-defs.json'));
    console.log('GO Defs loaded: ' + Object.keys(goDefs).length + ' terms');
    return goDefs;
  } catch (e) { console.error('Failed to load GO Defs:', e); return null; }
}

// ── Information content (one file per organism) ───────────────────────────────
// { "GO:...": ic } for the organism, or null if the organism has no IC ('other', unknown id) or the
// file could not be loaded. Loaded on first use and cached.
export async function loadIC(organismId) {
  if (!organismId || organismId === 'other') return null;
  try {
    const m = await loadManifest();
    const org = m?.organisms?.find(o => o.id === organismId);
    if (!org || !org.ic_file) { failedIC.add(organismId); return null; }
    const ic = await once('ic:' + organismId, () => fetchJson(org.ic_file));
    failedIC.delete(organismId);
    console.log('GO IC loaded for ' + organismId + ': ' + Object.keys(ic).length + ' terms');
    return ic;
  } catch (e) {
    failedIC.add(organismId);
    console.error('Failed to load IC for ' + organismId + ':', e);
    return null;
  }
}
// True once a load for this organism has failed (used to disable the IC methods).
export function icLoadFailed(organismId) { return failedIC.has(organismId); }

// Text shown when an IC-based method cannot run.
export function icUnavailableMessage(method, organismId) {
  const org = getOrganism(organismId);
  if (!org) return `⚠ ${method} needs IC values, which are not available for “Other / not listed”. Use Wang or pick an organism.`;
  return `⚠ ${method} needs IC for ${org.label}, but ${org.ic_file} could not be loaded.`;
}
