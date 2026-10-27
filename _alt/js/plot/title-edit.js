// plot/title-edit.js: Inline editing of a panel title on the plot.
import { renderAll } from './render.js';
import { state } from '../state.js';
import { numVal, v } from '../utils.js';

// ── Title inline editing ──────────────────────────────────────────────────────
// panelIndex = pi, panelTop = yOff+PANEL_TOP in SVG coords
export function startTitleEdit(panel, panelIndex, panelTopSVG, innerH, innerW) {
  const scrollArea = v('chart-scroll-area');
  const svgEl = v('combined-svg');
  const svgW = +svgEl.getAttribute('width') || 800;
  const svgH = +svgEl.getAttribute('height') || 600;
  const saRect = scrollArea.getBoundingClientRect();
  const multiP = state.panels.length > 1;

  // SVG → scroll-area pixel coords (accounting for scroll)
  const scaleX = scrollArea.scrollWidth / svgW;  // usually 1 unless viewBox scaling
  const scaleY = scrollArea.scrollHeight / svgH;
  // MARGIN_LEFT is a closure var from render() — capture it via the SVG viewBox
  // We re-read it from the SVG attributes to avoid closure issues
  const margin = +svgEl.getAttribute('data-margin-left') || 200;

  let inputLeft, inputTop, inputWidth;
  if (multiP) {
    // Title is rotated on the right side of the box
    // Center of text in SVG: x = margin + innerW + 18, y = panelTopSVG + innerH/2
    const svgX = margin + innerW + 18;
    const svgY = panelTopSVG + innerH / 2;
    inputLeft = svgX * scaleX - scrollArea.scrollLeft - 100;
    inputTop  = svgY * scaleY - scrollArea.scrollTop - 12;
    inputWidth = Math.max(180, innerH * 0.7);
  } else {
    // Single panel: title is above the box, right-aligned
    const svgX = margin + innerW - 4;
    const svgY = panelTopSVG - 8;
    inputLeft = (svgX - 200) * scaleX - scrollArea.scrollLeft;
    inputTop  = svgY * scaleY - scrollArea.scrollTop - 12;
    inputWidth = 200;
  }

  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = panel.title;
  inp.style.cssText = `
    position:absolute;
    top:${Math.max(4, inputTop)}px;
    left:${Math.max(4, inputLeft)}px;
    width:${inputWidth}px; height:24px;
    font-family:'Syne',sans-serif; font-size:${numVal('titleSize')||16}px; font-weight:600; color:#222;
    border:none; border-bottom:2px solid #4fc3f7; outline:none;
    background:white; color:#333; padding:2px 6px; z-index:300;
    box-shadow:0 2px 10px rgba(0,0,0,.15); border-radius:4px;
  `;
  let titleCommitted = false;
  const commitTitle = () => {
    if (titleCommitted) return;
    titleCommitted = true;
    panel.title = inp.value;
    if (inp.parentNode) inp.remove();
    renderAll();
  };
  inp.onkeydown = e => {
    if (e.key === 'Enter') { commitTitle(); }
    if (e.key === 'Escape') { titleCommitted = true; if (inp.parentNode) inp.remove(); renderAll(); }
    e.stopPropagation();
  };
  inp.onblur = commitTitle;
  scrollArea.style.position = 'relative';
  scrollArea.appendChild(inp);
  requestAnimationFrame(() => { inp.focus(); inp.select(); });
}
