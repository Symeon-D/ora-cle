// ui/organism.js: Organism dropdown below the upload zone. One global setting (not per panel).
// It decides which IC file the IC-based clustering methods (Resnik, Lin, Rel, Jiang) load.
import { state } from '../state.js';
import { v } from '../utils.js';
import { loadManifest, getManifest, getOrganism, icLoadFailed } from '../go/data.js';
import { updateMethodDescription } from '../clustering/semantic/run.js';

const STORAGE_KEY = 'ora-cle.organism';
const OTHER = 'other';
const DEFAULT_ORGANISM = 'mm';                       // first visit: Mouse
const IC_METHODS = ['Resnik', 'Lin', 'Rel', 'Jiang'];  // Wang needs no IC and is always available

function readSaved() { try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; } }
function writeSaved(id) { try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* storage unavailable */ } }

function orgText(o) { return o.species ? `${o.label} (${o.species})` : o.label; }

// Fill the dropdown from manifest.json; the last option is always "Other / not listed (Wang only)".
export async function initOrganismSelector() {
  const sel = v('organismSelect'); if (!sel) return;
  const manifest = await loadManifest();
  const orgs = manifest?.organisms || [];
  sel.innerHTML = '';
  orgs.forEach(o => sel.add(new Option(orgText(o), o.id)));
  sel.add(new Option('Other / not listed (Wang only)', OTHER));

  const saved = readSaved();
  const ids = [...sel.options].map(o => o.value);
  const first = ids.includes(saved) ? saved : (ids.includes(DEFAULT_ORGANISM) ? DEFAULT_ORGANISM : ids[0]);
  sel.value = first;
  applyOrganism(first);
}

// Called by the delegated "organism-change" action.
export function onOrganismChange() {
  const sel = v('organismSelect'); if (!sel) return;
  writeSaved(sel.value);
  applyOrganism(sel.value);
}

function applyOrganism(id) {
  state.organism = id;
  const info = v('organismInfo');
  if (info) {
    const m = getManifest(), org = getOrganism(id);
    const parts = [];
    if (m?.go_release) parts.push(`GO release ${m.go_release}`);
    if (org?.orgdb) parts.push(`${org.orgdb} ${org.orgdb_version}`);
    info.textContent = parts.join(' · ');
  }
  refreshMethodAvailability();
}

// Enable or disable the IC methods for the selected organism, with a short note.
// Disabled when "Other" is selected, the manifest lists no IC file for the organism, or its IC file failed to load.
export function refreshMethodAvailability() {
  const methodSel = v('clusterMethod'); if (!methodSel) return;
  const id = state.organism;
  const org = getOrganism(id);
  const hasIC = !!org && !!org.ic_file && !icLoadFailed(id);
  IC_METHODS.forEach(m => {
    const opt = [...methodSel.options].find(o => o.value === m);
    if (opt) opt.disabled = !hasIC;
  });
  const note = v('icNote');
  if (note) {
    note.textContent = hasIC ? '' : (org ? `Resnik, Lin, Rel and Jiang: needs IC for ${org.label}` : 'Resnik, Lin, Rel and Jiang: needs IC (pick an organism)');
    note.style.display = hasIC ? 'none' : 'block';
  }
  if (!hasIC && IC_METHODS.includes(methodSel.value)) {   // current choice just became unavailable
    methodSel.value = 'Wang';
    updateMethodDescription();
  }
}
