// io/upload.js: Getting files into panels: file pickers, drag and drop, FileReader.
import { applyRrvgoClusters } from '../clustering/manual.js';
import { showFormatError } from './examples.js';
import { parseFileText } from './parse.js';
import { addPanel, setActivePanelId, updateDropZones } from '../panels.js';
import { renderAll } from '../plot/render.js';
import { activePanel, defaultAppearance, defaultFilters, state } from '../state.js';
import { v } from '../utils.js';

export function addSubplotFromSidebar() {
  // Open file picker immediately; only create panel after file is selected
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv,.tsv,.txt';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const panel = addPanel(null);
    loadFileIntoPanel(panel, file);
  };
  inp.click();
}

export function loadFileIntoPanel(panel, file) {
  const reader = new FileReader();
  reader.onload = e => {
    const parsed = parseFileText(e.target.result);
    if (parsed.fmt === 'unknown') {
      showFormatError(parsed.error, file.name);
      if (!panel.rawData.length) { state.panels = state.panels.filter(p=>p.id!==panel.id); renderAll(); }
      return;
    }

    // gProfiler: if multiple sources present, create one subplot per source
    if (parsed.fmt === 'gprofiler') {
      const sources = [...new Set(parsed.data.map(d => d.group_name))];
      if (sources.length > 1) {
        // Remove the placeholder panel that was created before the file was read
        state.panels = state.panels.filter(p => p.id !== panel.id);

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
          // Set groupName filter to the source so terms show correctly
          p.filters.groupName = src;
          if (parsed.hasCluster) applyRrvgoClusters(p);
          state.panels.push(p);
        });

        v('main-drop-overlay').classList.add('hidden');
        state.activePanelId = state.panels[state.panels.length - 1].id;
        setActivePanelId(state.panels[0].id);
        updateDropZones();
        renderAll();
        return;
      }
    }

    // Single-source / other formats — load into the provided panel as before
    panel.rawData = parsed.data;
    panel.fmt     = parsed.fmt;
    panel.title   = file.name.replace(/\.[^.]+$/,'');
    panel.hiddenTerms = new Set();
    panel.filters = defaultFilters(panel.rawData);
    if (parsed.hasCluster) applyRrvgoClusters(panel);
    v('main-drop-overlay').classList.add('hidden');
    setActivePanelId(panel.id);
  };
  reader.readAsText(file);
}

export function sidebarUploadClick() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv,.tsv,.txt';
  inp.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const p = activePanel();
    if (p) {
      // Replace active panel data
      loadFileIntoPanel(p, file);
    } else {
      addPanel(null);
      loadFileIntoPanel(activePanel(), file);
    }
  };
  inp.click();
}

// ── Initial uploads ────────────────────────────────────────────────────────────
export function processFile(file) {
  if (state.panels.length === 0) addPanel(null);
  // Note: main drop overlay only shows when no panels, so this always creates fresh
  loadFileIntoPanel(state.panels[0], file);
}

export function setupDrop(el, onFile) {
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag-active'); });
  el.addEventListener('dragleave', e => { if(!el.contains(e.relatedTarget)) el.classList.remove('drag-active'); });
  el.addEventListener('drop', e => { e.preventDefault(); el.classList.remove('drag-active'); const f=e.dataTransfer.files[0]; if(f) onFile(f); });
}

// Drag-and-drop and file-input wiring.
export function initDropZones() {
  setupDrop(v('main-drop-overlay'), processFile);
  const sdz = v('sideDropZone');
  sdz.addEventListener('dragover', e => { e.preventDefault(); sdz.classList.add('drag'); });
  sdz.addEventListener('dragleave', () => sdz.classList.remove('drag'));
  sdz.addEventListener('drop', e => { e.preventDefault(); sdz.classList.remove('drag'); const f=e.dataTransfer.files[0]; if(f) processFile(f); });
  v('fileInput').addEventListener('change', e => { if(e.target.files[0]) processFile(e.target.files[0]); });
}
