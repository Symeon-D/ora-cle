// io/hash.js: Load data from the URL hash (#data=<base64 csv> or #gist=<id>).
import { parseFileText } from './parse.js';
import { addPanel, setActivePanelId } from '../panels.js';
import { renderAll } from '../plot/render.js';
import { defaultFilters } from '../state.js';

// Was the body of the DOMContentLoaded handler.
export async function loadFromHash() {
  const hash = window.location.hash;
  let csvText = null;
  try {
    if (hash.startsWith('#gist=')) {
      const id = hash.substring(6);
      const meta = await (await fetch('https://api.github.com/gists/' + id)).json();
      const file = Object.values(meta.files)[0];
      csvText = await (await fetch(file.raw_url)).text();   // raw_url also works for files > 1 MB
    } else if (hash.startsWith('#data=')) {
      csvText = decodeURIComponent(atob(hash.substring(6)));
    }
    if (!csvText) return;
    const parsed = parseFileText(csvText);
    if (parsed.data.length > 0) {
      const panel = addPanel(null);
      panel.rawData = parsed.data; panel.fmt = parsed.fmt;
      panel.title = "R App Export";
      panel.filters = defaultFilters(panel.rawData);
      const overlay = document.getElementById('main-drop-overlay');
      if (overlay) overlay.classList.add('hidden');
      setActivePanelId(panel.id); renderAll();
    }
  } catch (err) { console.error("Failed to load data from URL hash", err); }
}
