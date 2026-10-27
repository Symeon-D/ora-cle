// go/tooltip.js: GO term definition tooltip.
import { loadGoDefs } from './data.js';
import { v } from '../utils.js';

export function showInfoTooltip(termId, termName, clientX, clientY) {
  const tip = v('go-def-tooltip');
  if (!tip) return;

  // Populate immediately — show term header and loading state right away
  const elId   = v('it-id');
  const elName = v('it-name');
  const elDef  = v('it-def');
  const elSrc  = v('it-src');
  const elCom  = v('it-comment');
  if (!elId || !elName || !elDef || !elSrc || !elCom) return;

  elId.textContent   = termId   || '';
  elName.textContent = termName || '';
  elDef.textContent  = 'Loading…';
  elSrc.style.display = 'none';
  elCom.style.display = 'none';
  tip.classList.add('show');
  positionInfoTooltip(clientX, clientY);

  loadGoDefs().then(defs => {
    if (!tip.classList.contains('show')) return;  // user already moused out
    if (!defs) {
      elDef.textContent = 'Definition data could not be loaded (data/go-defs.json).';
      return;
    }
    const entry = termId ? defs[termId] : null;
    if (!entry) {
      elDef.textContent = termId ? 'No definition found for ' + termId + '.' : 'No term ID in data.';
      return;
    }
    elDef.textContent = entry.d || '—';
    if (entry.s) { elSrc.textContent = 'Source: ' + entry.s; elSrc.style.display = 'block'; }
    if (entry.c) { elCom.textContent = 'Comment: ' + entry.c; elCom.style.display = 'block'; }
    positionInfoTooltip(clientX, clientY);
  });
}

export function positionInfoTooltip(cx, cy) {
  const tip = v('go-def-tooltip');
  if (!tip) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = tip.offsetWidth || 280, th = tip.offsetHeight || 100;
  let tx = cx + 18, ty = cy - 10;
  if (tx + tw > vw - 8) tx = cx - tw - 8;
  if (ty + th > vh - 8) ty = vh - th - 8;
  if (ty < 8) ty = 8;
  tip.style.left = tx + 'px';
  tip.style.top  = ty + 'px';
}
