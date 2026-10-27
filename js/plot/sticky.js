// plot/sticky.js: Sticky gene header and sticky term column that follow the scroll position.
import { controls, state } from '../state.js';
import { v } from '../utils.js';

export function updateStickyGeneHeader(active, totalW, geneLabelPad, firstTop, rowData, matX) {
  const el = v('sticky-gene-header');
  if (!el) return;
  if (!active || geneLabelPad === 0) { el.style.display = 'none'; state._stickyInfo = null; return; }

  // SVG viewBox is "0 -geneLabelPad totalW totalH+geneLabelPad"
  // DOM y = svgPad + (SVG_y + geneLabelPad)
  // Gene names anchor at SVG y = firstTop-6, extend UPWARD by geneLabelPad.
  // DOM top of gene name band = svgPad + firstTop - 6
  const svgPad = 4;
  const geneNamesTop = svgPad + firstTop - 6;

  // Trigger sticky the moment the top of the gene band starts to scroll off
  const naturalTop = geneNamesTop;

  // Legend title sits at SVG y = -31 (legBotY=-3, minus 28px legend height).
  // Gene names bottom at SVG y = firstTop - 6. Add 3px margin each side.
  const cloneVBminY = -38;
  const cloneH      = (firstTop - 6 + 3) - cloneVBminY;

  const mainSvg = v('combined-svg');
  const svgW = mainSvg ? (+mainSvg.getAttribute('width') || totalW) : totalW;

  state._stickyInfo = { naturalTop, svgW, cloneVBminY, cloneH };

  el.style.width   = svgW + 'px';
  el.style.height  = cloneH + 'px';
  el.style.display = 'none';

  const geneMatGroup = mainSvg ? mainSvg.querySelector('.gene-matrix') : null;
  if (!geneMatGroup) return;
  const geneTexts = Array.from(geneMatGroup.querySelectorAll('text'));
  if (!geneTexts.length) return;

  const legendGroup = mainSvg ? mainSvg.querySelector('g.legend') : null;
  const defsEl      = mainSvg ? mainSvg.querySelector('defs') : null;
  // Shift legend down in sticky so it sits closer to gene names
  const legStickyShift = 15;
  const legendHTML  = legendGroup
    ? `<g transform="translate(0,${legStickyShift})">${legendGroup.innerHTML}</g>`
    : '';
  const defsHTML    = defsEl ? defsEl.outerHTML : '';

  const cloneVB = `0 ${cloneVBminY} ${svgW} ${cloneH}`;
  el.innerHTML = `<svg width="${svgW}" height="${cloneH}" viewBox="${cloneVB}" preserveAspectRatio="xMinYMin slice"
    style="background:white;display:block;">
    ${defsHTML}
    ${legendHTML}
    ${geneTexts.map(t => t.outerHTML).join('')}
  </svg>`;

  repositionStickyHeader();
}

export function repositionStickyHeader() {
  const el = v('sticky-gene-header');
  if (!el || !state._stickyInfo) return;
  const scrollArea = v('chart-scroll-area');
  if (!scrollArea) return;
  const scrollTop = scrollArea.scrollTop;
  const { naturalTop } = state._stickyInfo;

  if (scrollTop < naturalTop) {
    el.classList.remove('visible');
    if (!el.classList.contains('visible')) el.style.display = 'none';
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.top  = scrollTop + 'px';
  el.style.left = '0px';
  requestAnimationFrame(() => el.classList.add('visible'));
}

// ── Sticky term column ────────────────────────────────────────────────────────
// Only shown when gene matrix is active AND user has scrolled right (terms cut off).
// Uses IDENTICAL viewBox/coordinate system as the main SVG — no remapping needed.
// Positioning: top=scrollTop, left=scrollLeft (exactly mirrors gene header approach).
export function updateStickyTermColumn(layoutInfo) {
  const el = v('sticky-term-column');
  if (!el) return;

  // Only active when gene matrix is open
  if (!state.accordionMode || !state.panels.some(p => p.rawData.length)) {
    el.style.display = 'none'; el.classList.remove('visible'); state._stickyTermInfo = null; return;
  }

  const { MARGIN_LEFT, innerW, totalH, geneLabelPad, sharedRScale, panelYOffsets, panelLayouts, PANEL_TOP, ICON_TOP, CLUSTER_STRIP_W } = layoutInfo;

  const mainSvg = v('combined-svg');
  if (!mainSvg) { el.style.display = 'none'; return; }

  // Calculate trigger threshold: show sticky when the longest term label starts being cut.
  // We measure actual rendered label widths via getBBox() to find the leftmost text edge.
  let maxLabelW = 0;
  mainSvg.querySelectorAll('text.yl').forEach(t => {
    try { const bb = t.getBBox(); if (bb.width > maxLabelW) maxLabelW = bb.width; } catch(e) {}
  });
  // triggerThreshold = MARGIN_LEFT - maxLabelW - small margin (20px for padding/strip)
  const triggerThreshold = Math.max(0, MARGIN_LEFT - maxLabelW - 20);

  // displayW: extend to the right edge of the plot box (label area + plot + title bar)
  // This ensures the sticky white background covers the full plot area up to the gene matrix
  const TITLE_BAR_W_sticky = state.panels.length > 1 ? 22 : 0;
  const displayW = MARGIN_LEFT + innerW + TITLE_BAR_W_sticky + 10;  // +10 clearance for last tick number

  const plotTop = PANEL_TOP;

  // Are all loaded panels collapsed? Trim height and skip x-axis when true
  const allCollapsed = state.panels.filter(p => p.rawData.length).every(p => p.isCollapsed);
  const lastPi2 = state.panels.length - 1;
  const lastPanelTop2 = lastPi2 === 0 ? PANEL_TOP : ICON_TOP;
  const plotBottom2 = panelYOffsets[lastPi2] + lastPanelTop2 + panelLayouts[lastPi2].innerH + 1;
  const svgH   = allCollapsed ? (plotBottom2 - plotTop + 4) : (totalH - plotTop);
  const vbMinY = plotTop;
  const cloneVB = `0 ${vbMinY} ${displayW} ${svgH}`;

  state._stickyTermInfo = { displayW, svgH, topOffset: 4 + (geneLabelPad || 0) + plotTop, MARGIN_LEFT, CLUSTER_STRIP_W, triggerThreshold, innerW };

  // Clone label-area elements from the rendered main SVG.
  // Each panel's group is translated(MARGIN_LEFT, yOff+panelTop).
  // We wrap clones in <g transform="translate(gx,gy)"> so coordinates are identical.
  const defsEl = mainSvg.querySelector('defs');
  const defsHTML = defsEl ? defsEl.outerHTML : '';
  const parts = [];

  mainSvg.querySelectorAll('g[transform]').forEach(g => {
    const tf = g.getAttribute('transform') || '';
    const m  = tf.match(/translate\(([^,]+),([^)]+)\)/);
    if (!m) return;
    const gx = parseFloat(m[1]);
    const gy = parseFloat(m[2]);
    if (Math.abs(gx - MARGIN_LEFT) > 2) return;  // only panel groups

    // All direct <rect> children: white bg, cluster bands, cluster strips, AND border box (fill=none)
    g.querySelectorAll(':scope > rect').forEach(r => {
      parts.push(`<g transform="translate(${gx},${gy})">${r.outerHTML}</g>`);
    });

    // Direct <line> children: row connector lines
    g.querySelectorAll(':scope > line').forEach(ln => {
      parts.push(`<g transform="translate(${gx},${gy})">${ln.outerHTML}</g>`);
    });

    // Cluster strip text labels (vertical, negative x) — exclude .yl to prevent double-clone
    g.querySelectorAll(':scope > text:not(.yl)').forEach(t => {
      if (parseFloat(t.getAttribute('x') || '0') < 0)
        parts.push(`<g transform="translate(${gx},${gy})">${t.outerHTML}</g>`);
    });

    // Term labels (.yl) — clone exactly; fill="#333" is already an explicit SVG attribute
    g.querySelectorAll('text.yl').forEach(t => {
      parts.push(`<g transform="translate(${gx},${gy})">${t.outerHTML}</g>`);
    });

    // Info icons
    g.querySelectorAll('g.term-info-icon').forEach(ig => {
      parts.push(`<g transform="translate(${gx},${gy})">${ig.outerHTML}</g>`);
    });

    // Edit checkboxes — clone when edit mode is active so user can toggle from sticky bar
    if (controls.editMode) {
      g.querySelectorAll('g.edit-cbs').forEach(cbs => {
        parts.push(`<g transform="translate(${gx},${gy})" class="sticky-edit-cbs">${cbs.innerHTML}</g>`);
      });
    }

    // Plot content: grid, lollipop lines, dots at real positions (inside clip-path group)
    g.querySelectorAll('g[clip-path]').forEach(gplot => {
      parts.push(`<g transform="translate(${gx},${gy})" clip-path="${gplot.getAttribute('clip-path') || ''}">${gplot.innerHTML}</g>`);
    });

    // X-axis groups — skip when all panels collapsed (no x-axis needed for dot column view)
    if (!allCollapsed) {
      g.querySelectorAll(':scope > g[transform]:not([clip-path])').forEach(axG => {
        const atf = axG.getAttribute('transform') || '';
        if (atf.includes('translate(0') && !axG.classList.contains('collapse-btn'))
          parts.push(`<g transform="translate(${gx},${gy})">${axG.outerHTML}</g>`);
      });
    }
  });

  // Right border
  parts.push(`<line x1="${displayW-1}" y1="${vbMinY}" x2="${displayW-1}" y2="${vbMinY + svgH}" stroke="#e0e0e0" stroke-width="1"/>`);

  // Dashed connector lines from gene-matrix group: segment 1 starts at dotX (inside plot)
  // and ends at btnStartX-2. Clone any line whose x1 falls within displayW.
  const geneMatGroup = mainSvg.querySelector('g.gene-matrix');
  if (geneMatGroup) {
    geneMatGroup.querySelectorAll('line').forEach(ln => {
      const x1 = parseFloat(ln.getAttribute('x1') || '0');
      const x2 = parseFloat(ln.getAttribute('x2') || '0');
      // Include line if it starts within the sticky column (at least the leftmost part is visible)
      if (x1 <= displayW) {
        // Clip x2 to displayW so it doesn't extend beyond the sticky
        const cloned = ln.cloneNode(true);
        if (x2 > displayW) cloned.setAttribute('x2', displayW);
        parts.push(cloned.outerHTML);
      }
    });
  }

  // X-axis label (-log₁₀(p_adj)) — skip when all panels collapsed
  if (!allCollapsed) {
    mainSvg.querySelectorAll(':scope > text').forEach(t => {
      const clone = t.cloneNode(true);
      // Centre under the plot area
      clone.setAttribute('x', MARGIN_LEFT + innerW / 2);
      clone.setAttribute('text-anchor', 'middle');
      parts.push(clone.outerHTML);
    });
  }

  el.style.width  = displayW + 'px';
  el.style.height = svgH + 'px';
  el.style.display = 'none';

  el.innerHTML = `<svg width="${displayW}" height="${svgH}"
    viewBox="${cloneVB}" preserveAspectRatio="xMinYMin meet"
    style="background:white;display:block;overflow:hidden;"
    font-family="'JetBrains Mono',monospace">
    ${defsHTML}${parts.join('')}
  </svg>`;

  // Wire dot tooltip
  const stickySvg = el.querySelector('svg');
  if (stickySvg) {
    // Wire edit checkboxes: find matching rect in main SVG by panel gy + rect y, forward click
    if (controls.editMode) {
      stickySvg.querySelectorAll('g.sticky-edit-cbs rect').forEach(sRect => {
        sRect.style.cursor = 'pointer';
        sRect.style.pointerEvents = 'all';
        const sRy = sRect.getAttribute('y');
        // Find parent group's gy from transform
        const parentG = sRect.closest('g[transform]');
        if (!parentG) return;
        const ptf = parentG.getAttribute('transform') || '';
        const pm  = ptf.match(/translate\(([^,]+),([^)]+)\)/);
        if (!pm) return;
        const sGy = parseFloat(pm[2]);
        sRect.addEventListener('click', function(e) {
          e.stopPropagation();
          // Find matching rect in main SVG at same panel group gy + rect y
          mainSvg.querySelectorAll('g[transform]').forEach(mg => {
            const mtf = mg.getAttribute('transform') || '';
            const mm  = mtf.match(/translate\([^,]+,([^)]+)\)/);
            if (!mm || Math.abs(parseFloat(mm[1]) - sGy) > 2) return;
            mg.querySelectorAll('g.edit-cbs rect').forEach(mRect => {
              if (mRect.getAttribute('y') === sRy) {
                mRect.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
              }
            });
          });
        });
      });
    }
    // Dot tooltip: forward to matching main-SVG dot
    const stickyTip = v('tooltip');
    stickySvg.addEventListener('mousemove', function(evt) {
      const dot = evt.target.closest('circle.dot');
      if (!dot) { if (stickyTip) stickyTip.classList.remove('show'); return; }
      // Forward to the same dot in the main SVG
      const dotCx = dot.getAttribute('cx');
      const dotCy = dot.getAttribute('cy');
      // Walk up to find the enclosing translated g (panel group)
      let parentG = dot.parentElement;
      while (parentG && parentG.tagName !== 'svg') {
        const ptf = parentG.getAttribute('transform') || '';
        const pm = ptf.match(/translate\(([^,]+),([^)]+)\)/);
        if (pm) {
          const pgx = parseFloat(pm[1]), pgy = parseFloat(pm[2]);
          if (Math.abs(pgx - MARGIN_LEFT) < 3) {
            // Find matching dot in main SVG panel group
            mainSvg.querySelectorAll('g[transform]').forEach(g => {
              const gtf = g.getAttribute('transform') || '';
              const gm  = gtf.match(/translate\(([^,]+),([^)]+)\)/);
              if (!gm) return;
              if (Math.abs(parseFloat(gm[1]) - pgx) > 2 || Math.abs(parseFloat(gm[2]) - pgy) > 2) return;
              g.querySelectorAll(`circle.dot[cx="${dotCx}"][cy="${dotCy}"]`).forEach(d => {
                d.dispatchEvent(new MouseEvent('mousemove', {
                  bubbles: true, clientX: evt.clientX, clientY: evt.clientY
                }));
              });
            });
            break;
          }
        }
        parentG = parentG.parentElement;
      }
    });
    if (stickyTip) stickySvg.addEventListener('mouseleave', () => stickyTip.classList.remove('show'));
  }

  repositionStickyTermColumn();
}

export function repositionStickyTermColumn() {
  const el = v('sticky-term-column');
  if (!el || !state._stickyTermInfo) return;
  const scrollArea = v('chart-scroll-area');
  if (!scrollArea) return;
  const scrollLeft = scrollArea.scrollLeft;
  const scrollTop  = scrollArea.scrollTop;

  const { topOffset, triggerThreshold } = state._stickyTermInfo;

  // Only show when gene matrix is active and labels are about to be cut
  if (!state.accordionMode || scrollLeft < (triggerThreshold || 1)) {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.style.top = topOffset + 'px';
  el.style.left = '0px';
  el.style.transform = `translateX(${scrollLeft}px)`;

  // Make all dots visible immediately
  el.querySelectorAll('circle.dot').forEach(d => d.style.opacity = '1');

  // Sync gene header sticky if needed
  if (state._stickyInfo) {
    repositionStickyHeader();
  }
}

// Scroll listeners for the chart area.
export function initScrollHandlers() {
  v('chart-scroll-area').addEventListener('scroll', repositionStickyHeader, { passive: true });
  v('chart-scroll-area').addEventListener('scroll', repositionStickyTermColumn, { passive: true });
  // Slow down scroll speed — default browser wheel scrolls too fast for dense charts
  v('chart-scroll-area').addEventListener('wheel', (e) => {
    e.preventDefault();
    const area = v('chart-scroll-area');
    area.scrollTop  += e.deltaY * 0.4;
    area.scrollLeft += e.deltaX * 0.4;
  }, { passive: false });
}
