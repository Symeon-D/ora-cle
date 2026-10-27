// plot/render.js: Stacked-panel SVG rendering (render() is kept whole, see README).
import { attachClusterDrag, showAssignMenu } from '../clustering/manual-ui.js';
import { getPanelClusters, getTermCluster, reconcileUngrouped } from '../clustering/manual.js';
import { positionInfoTooltip, showInfoTooltip } from '../go/tooltip.js';
import { setActivePanelId, updateDropZones } from '../panels.js';
import { getPanelData } from '../pipeline.js';
import { collapseAllTerms, expandAllTerms } from './gene-matrix.js';
import { updateStickyGeneHeader, updateStickyTermColumn } from './sticky.js';
import { startTitleEdit } from './title-edit.js';
import { PANEL_COLORS, activePanel, controls, openTermKeys, state } from '../state.js';
import { updateFilterClustersBtn } from '../ui/header.js';
import { numVal, v } from '../utils.js';

export function renderAll() { render(); updateFilterClustersBtn(); }

export function render() {
  if (!state.panels.length) return;

  const loaded = state.panels.filter(p => p.rawData.length);
  if (!loaded.length) { updateDropZones(); return; }

  // ── Shared X scale: global max across all loaded panels ──────────────────────
  let globalXMax = 0;
  loaded.forEach(p => {
    const d = getPanelData(p);
    if (d.length) globalXMax = Math.max(globalXMax, d3.max(d, r=>r['-log10(padj)'])||0);
  });
  // Tiered rounding up — ≤5: nearest 0.5 | ≤20: nearest 1 | ≤100: nearest 5 | >100: nearest 10
  // Examples: 3.4→3.5, 3.9→4.0, 54→55, 56.953→60
  if      (globalXMax <= 5)   globalXMax = Math.max(0.5, Math.ceil(globalXMax * 2) / 2);
  else if (globalXMax <= 20)  globalXMax = Math.ceil(globalXMax);
  else if (globalXMax <= 100) globalXMax = Math.ceil(globalXMax / 5) * 5;
  else                        globalXMax = Math.ceil(globalXMax / 10) * 10;

  // ── Per-panel data + layout ───────────────────────────────────────────────────
  // Layout FONT_SIZE — resolved later after ap is defined; placeholder here
  const LAYOUT_FONT_SIZE_FN = () => (activePanel()?.appearance.fontSize) || numVal('fontSize') || 13;
  const LAYOUT_FONT_SIZE = LAYOUT_FONT_SIZE_FN();
  const cbSize     = Math.max(Math.round(LAYOUT_FONT_SIZE * 0.9), 13);
  const cbPad      = 6;
  const cbReserve  = controls.editMode ? cbSize + cbPad + 10 : 0;
  // Strip shown if cluster mode active OR any panel has named cluster assignments
  const anyPanelHasClusters = state.panels.some(p => getPanelClusters(p).some(c => c.id !== 0 && c.terms.length > 0));
  const CLUSTER_STRIP_W = (state.clusterMode || anyPanelHasClusters) ? 16 : 0;
  const LEGEND_W   = 175;  // actual legend content width
  const PANEL_GAP  = 8;    // gap so panel borders are visible
  const container  = v('chart-scroll-area');
  const availW     = Math.max(container.clientWidth - 4, 400);
  // Compute per-panel layout
  const panelLayouts = state.panels.map(panel => {
    const data = getPanelData(panel);
    const terms = data.map(d => d.term_name);
    const pFontSize = panel.appearance.fontSize || numVal('fontSize') || 13;
    const maxChars = terms.length ? Math.max(...terms.map(s=>s.length), 10) : 20;
    const labelWidth = Math.min(maxChars * (pFontSize * 0.60), 420);
    const rowH = Math.max(pFontSize * 2.1, 22);
    const innerH = terms.length * rowH;  // same height whether collapsed or not
    return { data, terms, labelWidth, rowH, innerH };
  });

  // Common left margin = max labelWidth across all panels + checkbox reserve
  const maxLabelW = Math.max(...panelLayouts.map(l => l.labelWidth), 80);
  const MARGIN_LEFT  = maxLabelW + 18 + cbReserve + CLUSTER_STRIP_W + (CLUSTER_STRIP_W ? 4 : 0);
  const geneMatActive = state.accordionMode && openTermKeys.size > 0;
  const MARGIN_RIGHT = geneMatActive ? 20 : LEGEND_W + 30;
  // Gene matrix active: compress plot width so matrix columns are visible
  const plotScale = parseFloat(v('plotScale')?.value || '1') || 1;
  const rawInnerW = availW - MARGIN_LEFT - MARGIN_RIGHT;
  const innerW = geneMatActive
    ? Math.max(Math.min(rawInnerW, 150), 120)  // compressed: max 150px
    : Math.max(rawInnerW * plotScale, 200);

  // Total SVG height: first panel has top padding, all panels reserve icon bar space above
  const PANEL_TOP    = 26;  // top of first panel (title bar + breathing room)
  const ICON_TOP     = 8;   // small top pad for non-first panels
  const PANEL_BOTTOM = 32;  // x-axis area (last panel only)
  let totalH = 0;
  const panelYOffsets = [];
  state.panels.forEach((panel, pi) => {
    panelYOffsets.push(totalH);
    const { innerH } = panelLayouts[pi];
    const top    = pi === 0 ? PANEL_TOP : ICON_TOP;
    const bottom = pi === state.panels.length-1 ? PANEL_BOTTOM : 0;
    totalH += top + innerH + bottom + (pi < state.panels.length-1 ? PANEL_GAP : 0);
  });
  totalH += 30; // x-axis label below last panel
  // Extra width for gene matrix if any terms open
  let matrixExtraW = 0;
  let geneLabelPad = 0;  // dynamic: based on longest gene name at font-size 11
  if (state.accordionMode && openTermKeys.size > 0) {
    const allGenes = new Set();
    state.panels.forEach(panel => {
      getPanelData(panel).forEach(d => {
        if (openTermKeys.has(panel.id + '::' + d.term_name) && d.genes)
          d.genes.forEach(g => allGenes.add(g));
      });
    });
    if (allGenes.size > 0) {
      matrixExtraW = 50 + 8 + 6 + allGenes.size * 16 + 12 + 30;
      const longestGene = Math.max(...[...allGenes].map(g => g.length), 1);
      geneLabelPad = Math.ceil(longestGene * 11 * 0.6);
    }
  }
  const totalW = MARGIN_LEFT + innerW + MARGIN_RIGHT + matrixExtraW;

  // xScale defined below after dot headroom adjustment

  // ── Build SVG ────────────────────────────────────────────────────────────────
  const svg = d3.select('#combined-svg')
    .attr('width', totalW).attr('height', totalH + geneLabelPad)
    .attr('viewBox', `0 ${-geneLabelPad} ${totalW} ${totalH + geneLabelPad}`)
    .attr('data-margin-left', MARGIN_LEFT)
    .style('background','white')
    .style('overflow','visible');
  svg.selectAll('*').remove();

  const tip = v('tooltip');
  const activePanelObj = activePanel();

  // ── Shared scales across all loaded panels ───────────────────────────────────
  const firstLoaded = loaded[0];
  const ap = activePanel();
  // sizeMode is global — sync all panels to active panel's setting
  const activeSizeMode = (ap && ap.appearance.sizeMode) || 'percentage';
  loaded.forEach(p => { p.appearance.sizeMode = activeSizeMode; });
  const sharedSizeMode = activeSizeMode;
  // Dot scale and colors are shared from active panel for visual consistency
  const sharedDotScale  = (ap || firstLoaded).appearance.dotScale;
  const sharedColorLow  = (ap || firstLoaded).appearance.colorLow;
  const sharedColorHigh = (ap || firstLoaded).appearance.colorHigh;
  let globalSizeMax = 0, globalFeMin = Infinity, globalFeMax = -Infinity;
  loaded.forEach(p => {
    getPanelData(p).forEach(r => {
      const s = sharedSizeMode==='percentage' ? Math.max((r.intersection_size/r.query_size)*100,1) : r.intersection_size;
      if (s > globalSizeMax) globalSizeMax = s;
      if (r['log2(Fold_Enrichment)'] < globalFeMin) globalFeMin = r['log2(Fold_Enrichment)'];
      if (r['log2(Fold_Enrichment)'] > globalFeMax) globalFeMax = r['log2(Fold_Enrichment)'];
    });
  });
  if (globalSizeMax === 0) globalSizeMax = 1;
  if (!isFinite(globalFeMin)) { globalFeMin = 0; globalFeMax = 1; }
  const sharedRScale = d3.scaleSqrt().domain([0, globalSizeMax]).range([2, sharedDotScale]);

  // Dynamic x-axis headroom: expand globalXMax so rightmost dot never clips
  // Must be after sharedRScale is defined
  {
    const radii = loaded.flatMap(p => getPanelData(p).map(d => {
      const s = sharedSizeMode==='percentage'
        ? Math.max((d.intersection_size / d.query_size) * 100, 1)
        : d.intersection_size;
      return Math.max(sharedRScale(s), 1.5);
    }));
    const maxDotR = radii.length > 0 ? Math.max(...radii) : sharedDotScale;
    // Use a stable minimum innerW for headroom so gene matrix compression doesn't inflate the axis
    const headroomW = Math.max(innerW, 300);
    if (headroomW > 0 && globalXMax > 0) {
      const dotHeadroom = (maxDotR + 2) * (globalXMax / headroomW);
      const xMaxWithDot = globalXMax + dotHeadroom;
      if      (xMaxWithDot <= 5)   globalXMax = Math.max(0.5, Math.ceil(xMaxWithDot * 2) / 2);
      else if (xMaxWithDot <= 20)  globalXMax = Math.ceil(xMaxWithDot);
      else if (xMaxWithDot <= 100) globalXMax = Math.ceil(xMaxWithDot / 5) * 5;
      else                         globalXMax = Math.ceil(xMaxWithDot / 10) * 10;
    }
  }
  const xScale = d3.scaleLinear().domain([0, globalXMax]).range([0, innerW]);

  // ── Draw each panel ───────────────────────────────────────────────────────────
  const multiPanel = state.panels.length > 1;
  const TITLE_BAR_W = 22;  // width of sideways title bar (multi-panel)

  state.panels.forEach((panel, pi) => {
    const { data, terms, innerH } = panelLayouts[pi];
    // Keep Ungrouped in sync with currently visible terms
    reconcileUngrouped(panel, terms);
    const labelWidth = MARGIN_LEFT - 18 - cbReserve;  // exact space available
    const FONT_SIZE = panel.appearance.fontSize || numVal('fontSize') || 13;
    const yOff       = panelYOffsets[pi];
    const isActive   = panel.id === state.activePanelId;
    const panelColor = PANEL_COLORS[pi % PANEL_COLORS.length];
    const isLast     = pi === state.panels.length - 1;
    const panelTop = pi === 0 ? PANEL_TOP : ICON_TOP;
    const gP = svg.append('g').attr('transform',`translate(${MARGIN_LEFT},${yOff + panelTop})`);

    const yScale = d3.scaleBand().domain(terms).range([0, innerH]).padding(0.28);

    // ── Clip path to keep lollipops/dots inside box ──
    const clipId = `clip-panel-${panel.id}`;
    svg.append('defs').append('clipPath').attr('id', clipId)
      .append('rect').attr('x',0).attr('y',0).attr('width',innerW).attr('height',innerH);

    // ── White background for this panel's plot area ──
    gP.append('rect').attr('x',0).attr('y',0).attr('width',innerW).attr('height',Math.max(innerH,1))
      .attr('fill','white').attr('stroke','none').style('pointer-events','none');
    // Inner plot group with clip applied
    const gPlot = gP.append('g').attr('clip-path',`url(#${clipId})`);

    if (!panel.rawData.length) {
      gP.append('rect').attr('x',0).attr('y',0).attr('width',innerW).attr('height',110)
        .attr('fill','#fafafa').attr('stroke','#ddd').attr('stroke-width',1.5).attr('stroke-dasharray','6,4').attr('rx',4)
        .style('pointer-events','none');
      // Empty panel: just show a minimal placeholder, no drop zone needed
      return;
    }

    // Color scale — defined here so it's available for rendering
    const colorScale = d3.scaleLinear().domain([globalFeMin,globalFeMax]).range([panel.appearance.colorLow, panel.appearance.colorHigh]);

    // Cluster strip, labels, border, title — always rendered
    // ── Cluster strip: color bar at far-left of label area + background bands
    if (CLUSTER_STRIP_W > 0) {
      // Build bands: consecutive terms belonging to same cluster
      let prevCl=null, bandStart=0; const bands=[];
      data.forEach((d,i) => {
        const cl = getTermCluster(d.term_name, panel);
        const clId = cl ? cl.id : -1;
        const prevId = prevCl ? prevCl.id : -2;
        if (clId !== prevId) {
          if (prevCl) bands.push({cl:prevCl, start:bandStart, end:i-1});
          bandStart = i; prevCl = cl;
        }
        if (i === data.length-1) bands.push({cl:prevCl||null, start:bandStart, end:i});
      });

      const stripX = -(maxLabelW + cbReserve + CLUSTER_STRIP_W + 6);
      const bandX0 = stripX + CLUSTER_STRIP_W;
      const bandW0 = -stripX - CLUSTER_STRIP_W + innerW;

      const firstVisibleIdx = 0, lastVisibleIdx = data.length - 1;
      bands.forEach(({cl, start, end}) => {
        if (!cl) return;
        const isUngrouped = cl.id === 0;
        // After Apply (clusterMode=false), only render named cluster bands, not ungrouped
        if (isUngrouped && !state.clusterMode) return;
        const color = cl.color;
        const rowPad = yScale.bandwidth() * 0.15;
        // Clamp first band to y=0, last band to y=innerH so color reaches plot edges
        const rawY0 = yScale(data[start].term_name) - rowPad;
        const rawY1 = yScale(data[end].term_name) + yScale.bandwidth() + rowPad;
        const y0 = start === firstVisibleIdx ? 0 : rawY0;
        const y1 = end   === lastVisibleIdx  ? innerH : rawY1;

        // Background band (ungrouped gets very faint grey, named clusters get their color)
        gP.append('rect')
          .attr('x', bandX0).attr('y', y0)
          .attr('width', bandW0).attr('height', y1 - y0)
          .attr('fill', color).attr('opacity', isUngrouped ? 0.06 : 0.15).attr('rx', 0)
          .style('pointer-events','none');

        // Color strip beside term labels
        gP.append('rect')
          .attr('x', stripX).attr('y', y0)
          .attr('width', CLUSTER_STRIP_W).attr('height', y1 - y0)
          .attr('fill', color).attr('opacity', 1)
          .attr('rx', 3)
          .style('pointer-events','none');

        // Vertical label: font scaled so full name fits within strip height (rotated -90°)
        // Strip height (y1-y0) = available text width after rotation
        // Strip width (CLUSTER_STRIP_W=16px) = max text height = max font-size
        if (cl.name && (y1 - y0) > 10) {
          const cx     = stripX + CLUSTER_STRIP_W / 2;
          const cy     = (y0 + y1) / 2;
          const availW = y1 - y0;
          // JetBrains Mono bold: ~0.60 char width per em — reliable monospace estimate
          const fs = Math.min(CLUSTER_STRIP_W * 0.78, availW / (cl.name.length * 0.60));
          if (fs >= 4.5) {
            gP.append('text')
              .attr('x', cx).attr('y', cy)
              .attr('transform', `rotate(-90,${cx},${cy})`)
              .attr('text-anchor','middle').attr('dominant-baseline','central')
              .attr('font-size', fs)
              .attr('font-weight','700').attr('font-family',"'JetBrains Mono',monospace")
              .attr('fill','white').attr('opacity', 0.95)
              .style('pointer-events','none')
              .text(cl.name);
          }
        }
      });
    }

    // Grid
    gPlot.append('g').selectAll('line.grid').data(xScale.ticks(5)).join('line').attr('class','grid')
      .attr('x1',d=>xScale(d)).attr('x2',d=>xScale(d)).attr('y1',0).attr('y2',innerH)
      .attr('stroke','#f0f0f0').attr('stroke-width',1).style('pointer-events','none');

    // Color + size
    if (sharedSizeMode==='percentage') data.forEach(d=>{d._size=Math.max((d.intersection_size/d.query_size)*100,1);});
    else data.forEach(d=>{d._size=d.intersection_size;});

    // Lollipop lines
    if (controls.lolipop) {
      gPlot.append('g').selectAll('line.lp').data(data).join('line').attr('class','lp')
        .attr('x1',0).attr('x2',d=>xScale(d['-log10(padj)']))
        .attr('y1',d=>yScale(d.term_name)+yScale.bandwidth()/2)
        .attr('y2',d=>yScale(d.term_name)+yScale.bandwidth()/2)
        .attr('stroke',d=>colorScale(d['log2(Fold_Enrichment)']))
        .attr('stroke-width',panel.appearance.lineWidth)
        .attr('stroke-opacity',d=>d._hidden?.12:.45).attr('stroke-linecap','round')
        .style('pointer-events','none');
    }

    // Dots
    gPlot.append('g').selectAll('circle.dot').data(data).join('circle').attr('class','dot')
      .attr('cx',d=>xScale(d['-log10(padj)']))
      .attr('cy',d=>yScale(d.term_name)+yScale.bandwidth()/2)
      .attr('r',d=>Math.max(sharedRScale(d._size),1.5))
      .attr('fill',d=>colorScale(d['log2(Fold_Enrichment)']))
      .attr('stroke','white').attr('stroke-width',1.2).attr('opacity',d=>d._hidden?.15:1)
      .style('cursor','pointer')
      .on('mousemove',(event,d)=>{
        tip.classList.add('show');
        v('tt-name').textContent=d.term_name; v('tt-padj').textContent=d3.format('.2e')(d.p_value);
        v('tt-log10').textContent=d3.format('.3f')(d['-log10(padj)']); v('tt-tsize').textContent=d.term_size;
        v('tt-inter').textContent=d.intersection_size+' / '+d.query_size;
        v('tt-fe').textContent=d3.format('.2f')(d['log2(Fold_Enrichment)']);
        const genes = d.genes && d.genes.length ? d.genes : [];
        v('tt-genes').textContent = genes.length ? genes.join(', ') : '—';
        // Dynamic width: start narrow, widen until tooltip fits within viewport height
        const charPx = 5.8;
        const padding = 26;
        const viewportH = window.innerHeight;
        if (genes.length > 0) {
          const longestGene = Math.max(...genes.map(g => g.length));
          const geneItemW = (longestGene + 2) * charPx;
          let bestW = 260;
          for (let gpr = 4; gpr <= 15; gpr++) {
            bestW = Math.max(260, Math.min(Math.round(geneItemW * gpr + padding), 600));
            tip.style.width = bestW + 'px';
            const predictedY = event.clientY + 20;
            const tipH = tip.offsetHeight || 160;
            if (predictedY + tipH < viewportH - 20 || bestW >= 580) break;
          }
        } else {
          tip.style.width = '';
        }
        (function positionDotTip(cx, cy) {
          const vw = window.innerWidth, vh = window.innerHeight;
          const tw = tip.offsetWidth  || 220;
          const th = tip.offsetHeight || 160;
          let tx = cx + 16;
          let ty = cy - 10;
          if (tx + tw > vw - 8) tx = cx - tw - 8;   // flip left
          if (ty + th > vh - 8) ty = vh - th - 8;   // clamp up
          if (ty < 8) ty = 8;
          tip.style.left = tx + 'px';
          tip.style.top  = ty + 'px';
        })(event.clientX, event.clientY);
      }).on('mouseleave',()=>tip.classList.remove('show'));
    // ── Gene accordion: + buttons per term row ──────────────────────────────
    if (state.accordionMode) {
      const btnW = 16, btnH = 16;
      // Multi-panel: place buttons right of title bar; single: right of plot
      const btnX = multiPanel ? innerW + TITLE_BAR_W + 6 : innerW + 6;
      data.forEach(d => {
        const cy     = yScale(d.term_name) + yScale.bandwidth()/2;
        const key    = panel.id + '::' + d.term_name;
        const isOpen = openTermKeys.has(key);
        const fo = gP.append('foreignObject')
          .attr('x', btnX).attr('y', cy - btnH/2)
          .attr('width', btnW).attr('height', btnH);
        fo.append('xhtml:div')
          .attr('class', 'ga-fo-btn' + (isOpen ? ' open' : ''))
          .text(isOpen ? '−' : '+')
          .on('click', function(event) {
            event.stopPropagation();
            if (openTermKeys.has(key)) openTermKeys.delete(key);
            else openTermKeys.add(key);
            renderAll();
          });
      });
      // Expand/collapse all button — same size as per-row buttons, centred above them
      {
        const hasAny = data.some(d => openTermKeys.has(panel.id + '::' + d.term_name));
        // Centre the 16×16 button in the available header space
        const headerH = multiPanel ? ICON_TOP : PANEL_TOP;
        const exFo = gP.append('foreignObject')
          .attr('x', btnX)
          .attr('y', -headerH + (headerH - btnH) / 2)
          .attr('width', btnW).attr('height', btnH);
        exFo.append('xhtml:div')
          .attr('class', 'ga-fo-btn' + (hasAny ? ' open' : ''))
          .text(hasAny ? '−−' : '++')
          .attr('title', hasAny ? 'Collapse all' : 'Expand all')
          .on('click', function(e) {
            e.stopPropagation();
            if (hasAny) collapseAllTerms(panel); else expandAllTerms(panel);
          });
      }
    }

    // Border box: always shown; with multiple panels extends to cover labels on active
    if (state.panels.length === 1) {
      // Single panel: simple border, no highlight
      gP.append('rect').attr('x',0).attr('y',0).attr('width',innerW).attr('height',innerH)
        .attr('fill','none').attr('stroke','#ccc').attr('stroke-width',1)
        .attr('rx',2).style('pointer-events','none');
    } else {
      // Multiple panels: active gets colored border extending to labels (and strip in cluster mode)
      // Use this panel's actual label width so highlight fits its own terms exactly
      const thisLabelW = panelLayouts[pi].labelWidth;
      const hlLeftReach = thisLabelW + cbReserve + 14 + (CLUSTER_STRIP_W > 0 ? CLUSTER_STRIP_W + 2 : 0);
      const hlX = isActive ? -hlLeftReach : 0;
      const hlW = isActive ? hlLeftReach + innerW : innerW;
      gP.append('rect')
        .attr('x', hlX).attr('y', 0).attr('width', hlW).attr('height', innerH)
        .attr('fill', isActive ? panelColor + '06' : 'none')
        .attr('stroke', isActive ? panelColor : '#ccc')
        .attr('stroke-width', isActive ? 1.5 : 1)
        .attr('rx', 2).style('pointer-events','none');
    }

    // (quick-action icons rendered in HTML overlay — see #plot-icon-bar)

    // (active accent handled by title bar tint)

    // Y labels (pointer-events none, hit rect handles selection)
    // Y labels with 2-line wrapping for long terms
    const xLabelPos = controls.editMode && isActive ? -(cbSize+cbPad+10) : -10;
    const charW = FONT_SIZE * 0.60;  // JetBrains Mono is monospace
    // Available text width ends at xLabelPos; strip takes space to the left of that
    const textBudget = labelWidth - (CLUSTER_STRIP_W > 0 ? CLUSTER_STRIP_W + 6 : 0);
    const charsPerLine = Math.max(Math.floor(textBudget / charW), 10);
    // Info icon size: tiny circle, barely visible, placed between label and plot border
    const INFO_R = Math.max(FONT_SIZE * 0.28, 3.5);  // tiny radius
    const INFO_X = -5;  // 5px left of x=0 (plot border)
    terms.forEach(term => {
      const cy = yScale(term) + yScale.bandwidth()/2;
      const fill = panel.hiddenTerms.has(term) ? '#ccc' : '#333';
      const words = term.split(' ');
      // Build lines greedily
      const lines = [];
      let cur = '';
      words.forEach(w => {
        const test = cur ? cur + ' ' + w : w;
        if (test.length <= charsPerLine) { cur = test; }
        else { if (cur) lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      const nLines = Math.min(lines.length, 2);
      const lineH = FONT_SIZE * 1.2;
      const totalH = nLines * lineH;
      const t = gP.append('text').attr('class','yl')
        .attr('x', xLabelPos).attr('text-anchor','end')
        .attr('font-size', FONT_SIZE).attr('fill', fill)
        .attr('font-weight','400').attr('font-family',"'JetBrains Mono',monospace")
        .style('pointer-events','none');
      for (let li = 0; li < nLines; li++) {
        const lineText = li === 1 && lines.length > 2 ? lines[li].slice(0,charsPerLine-1)+'…' : lines[li];
        t.append('tspan')
          .attr('x', xLabelPos)
          .attr('dy', li === 0 ? cy - totalH/2 + lineH * 0.78 : lineH)
          .text(lineText);
      }

      // Tiny info icon: a faint circle-i placed just left of plot border
      const termData = data.find(d => d.term_name === term);
      if (termData) {
        const infoG = gP.append('g')
          .attr('class', 'term-info-icon')
          .attr('transform', `translate(${INFO_X}, ${cy})`)
          .style('cursor', 'help')
          .on('mouseover', function(event) {
            showInfoTooltip(termData.term_id, termData.term_name, event.clientX, event.clientY);
          })
          .on('mousemove', function(event) {
            positionInfoTooltip(event.clientX, event.clientY);
          })
          .on('mouseout', function() {
            const tip = v('go-def-tooltip'); if (tip) tip.classList.remove('show');
          });

        // Outer circle — fill transparent so entire area is hoverable (not just stroke)
        infoG.append('circle')
          .attr('r', INFO_R)
          .attr('fill', 'transparent')
          .attr('stroke', '#999')
          .attr('stroke-width', 0.9)
          .attr('opacity', 0.55);

        // "i" letter — tiny, centered
        infoG.append('text')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('font-size', Math.max(INFO_R * 1.3, 4))
          .attr('fill', '#888')
          .attr('opacity', 0.65)
          .attr('font-family', 'Georgia, serif')
          .attr('font-style', 'italic')
          .attr('font-weight', '400')
          .style('pointer-events', 'none')
          .text('i');
      }
    });

    // Edit checkboxes (active panel only) — keep pointer-events
    if (controls.editMode && isActive && data.length) {
      const cbGroup = gP.append('g').attr('class','edit-cbs');
      data.forEach(d => {
        const cy = yScale(d.term_name) + yScale.bandwidth()/2;
        const vis = !d._hidden, rx = -(cbSize+cbPad), ry = cy - cbSize/2;
        cbGroup.append('rect').attr('x',rx).attr('y',ry).attr('width',cbSize).attr('height',cbSize).attr('rx',3)
          .attr('fill',vis?'#4fc3f7':'white').attr('stroke',vis?'#4fc3f7':'#bbb').attr('stroke-width',1.5)
          .style('cursor','pointer')
          .on('click', e => { e.stopPropagation(); panel.hiddenTerms.has(d.term_name)?panel.hiddenTerms.delete(d.term_name):panel.hiddenTerms.add(d.term_name); renderAll(); });
        if (vis) cbGroup.append('polyline')
          .attr('points',`${rx+cbSize*.18},${ry+cbSize*.52} ${rx+cbSize*.42},${ry+cbSize*.76} ${rx+cbSize*.82},${ry+cbSize*.28}`)
          .attr('fill','none').attr('stroke','white').attr('stroke-width',Math.max(cbSize*.13,1.6))
          .attr('stroke-linecap','round').attr('stroke-linejoin','round').style('pointer-events','none');
      });
    }

    // Title: gray box spanning panel edge, black text, always clickable
    const titleStr = (panel.title||'').length>40 ? panel.title.slice(0,39)+'…' : (panel.title||'');
    const titleBg = !multiPanel ? 'transparent' : (isActive ? panelColor + '33' : '#e8e8e8');
    const titleFg = '#222';
    if (multiPanel) {
      // Gray bar on the right edge spanning full panel height
      const tx = innerW + 1, barW = TITLE_BAR_W;
      const tCx = tx + barW/2, tCy = innerH/2;
      const userTitleSize = panel.appearance.titleSize || numVal('titleSize') || 16;
      // Rotated 90°: text runs along innerH, text height = font-size fits in TITLE_BAR_W
      // charW ≈ 0.58 per em for Syne 600 (proportional, mixed case)
      const fsFromLength = (innerH * 0.92) / (titleStr.length * 0.58);  // fit text along bar height
      const fsFromBarW   = TITLE_BAR_W * 0.75;                          // fit font-size within bar width
      const maxTitleSize = Math.floor(Math.min(fsFromBarW, fsFromLength));
      const scaledTitleSize = Math.min(userTitleSize, fsFromBarW, fsFromLength);
      // Update slider max for active panel so user can't exceed what fits
      if (isActive) {
        const slMax = Math.max(7, maxTitleSize);
        ['titleSize','titleSizeNum'].forEach(id => { const el=v(id); if(el){ el.max=slMax; if(+el.value>slMax){ el.value=slMax; } } });
      }
      gP.append('rect')
        .attr('x', tx).attr('y', 0)
        .attr('width', barW).attr('height', innerH)
        .attr('fill', titleBg).attr('rx', 0)
        .style('cursor','text')
        .on('click', e => { e.stopPropagation(); startTitleEdit(panel, pi, yOff + panelTop, innerH, innerW); });
      gP.append('text')
        .attr('x', tCx).attr('y', tCy)
        .attr('transform',`rotate(90,${tCx},${tCy})`)
        .attr('text-anchor','middle').attr('dominant-baseline','middle')
        .attr('font-size', scaledTitleSize).attr('font-weight','600')
        .attr('fill', titleFg).attr('font-family',"'Syne',sans-serif")
        .attr('id',`panel-title-svg-${panel.id}`)
        .style('cursor','text').style('pointer-events','none')
        .text(titleStr);
    } else {
      // Gray bar above the box, full width
      const barH = 22;
      gP.append('rect')
        .attr('x', 0).attr('y', -barH)
        .attr('width', innerW).attr('height', barH)
        .attr('fill', titleBg).attr('rx', 0)
        .style('cursor','text')
        .on('click', e => { e.stopPropagation(); startTitleEdit(panel, pi, yOff + panelTop, innerH, innerW); });
      const userTitleSizeSingle = panel.appearance.titleSize || numVal('titleSize') || 16;
      const singleTitleSize = userTitleSizeSingle;
      // Reset slider max to full range when single panel (no geometry constraint)
      if (isActive) {
        ['titleSize','titleSizeNum'].forEach(id => { const el=v(id); if(el && +el.max !== 27) el.max=27; });
      }
      // When accordion mode on, reserve right side for ++ button
      const titleRightReserve = state.accordionMode ? 30 : 0;
      const titleAvailW = innerW - titleRightReserve;
      // Syne 600 char width ≈ fontSize * 0.62; find largest size that fits
      const charWPerEm = 0.62;
      const textNaturalW = titleStr.length * singleTitleSize * charWPerEm;
      const fittedTitleSize = textNaturalW > titleAvailW
        ? Math.max(8, Math.floor(titleAvailW / (titleStr.length * charWPerEm)))
        : singleTitleSize;
      // Center within the available (non-reserved) width
      const titleCx = titleAvailW / 2;
      gP.append('text').attr('x', titleCx).attr('y', -barH/2)
        .attr('dominant-baseline','middle').attr('text-anchor','middle')
        .attr('font-size', fittedTitleSize).attr('font-weight','600')
        .attr('fill', titleFg).attr('font-family',"'Syne',sans-serif")
        .attr('id',`panel-title-svg-${panel.id}`)
        .style('cursor','text').style('pointer-events','none')
        .text(titleStr);
    }

    // (Bin button moved to sidebar — SVG panels no longer have delete buttons)

    // X axis
    const xAx = gP.append('g').attr('transform',`translate(0,${innerH})`);
    xAx.call(d3.axisBottom(xScale).ticks(5).tickSize(4).tickFormat(isLast ? null : ''));
    if (isLast) xAx.selectAll('text').attr('fill','#888').attr('font-size',10).attr('font-family',"'JetBrains Mono',monospace");
    xAx.select('.domain').attr('stroke','#bbb'); xAx.selectAll('.tick line').attr('stroke','#ccc');
    xAx.style('pointer-events','none');

    // ── TOPMOST: transparent hit rect covering entire panel row ─────────────
    // Must be last so it sits on top of everything except dots/buttons
    gP.append('rect')
      .attr('x',-MARGIN_LEFT).attr('y',-panelTop)
      .attr('width', MARGIN_LEFT + innerW + 30).attr('height', panelTop + innerH + (isLast ? PANEL_BOTTOM : 0))
      .attr('fill','transparent').style('cursor','pointer')
      .lower()
      .on('click', () => setActivePanelId(panel.id));

    // Cluster drag rects + right-click / button assign
    // On inactive panels: clicking switches to that panel (no assign menu)
    if (state.clusterMode && !controls.editMode) {
      const panelIdCapture = panel.id;
      const rows = gP.append('g').selectAll('rect.dr').data(data).join('rect').attr('class','dr')
        .attr('x', -MARGIN_LEFT + CLUSTER_STRIP_W + 2).attr('y', d => yScale(d.term_name))
        .attr('width', MARGIN_LEFT - CLUSTER_STRIP_W - 2 + innerW).attr('height', yScale.bandwidth())
        .attr('fill','transparent')
        .style('cursor', isActive ? 'pointer' : 'default')
        .on('click', function(event, d) {
          event.stopPropagation();
          if (!isActive) {
            setActivePanelId(panelIdCapture);
            return;
          }
          showAssignMenu(d.term_name, event.clientX, event.clientY);
        })
        .on('contextmenu', function(event, d) {
          event.preventDefault(); event.stopPropagation();
          if (!isActive) { setActivePanelId(panelIdCapture); return; }
          showAssignMenu(d.term_name, event.clientX, event.clientY);
        });
      if (isActive) attachClusterDrag(rows);
    }
  });

  // Shared X axis label — single panel gets extra offset to clear tick numbers
  const lastLayout = panelLayouts[state.panels.length-1];
  const lastYOff   = panelYOffsets[state.panels.length-1];
  const xLabelExtraY = state.panels.length === 1 ? 10 : 0;
  svg.append('text')
    .attr('x', MARGIN_LEFT + innerW/2).attr('y', lastYOff + lastLayout.innerH + PANEL_BOTTOM + 14 + xLabelExtraY)
    .attr('text-anchor','middle').attr('font-size',12).attr('fill','#888')
    .attr('font-family',"'JetBrains Mono',monospace").text('-log\u2081\u2080(p_adj)');
  // Extend totalH if single panel to fit extra label offset
  // (totalH already has 30px buffer, so 10px extra is fine)

  // ── Gene matrix (accordion) — single unified matrix across all panels ──────────
  let _stickyRowData = [];  // hoisted for sticky header use
  if (state.accordionMode && openTermKeys.size > 0) {
    const CELL_SZ  = 13, MAT_GAP = 8, MAT_PAD = 6, CELL_GAP = 3, btnColW = 24;

    // Collect ALL open terms across ALL panels in visual order
    const allOpenRows = [];
    state.panels.forEach((panel, pi) => {
      if (!panel.rawData.length) return;
      const data = getPanelData(panel);
      data.forEach(d => {
        if (openTermKeys.has(panel.id + '::' + d.term_name))
          allOpenRows.push({ panel, pi, d });
      });
    });

    if (allOpenRows.length > 0) {
      // Union of genes across all open rows, preserving insertion order
      const geneUnion = new Set();
      allOpenRows.forEach(({ d }) => (d.genes || []).forEach(g => geneUnion.add(g)));
      const genes = [...geneUnion];

      const matX = MARGIN_LEFT + innerW + (multiPanel ? TITLE_BAR_W : 0) + btnColW + MAT_GAP;
      const matW = MAT_PAD * 2 + genes.length * (CELL_SZ + CELL_GAP);
      const gMat = svg.append('g').attr('class','gene-matrix');

      // Gene column headers: vertical text above plot (overflow:visible handles SVG bounds)
      const firstTop = panelYOffsets[0] + PANEL_TOP;
      const GENE_LABEL_H = 90;
      genes.forEach((gene, gi) => {
        const tcx = matX + MAT_PAD + gi * (CELL_SZ + CELL_GAP) + CELL_SZ / 2;
        // Rotate -90° around (tcx, firstTop-6): with text-anchor:start the first letter
        // sits just above the cell top border and text runs upward — same as original.
        // midY is no longer needed for start-anchored text.
        gMat.append('text')
          .attr('x', tcx + 3).attr('y', firstTop - 6 + CELL_SZ / 2 - 3)
          .attr('text-anchor', 'start')
          .attr('transform', `rotate(-90,${tcx},${firstTop - 6})`)
          .attr('font-size', 11).attr('font-family', "'JetBrains Mono',monospace")
          .attr('fill', '#555')
          .text(gene);
      });

      // One row per open term
      let lastCellBot = firstTop;  // track bottom of last cell for border
      allOpenRows.forEach(({ panel, pi, d }) => {
        const { innerH, terms: matTerms } = panelLayouts[pi];
        const yOff     = panelYOffsets[pi];
        const panelTop = pi === 0 ? PANEL_TOP : ICON_TOP;
        const yScale   = d3.scaleBand().domain(matTerms).range([0, innerH]).padding(0.28);
        const cy = yScale(d.term_name);
        if (cy === undefined) return;
        const rowY = yOff + panelTop + cy;
        const rowH = yScale.bandwidth();
        lastCellBot = Math.max(lastCellBot, rowY + rowH);
        const cl   = getTermCluster(d.term_name, panel);
        const cc   = (cl && cl.id !== 0) ? cl.color : '#90caf9';
        // Capture for sticky header (cc must be declared first)
        const _gr = d.query_size > 0 ? (d.intersection_size / d.query_size) : 0;
        _stickyRowData.push({ rowY, rowH, gr: _gr, fe: d['log2(Fold_Enrichment)'] || 0, cc, term: d.term_name });
        const geneSet = new Set(d.genes || []);

        // Dashed connector: dot → gap for - button → gene matrix
        // Draw BEFORE cells so it renders under the + button
        const connectorOp = d._hidden ? 0.06 : 0.4;  // dim connector for hidden rows
        const dotX = MARGIN_LEFT + xScale(d['-log10(padj)']);
        const dotY = yOff + panelTop + yScale(d.term_name) + yScale.bandwidth() / 2;
        const lineEndX = matX + MAT_PAD - 2;
        // - button occupies MARGIN_LEFT + innerW + 6  to  MARGIN_LEFT + innerW + 6 + 16
        const btnStartX = MARGIN_LEFT + innerW + 6;
        const btnEndX   = btnStartX + 16 + 2;  // +2 gap after button
        // Segment 1: dot → just before button
        if (dotX < btnStartX - 2) {
          gMat.insert('line', ':first-child')
            .attr('x1', dotX).attr('y1', dotY)
            .attr('x2', btnStartX - 2).attr('y2', dotY)
            .attr('stroke', cc).attr('stroke-width', 1)
            .attr('stroke-dasharray','3,2').attr('opacity', connectorOp);
        }
        // Segment 2: just after button → matrix
        if (btnEndX < lineEndX) {
          gMat.insert('line', ':first-child')
            .attr('x1', btnEndX).attr('y1', dotY)
            .attr('x2', lineEndX).attr('y2', dotY)
            .attr('stroke', cc).attr('stroke-width', 1)
            .attr('stroke-dasharray','3,2').attr('opacity', connectorOp);
        }

        // Gene cells — dim to match dot opacity when term is hidden in edit mode
        const rowDim = d._hidden ? 0.15 : 1;
        genes.forEach((gene, gi) => {
          const cx = matX + MAT_PAD + gi * (CELL_SZ + CELL_GAP);
          const present = geneSet.has(gene);
          const cellRect = gMat.append('rect')
            .attr('x', cx).attr('y', rowY + (rowH - CELL_SZ) / 2)
            .attr('width', CELL_SZ).attr('height', CELL_SZ).attr('rx', 2)
            .attr('fill', present ? cc : '#f0f0f0')
            .attr('opacity', rowDim * (present ? 0.82 : 1))
            .attr('stroke', present ? 'none' : '#e0e0e0').attr('stroke-width', 0.5)
            .style('cursor', 'default');
          cellRect
            .on('mouseenter', function() {
              gMat.selectAll('.gene-tip').remove();
              const bx = +d3.select(this).attr('x'), by = +d3.select(this).attr('y');
              const tipG = gMat.append('g').attr('class','gene-tip');
              const tt = tipG.append('text')
                .attr('x', bx + CELL_SZ/2).attr('y', by - 3)
                .attr('text-anchor','middle').attr('font-size',11)
                .attr('font-family',"'JetBrains Mono',monospace")
                .attr('fill','#333').attr('pointer-events','none')
                .text(gene);
              // Background rect
              const bb = tt.node().getBBox();
              tipG.insert('rect','text')
                .attr('x', bb.x-2).attr('y', bb.y-1)
                .attr('width', bb.width+4).attr('height', bb.height+2)
                .attr('fill','white').attr('stroke','#ddd').attr('stroke-width',0.5).attr('rx',2)
                .attr('pointer-events','none');
            })
            .on('mouseleave', function() { gMat.selectAll('.gene-tip').remove(); });
        });
        // Copy button + dashed connector, right of matrix border
        const copyBtnSize = Math.max(rowH - 2, 14);
        const copyBtnX = matX + matW + MAT_PAD + 8;
        const copyBtnY = rowY + (rowH - copyBtnSize) / 2;
        const geneListStr = (d.genes || []).join(', ');
        const copyFo = gMat.append('foreignObject')
          .attr('x', copyBtnX).attr('y', copyBtnY)
          .attr('width', copyBtnSize).attr('height', copyBtnSize);
        copyFo.append('xhtml:div').attr('class','mat-copy-btn')
          .attr('title', 'Copy gene list: ' + geneListStr)
          .html('&#x2398;')
          .on('click', function(e) {
            e.stopPropagation();
            navigator.clipboard.writeText(geneListStr).then(() => {
              this.classList.add('copied'); this.innerHTML = '&#x2713;';
              setTimeout(() => { this.classList.remove('copied'); this.innerHTML = '&#x2398;'; }, 1200);
            }).catch(() => {
              this.innerHTML = '&#x2715;'; setTimeout(() => { this.innerHTML = '&#x2398;'; }, 900);
            });
          });
      });

      // Matrix border: from first panel top to last panel plot bottom
      const matBorderTop = firstTop;
      const matBorderBot = lastCellBot + 4;

      // Border rect first (spine drawn on top of it after)
      gMat.append('rect')
        .attr('x', matX - MAT_PAD).attr('y', matBorderTop)
        .attr('width', matW + MAT_PAD * 2).attr('height', matBorderBot - matBorderTop)
        .attr('fill','none').attr('stroke','#e0e0e0').attr('stroke-width',1).attr('rx',3);

      // (copy button spine removed)
    }
  }

  // ── Legend: right side normally; horizontal at bottom when gene matrix open ──
  const legendSc  = parseFloat(v('legendScale')?.value || 1);
  const leg  = svg.append('g').attr('class','legend');
  const defs = svg.append('defs');
  const gradId = 'cg-shared';
  const grad = defs.append('linearGradient').attr('id', gradId);
  grad.append('stop').attr('offset','0%').attr('stop-color', sharedColorLow);
  grad.append('stop').attr('offset','100%').attr('stop-color', sharedColorHigh);

  const sizeTitle = sharedSizeMode==='percentage' ? 'Gene Ratio (%)' : 'Gene Hits';
  const allSizeData = [];
  loaded.forEach(p => { allSizeData.push(...getPanelData(p)); });
  if (sharedSizeMode==='percentage') allSizeData.forEach(d=>{d._size=Math.max((d.intersection_size/d.query_size)*100,1);});
  else allSizeData.forEach(d=>{d._size=d.intersection_size;});
  const uniqueSizesAll = [...new Set(allSizeData.map(d=>d._size))].sort((a,b)=>a-b);
  const breaks = uniqueSizesAll.length<=5 ? uniqueSizesAll
    : [0,1,2,3,4].map(i=>uniqueSizesAll[Math.round(i*(uniqueSizesAll.length-1)/4)]);
  const hasSubOne = sharedSizeMode==='percentage' && allSizeData.some(d=>d._size<1);
  const legFontSz = 10.5*legendSc, legTickSz = 9.5*legendSc, legRowH = 16*legendSc;
  const allPanelsH = lastYOff + lastLayout.innerH;

  if (geneMatActive) {
    // ── Legend: above plot, right-aligned to lollipop right border ──
    grad.attr('x1','0%').attr('y1','0%').attr('x2','100%').attr('y2','0%');
    const cbW = 100*legendSc, cbH = 10*legendSc;

    // SVG viewBox starts at y=-geneLabelPad. The gene label band is y=-geneLabelPad..0.
    // Plot separator is at y=0 in this coordinate space (PANEL_TOP offset handled by panelYOffsets).
    // Place legend so tick label bottoms sit 3px above y=0.
    const legBotY  = -3;                        // bottom of tick labels in SVG coords
    const legBaseY = legBotY - (7 + cbH + 11); // title baseline (28px above legBotY)

    // Right edge of colorbar aligned with right border of lollipop plot
    const plotRightX = MARGIN_LEFT + innerW;
    const cbX = plotRightX - cbW;

    // Gene Ratio dots: place to the left of cbX, tighter spacing
    // Build right-to-left so last dot ends at cbX - gap
    const dotGap = 8;   // gap between dot section and colorbar
    let dotX = cbX - dotGap;
    // compute dot positions right-to-left first
    const dotSlots = [];
    [...breaks].reverse().forEach(sz => {
      const r = Math.max(sharedRScale(sz)*legendSc, 1.5);
      dotX -= Math.max(r * 2 + 20, 38);   // original spacing
      dotSlots.unshift({ sz, r, cx: dotX + r });
    });

    // Gene Ratio title: centered over all dots
    const grMidX = dotSlots.length
      ? (dotSlots[0].cx - dotSlots[0].r + dotSlots[dotSlots.length-1].cx + dotSlots[dotSlots.length-1].r) / 2
      : cbX - 120;
    leg.append('text').attr('x', grMidX).attr('y', legBaseY)
      .attr('font-size', legFontSz).attr('font-weight','600').attr('fill','#777')
      .attr('text-anchor','middle')
      .attr('font-family',"'JetBrains Mono',monospace").text(sizeTitle);

    dotSlots.forEach(({ sz, r, cx }) => {
      const lbl = sharedSizeMode==='percentage'
        ? (sz<=1&&hasSubOne?'<1%':d3.format('.1f')(sz)+'%') : Math.round(sz).toString();
      leg.append('circle').attr('cx', cx).attr('cy', legBaseY+17)
        .attr('r',r).attr('fill','#aaa').attr('stroke','white').attr('stroke-width',1);
      leg.append('text').attr('x', cx).attr('y', legBaseY+17+r+9)
        .attr('text-anchor','middle').attr('font-size', legTickSz)
        .attr('fill','#aaa').attr('font-family',"'JetBrains Mono',monospace").text(lbl);
    });

    // log2FE colorbar
    leg.append('text').attr('x', cbX + cbW/2).attr('y', legBaseY)
      .attr('font-size', legFontSz).attr('font-weight','600').attr('fill','#777')
      .attr('text-anchor','middle')
      .attr('font-family',"'JetBrains Mono',monospace").text('log₂(FE)');
    leg.append('rect').attr('x',cbX).attr('y', legBaseY+7)
      .attr('width',cbW).attr('height',cbH).attr('rx',2).attr('fill',`url(#${gradId})`);
    for (let i=0; i<=4; i++) {
      const val = globalFeMin+(globalFeMax-globalFeMin)*(i/4);
      const tx  = cbX+cbW*(i/4);
      leg.append('line').attr('x1',tx).attr('x2',tx)
        .attr('y1',legBaseY+7+cbH).attr('y2',legBaseY+7+cbH+3)
        .attr('stroke','#ccc').attr('stroke-width',1);
      leg.append('text').attr('x',tx).attr('y',legBaseY+7+cbH+11)
        .attr('text-anchor','middle').attr('font-size',legTickSz)
        .attr('fill','#aaa').attr('font-family',"'JetBrains Mono',monospace")
        .text(d3.format('.1f')(val));
    }
  } else {
    // ── Legend: right-side vertical when gene matrix closed ──
    grad.attr('x1','0%').attr('y1','100%').attr('x2','0%').attr('y2','0%');
    const lx = MARGIN_LEFT+innerW+50;
    const gradH = 90*legendSc, gradW = 12*legendSc;
    const legTotalEst = legFontSz+breaks.length*legRowH+20+legFontSz+14+gradH+20;
    let legY = Math.max(20, (allPanelsH-legTotalEst)/2);
    leg.append('text').attr('x',lx).attr('y',legY).attr('font-size',legFontSz).attr('font-weight','600')
      .attr('fill','#555').attr('font-family',"'JetBrains Mono',monospace").text(sizeTitle);
    legY += legFontSz+5;
    breaks.forEach(sz => {
      const r = Math.max(sharedRScale(sz)*legendSc, 1.5);
      leg.append('circle').attr('cx',lx+8*legendSc).attr('cy',legY).attr('r',r)
        .attr('fill','#aaa').attr('stroke','white').attr('stroke-width',1);
      const lbl = sharedSizeMode==='percentage'
        ? (sz<=1&&hasSubOne?'<1%':d3.format('.1f')(sz)+'%') : Math.round(sz).toString();
      leg.append('text').attr('x',lx+8*legendSc+r+5).attr('y',legY)
        .attr('dominant-baseline','middle').attr('font-size',legTickSz)
        .attr('fill','#888').attr('font-family',"'JetBrains Mono',monospace").text(lbl);
      legY += Math.max(r*2+5, legRowH);
    });
    legY += 12*legendSc;
    leg.append('text').attr('x',lx).attr('y',legY).attr('font-size',legFontSz).attr('font-weight','600')
      .attr('fill','#555').attr('font-family',"'JetBrains Mono',monospace").text('log₂(FE)');
    legY += legFontSz+4;
    leg.append('rect').attr('x',lx).attr('y',legY).attr('width',gradW).attr('height',gradH)
      .attr('rx',3).attr('fill',`url(#${gradId})`);
    for (let i=0;i<=5;i++) {
      const val=globalFeMin+(globalFeMax-globalFeMin)*(i/5), ty=legY+gradH-(gradH*i/5);
      leg.append('line').attr('x1',lx+gradW).attr('x2',lx+gradW+4*legendSc)
        .attr('y1',ty).attr('y2',ty).attr('stroke','#ccc').attr('stroke-width',1);
      leg.append('text').attr('x',lx+gradW+6*legendSc).attr('y',ty)
        .attr('dominant-baseline','middle').attr('font-size',legTickSz)
        .attr('fill','#888').attr('font-family',"'JetBrains Mono',monospace")
        .text(d3.format('.1f')(val));
    }
  }
  // ── Sticky gene header: built AFTER legend so legend is clonable ──
  const _firstTop = panelYOffsets[0] + PANEL_TOP;
  const _matX = geneMatActive ? (MARGIN_LEFT + innerW + (state.panels.length > 1 ? 22 : 0) + 24 + 8) : 0;
  updateStickyGeneHeader(geneMatActive, totalW, geneLabelPad, _firstTop, _stickyRowData, _matX);

  // ── Sticky term column: built after all panels rendered ──
  // Pass all the layout info needed to reconstruct the left column
  updateStickyTermColumn({
    MARGIN_LEFT, innerW, totalH, geneLabelPad, panelYOffsets, panelLayouts,
    PANEL_TOP, ICON_TOP, CLUSTER_STRIP_W, cbReserve, cbSize, cbPad,
    xScale, sharedRScale, globalFeMin, globalFeMax, sharedSizeMode,
    svgPad: 4
  });

  // Drop zones layer cleared (no per-panel empty zones needed)
  v('drop-zones-layer').innerHTML = '';
}
