// main.js: Startup and wiring.
import { renderAll } from './plot/render.js';
import { state } from './state.js';
import { updateDeleteBtn, updateGenePanelBtn, updateMoveBtn } from './ui/header.js';
import { initScrollHandlers } from './plot/sticky.js';
import { initDropZones } from './io/upload.js';
import { initClusterMenuDismiss } from './clustering/manual-ui.js';
import { initInfoTips } from './ui/info-tip.js';
import { initActions } from './ui/actions.js';
import { initOrganismSelector } from './ui/organism.js';
import { loadFromHash } from './io/hash.js';

// Startup housekeeping and window resize.
export function initGlobalBehaviour() {
  // Init button states on page load
  setTimeout(() => { updateDeleteBtn(); updateMoveBtn(); updateGenePanelBtn(); }, 100);
  // Clear 'don't ask again' on every page load so confirmation is restored on refresh
  localStorage.removeItem('skipDeleteConfirm');
  window.addEventListener('resize', () => { if(state.panels.some(p=>p.rawData.length)) renderAll(); });
}

// Startup. The old single-file script ran these statements in this order while the page was parsed.
initGlobalBehaviour();
initScrollHandlers();
initDropZones();
initClusterMenuDismiss();
initInfoTips();
initActions();
initOrganismSelector();

// URL hash import (#data=... / #gist=...). Module scripts run before DOMContentLoaded, so this
// normally registers the listener; the readyState check only covers late loading.
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', loadFromHash);
else loadFromHash();
