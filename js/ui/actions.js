// ui/actions.js: One delegated listener for every UI control that used to carry an inline handler.
//
// Markup declares behaviour with attributes instead of onclick="...":
//   data-on-click="action-name"   data-on-input="..."   data-on-change="..."   data-on-blur="..."
// plus optional data-* arguments (see each action). The listener is registered once on the document for
// click, input, change and focusout (blur does not bubble, focusout does). As with inline handlers, an
// event runs the action of the element itself and then those of its ancestors, unless an action stops
// propagation (toggle-format-examples does, so the upload zone behind it is not triggered).
import { toggleSidebar, toggleCtrl, applyPanelAppearance, applyPanelFilter, resetAppearance } from './sidebar.js';
import { toggleEditMode, applyEditMode, cancelEditMode, contextReset, filterTopPerCluster } from './header.js';
import { toggleClusterMode, toggleClusterPills, addCluster, applyClusterMode, clearClusterMode } from '../clustering/manual-ui.js';
import { toggleAccordionMode } from '../plot/gene-matrix.js';
import { renderAll } from '../plot/render.js';
import { moveActivePanel, deleteActivePanel, confirmDeletePanel, dismissDeleteConfirm } from '../panels.js';
import { sidebarUploadClick, addSubplotFromSidebar } from '../io/upload.js';
import { toggleFormatExamples, showExamplesFromToast, loadExampleData } from '../io/examples.js';
import { downloadPNG, downloadCSV } from './export.js';
import { runWangClustering, updateMethodDescription } from '../clustering/semantic/run.js';
import { onOrganismChange } from './organism.js';
import { v, syncNum, syncRange } from '../utils.js';

// What a slider / number box does after syncing its partner (data-then): re-filter, re-style or just redraw.
function afterSync(el) {
  const then = el.dataset.then;
  if (!then) return;
  if (then.startsWith('filter:')) applyPanelFilter(then.slice('filter:'.length));
  else if (then === 'appearance') applyPanelAppearance();
  else if (then === 'render') renderAll();
}

// Action table. Handlers receive (element, event).
export const actions = {
  'toggle-sidebar':          () => toggleSidebar(),
  'toggle-edit-mode':        () => toggleEditMode(),
  'toggle-cluster-mode':     () => toggleClusterMode(),
  'toggle-gene-matrix':      () => toggleAccordionMode(),
  'move-panel':              el => moveActivePanel(+el.dataset.dir),                 // data-dir="-1" | "1"
  'context-reset':           () => contextReset(),
  'delete-panel':            () => deleteActivePanel(),
  'upload-click':            () => sidebarUploadClick(),
  'toggle-ctrl':             el => toggleCtrl(el.dataset.toggle, el.dataset.key),    // data-toggle=<element id> data-key=<controls key>
  'appearance-change':       () => applyPanelAppearance(),
  'slider-input':            el => { syncNum(el.dataset.range, el.dataset.num); afterSync(el); },     // range moved
  'number-commit':           el => { syncRange(el.dataset.num, el.dataset.range); afterSync(el); },   // number box changed / blurred
  'method-change':           () => updateMethodDescription(),
  'organism-change':         () => onOrganismChange(),
  'run-clustering':          () => runWangClustering(),
  'filter-top-per-cluster':  () => filterTopPerCluster(),
  'reset-appearance':        () => resetAppearance(),
  'add-subplot':             () => addSubplotFromSidebar(),
  'download-png':            () => downloadPNG(),
  'download-csv':            () => downloadCSV(),
  'open-file-input':         () => document.getElementById('fileInput').click(),
  'toggle-format-examples':  (el, e) => toggleFormatExamples(e),
  'load-example':            el => loadExampleData(el.dataset.example),              // data-example="gprofiler" | "genecodis"
  'dismiss-format-toast':    () => v('format-error-toast').classList.remove('show'),
  'show-examples-from-toast': () => showExamplesFromToast(),
  'toggle-cluster-pills':    () => toggleClusterPills(),
  'add-cluster':             () => addCluster(),
  'apply-cluster-mode':      () => applyClusterMode(),
  'clear-cluster-mode':      () => clearClusterMode(),
  'apply-edit-mode':         () => applyEditMode(),
  'cancel-edit-mode':        () => cancelEditMode(),
  'dismiss-delete-confirm':  () => dismissDeleteConfirm(),
  'confirm-delete-panel':    () => confirmDeletePanel(),
};

// DOM event type -> attribute suffix (data-on-<suffix>)
const EVENTS = { click: 'click', input: 'input', change: 'change', focusout: 'blur' };

export function dispatch(e, suffix) {
  const attr = 'data-on-' + suffix, sel = '[' + attr + ']';
  for (let el = e.target.closest?.(sel); el; el = el.parentElement?.closest(sel)) {
    const name = el.getAttribute(attr);
    const fn = actions[name];
    if (!fn) { console.warn('Unknown action "' + name + '" on', el); continue; }
    fn(el, e);
    if (e.cancelBubble) break;     // an action called stopPropagation()
  }
}

export function initActions(root = document) {
  for (const [type, suffix] of Object.entries(EVENTS)) root.addEventListener(type, e => dispatch(e, suffix));
}
