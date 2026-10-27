// clustering/manual-ui.js: Manual clustering UI: cluster bar, assign menu, drag and drop of terms.
import { getPanelClusters, getTermCluster, setUserClusters, syncClusterDefs, userClusters } from './manual.js';
import { getPanelData } from '../pipeline.js';
import { render, renderAll } from '../plot/render.js';
import { CLUSTER_PALETTE, PANEL_COLORS, activePanel, controls, state } from '../state.js';
import { updateResetBtn } from '../ui/header.js';
import { v } from '../utils.js';

export function toggleClusterPills() {
  const bar = v('cluster-bar');
  if (!bar) return;
  bar.classList.toggle('pills-collapsed');
  const lbl = v('cb-toggle-label');
  if (lbl) lbl.textContent = bar.classList.contains('pills-collapsed') ? 'Show Clusters' : 'Hide Clusters';
}

export function toggleClusterMode() {
  if (!state.panels.some(p=>p.rawData.length)) return;
  state.clusterMode = !state.clusterMode;
  v('clusterModeBtn').classList.toggle('active', state.clusterMode);
  const pibCluster = v('pib-cluster'); if(pibCluster) pibCluster.classList.toggle('active', state.clusterMode);
  updateResetBtn();
  // Exit edit mode when entering cluster mode — they use the same UI space and conflict
  if (state.clusterMode && controls.editMode) {
    controls.editMode = false;
    const editBtn = v('editModeBtn'); if (editBtn) { editBtn.classList.remove('active'); editBtn.textContent = '✎ Edit Visible Terms'; }
    const pibEdit = v('pib-edit'); if (pibEdit) pibEdit.classList.remove('active');
    v('edit-bar').classList.remove('open');
  }

  if (state.clusterMode) {
    // Seed clusters for ALL panels that don't have them yet
    state.clusterCounter = 3;  // 0=Ungrouped(reserved), 1=Cluster1, 2=Cluster2
    state.panels.forEach(p => {
      if (!p.clusters || p.clusters.length === 0) {
        const visibleTerms = getPanelData(p).map(d => d.term_name);
        p.clusters = [
          { id: 0, name: 'Ungrouped', color: '#90a4ae', terms: [...visibleTerms] },
          { id: 1, name: 'Cluster 1',  color: CLUSTER_PALETTE[0], terms: [] },
          { id: 2, name: 'Cluster 2',  color: CLUSTER_PALETTE[1], terms: [] },
        ];
      }
      // Snapshot current state so Cancel can restore it
      p._clusterSnapshot = JSON.parse(JSON.stringify(p.clusters));
    });
    v('cluster-bar').classList.add('open');
    renderClusterBar();
  } else {
    v('cluster-bar').classList.remove('open');
  }
  render();
}

export function addCluster() {
  const idx = state.clusterCounter % CLUSTER_PALETTE.length;
  const color = CLUSTER_PALETTE[idx];
  const newId = state.clusterCounter++;
  // Use max named count across ALL panels with clusters so names stay unique globally
  const maxNamedCount = Math.max(...state.panels.map(p =>
    (p.clusters || []).filter(c => c.id !== 0).length
  ));
  const num = (isFinite(maxNamedCount) ? maxNamedCount : 0) + 1;
  // Add to ALL panels so clusters stay in sync
  state.panels.forEach(p => {
    if (p.clusters && p.clusters.length > 0) {
      p.clusters.push({ id: newId, name: `Cluster ${num}`, color, terms: [] });
    }
  });
  syncClusterDefs();
  renderClusterBar();
  render();
  return newId;
}

export function deleteCluster(id) {
  if (id === 0) return;  // never delete Ungrouped
  // Remove cluster from all panels; move its terms to that panel's Ungrouped
  state.panels.forEach(p => {
    if (!p.clusters) return;
    const cl = p.clusters.find(c => c.id === id);
    if (!cl) return;
    const ungrouped = p.clusters.find(c => c.id === 0);
    if (ungrouped) ungrouped.terms.push(...cl.terms);
    p.clusters = p.clusters.filter(c => c.id !== id);
  });
  renderClusterBar();
  renderAll();
}

export function renameCluster(id, newName) {
  const cl = userClusters().find(c => c.id === id);
  if (!cl || cl.name === newName) return;
  cl.name = newName;
  // Use setTimeout to avoid blur-triggered DOM removal error
  setTimeout(() => { renderClusterBar(); render(); }, 0);
}

export function cycleClusterColor(id) {
  const cl = userClusters().find(c => c.id === id);
  if (!cl) return;
  const idx = (CLUSTER_PALETTE.indexOf(cl.color) + 1) % CLUSTER_PALETTE.length;
  cl.color = CLUSTER_PALETTE[idx];
  renderClusterBar();
  renderAll();
}

export function moveTermToCluster(termName, toClusterId) {
  const ap = activePanel(); if (!ap) return;
  userClusters().forEach(c => { c.terms = c.terms.filter(t => t !== termName); });
  const target = userClusters().find(c => c.id === toClusterId);
  if (target) target.terms.unshift(termName);
  // Only move cluster to top when it receives its FIRST term (was empty before)
  // Never reorder Ungrouped (id=0), and never reorder if cluster already had terms
  if (target && target.id !== 0 && target.terms.length === 1) {
    const clusters = getPanelClusters(ap);
    const ungrouped = clusters.filter(c => c.id === 0);
    const others = clusters.filter(c => c.id !== 0 && c.id !== target.id);
    ap.clusters = [target, ...others, ...ungrouped];
  }
  hideAssignMenu();
  renderClusterBar();
  renderAll();
}

export function renderClusterBar() {
  const row = v('cluster-pills-row');
  if (!row) return;
  row.innerHTML = '';
  // Update centered panel name
  const ptag = v('cb-panel-tag');
  if (ptag) {
    const p = activePanel();
    const pi = p ? state.panels.findIndex(pp => pp.id === p.id) : -1;
    const color = pi >= 0 ? PANEL_COLORS[pi % PANEL_COLORS.length] : '#5c35b8';
    const dot = state.panels.length > 1 && pi >= 0
      ? `<span style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;margin-right:6px;"></span>`
      : '';
    ptag.innerHTML = p ? `${dot}<span style="color:${color}">${p.title || 'Subplot ' + (pi+1)}</span>` : '';
  }

  userClusters().forEach(cl => {
    const pill = document.createElement('div');
    pill.className = 'cb-pill';
    pill.dataset.cid = cl.id;

    // Color swatch
    const swatch = document.createElement('div');
    swatch.className = 'cb-pill-swatch';
    swatch.style.background = cl.color;
    swatch.title = 'Click to change colour';
    swatch.onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = cl.color;
      inp.style.cssText = 'position:absolute;opacity:0;width:0;height:0;pointer-events:none;';
      document.body.appendChild(inp);
      inp.oninput = e => { cl.color = e.target.value; renderClusterBar(); renderAll(); };
      inp.onchange = () => { document.body.removeChild(inp); };
      inp.click();
    };

    // Name input
    const nameEl = document.createElement('input');
    nameEl.className = 'cb-pill-name';
    nameEl.value = cl.name;
    nameEl.placeholder = '…';
    nameEl.readOnly = cl.id === 0;  // Ungrouped is always read-only
    nameEl.title = cl.id === 0 ? 'Ungrouped — cannot be renamed' : 'Click to rename';
    // Size input using canvas — font in px to match computed style
    if (!renderClusterBar._ctx) {
      const c = document.createElement('canvas');
      renderClusterBar._ctx = c.getContext('2d');
    }
    const measureText = txt => {
      // resolve rem → px from root font size
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      renderClusterBar._ctx.font = `700 ${0.63 * rootPx}px "JetBrains Mono", monospace`;
      return renderClusterBar._ctx.measureText(txt).width;
    };
    const PILL_PAD = 14; // left(7) + right(5) padding + 2px buffer
    const updateSize = () => {
      const txt = nameEl.value || '';
      nameEl.classList.toggle('empty', txt.length === 0);
      const measured = txt.length > 0 ? txt : '…';
      const px = Math.ceil(measureText(measured)) + PILL_PAD;
      nameEl.style.width = px + 'px';
    };
    updateSize();
    nameEl.oninput = updateSize;
    nameEl.onclick = () => { if (cl.id === 0) return; nameEl.readOnly = false; nameEl.focus(); nameEl.select(); };
    nameEl.onblur = () => { if (cl.id === 0) return; nameEl.readOnly = true; const newName = nameEl.value.trim(); if (newName !== cl.name) renameCluster(cl.id, newName); updateSize(); };
    nameEl.onkeydown = e => { updateSize(); if (e.key === 'Enter') nameEl.blur(); if (e.key === 'Escape') { nameEl.value = cl.name; nameEl.blur(); } e.stopPropagation(); };

    // Count badge
    const count = document.createElement('span');
    count.className = 'cb-pill-count';
    // For Ungrouped: count only terms visible in current filtered view
    let displayCount = cl.terms.length;
    if (cl.id === 0) {
      const ap = activePanel();
      if (ap) {
        const visibleTerms = new Set(getPanelData(ap).map(d => d.term_name));
        displayCount = cl.terms.filter(t => visibleTerms.has(t)).length;
      }
    }
    count.textContent = displayCount + ' terms';

    pill.append(swatch, nameEl, count);

    // For Ungrouped: add a small "no bg" note
    if (cl.id === 0) {
      const hint = document.createElement('span');
      hint.textContent = 'no bg';
      hint.title = 'Terms in this group have no background colour in the plot';
      hint.style.cssText = 'font-size:.5rem;color:#aaa;font-family:"JetBrains Mono",monospace;padding:0 6px 0 2px;white-space:nowrap;align-self:center;cursor:help;';
      pill.appendChild(hint);
    }

    // Delete button — never on Ungrouped
    if (cl.id !== 0 && userClusters().length > 1) {
      const del = document.createElement('button');
      del.className = 'cb-pill-del';
      del.innerHTML = '\u2715';
      del.title = 'Delete — terms move to first remaining cluster';
      del.onclick = () => deleteCluster(cl.id);
      pill.append(del);
    }

    // Drag handle: drag pill left/right to reorder clusters
    if (true) {
      pill.draggable = true;
      pill.style.cursor = 'grab';
      pill.addEventListener('dragstart', e => {
        if (state.dragSrcTerm) { e.preventDefault(); return; } // don't interfere with term drag
        e.dataTransfer.setData('text/plain', cl.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => pill.style.opacity = '0.4', 0);
      });
      pill.addEventListener('dragend', () => { pill.style.opacity = ''; });
      pill.addEventListener('dragover', e => {
        if (!state.dragSrcTerm && e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault(); pill.style.outline = '2px dashed #7c83fd';
        } else if (state.dragSrcTerm) {
          e.preventDefault(); pill.classList.add('drag-target'); state.dragHoverPill = cl.id;
        }
      });
      pill.addEventListener('dragleave', () => { pill.style.outline = ''; pill.classList.remove('drag-target'); });
      pill.addEventListener('drop', e => {
        pill.style.outline = ''; pill.classList.remove('drag-target');
        if (state.dragSrcTerm) { moveTermToCluster(state.dragSrcTerm, cl.id); return; }
        const fromId = parseInt(e.dataTransfer.getData('text/plain'));
        if (isNaN(fromId) || fromId === cl.id) return;
        e.preventDefault();
        const fromIdx = userClusters().findIndex(c => c.id === fromId);
        const toIdx   = userClusters().findIndex(c => c.id === cl.id);
        if (fromIdx < 0 || toIdx < 0) return;
        const uc = userClusters(); const [moved] = uc.splice(fromIdx, 1);
        uc.splice(toIdx, 0, moved);
        renderClusterBar(); renderAll();
      });
    // all pills accept term drops (handled in drop handler below)
    pill.addEventListener('dragleave', e => { if (!pill.contains(e.relatedTarget)) { pill.classList.remove('drag-target'); if (state.dragHoverPill === cl.id) state.dragHoverPill = null; } });
    pill.addEventListener('drop', e => { e.preventDefault(); pill.classList.remove('drag-target'); if (state.dragSrcTerm) moveTermToCluster(state.dragSrcTerm, cl.id); });
    } // end draggable block

    row.appendChild(pill);
  });
}

export function applyClusterMode() {
  // Exit cluster mode, commit changes (clear snapshots)
  state.panels.forEach(p => { delete p._clusterSnapshot; });
  state.clusterMode = false;
  const cmb = v('clusterModeBtn'); if (cmb) cmb.classList.remove('active');
  const pibcl = v('pib-cluster'); if (pibcl) pibcl.classList.remove('active');
  v('cluster-bar').classList.remove('open');
  hideAssignMenu();
  updateResetBtn();
  renderAll();
}

export function clearClusterMode() {
  // Cancel: restore clusters to the snapshot taken when entering cluster mode
  state.panels.forEach(p => {
    if (p._clusterSnapshot !== undefined) {
      p.clusters = JSON.parse(JSON.stringify(p._clusterSnapshot));
      delete p._clusterSnapshot;
    }
  });
  state.clusterMode = false;
  const cmb = v('clusterModeBtn'); if (cmb) cmb.classList.remove('active');
  const pibcl = v('pib-cluster'); if (pibcl) pibcl.classList.remove('active');
  v('cluster-bar').classList.remove('open');
  hideAssignMenu();
  updateResetBtn();
  renderAll();
}

// ── SVG drag: attach D3 drag to term rows in cluster mode ──────────────────────
export function initClusters() {
  const visibleTerms = getPanelData(activePanel()).map(d => d.term_name);
  state.clusterCounter = 3;
  setUserClusters([
    { id: 0, name: 'Ungrouped', color: '#90a4ae', terms: [...visibleTerms] },
    { id: 1, name: 'Cluster 1', color: CLUSTER_PALETTE[0], terms: [] },
    { id: 2, name: 'Cluster 2', color: CLUSTER_PALETTE[1], terms: [] },
  ]);
}

export function showAssignMenu(termName, x, y) {
  const menu = v('cb-assign-menu');
  if (!menu) return;
  menu.innerHTML = '';
  userClusters().forEach(cl => {
    const current = getTermCluster(termName);
    if (current && current.id === cl.id) return;
    const item = document.createElement('div');
    item.className = 'cb-assign-item';
    const sw = document.createElement('div');
    sw.className = 'cb-assign-swatch';
    sw.style.background = cl.color;
    item.append(sw, document.createTextNode(cl.name || '—'));
    item.onclick = () => moveTermToCluster(termName, cl.id);
    menu.appendChild(item);
  });
  // "Add cluster" button at bottom
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:#2a2d35;margin:3px 4px;flex-shrink:0;';
  menu.appendChild(sep);
  const addBtn = document.createElement('div');
  addBtn.className = 'cb-assign-item cb-assign-add-btn';
  addBtn.innerHTML =
    '<span style="width:16px;height:16px;border-radius:50%;border:1.5px dashed #7c83fd;' +
    'color:#7c83fd;display:inline-flex;align-items:center;justify-content:center;' +
    'font-size:14px;line-height:1;flex-shrink:0;">+</span>' +
    '<span style="color:#7c83fd;font-weight:600;">Add cluster</span>';
  addBtn.onclick = (e) => {
    e.stopPropagation();
    const newId = addCluster();
    // Immediately assign the selected term to the newly created cluster
    moveTermToCluster(termName, newId);
    hideAssignMenu();
  };
  menu.appendChild(addBtn);

  const main = v('mainArea');
  const mr = main.getBoundingClientRect();
  let left = x - mr.left, top = y - mr.top;
  const popH = (userClusters().length + 1) * 34 + 20;
  const popW = 158;
  if (left + popW > mr.width - 8) left = mr.width - popW - 8;
  if (top + popH > mr.height - 8) top = top - popH;
  menu.style.left = Math.max(4, left) + 'px';
  menu.style.top  = Math.max(4, top)  + 'px';
  menu.style.display = 'flex';
  state.assignMenuOpen = true;
}

export function hideAssignMenu() {
  const menu = v('cb-assign-menu');
  if (menu) menu.style.display = 'none';
  state.assignMenuOpen = false;
}

export function attachClusterDrag(selection) {
  selection.call(
    d3.drag()
      .on('start', function(event, d) {
        if (!state.clusterMode) return;
        state.dragSrcTerm = d.term_name;
        d3.select(this).classed('term-row-dragging', true);
        hideAssignMenu();
      })
      .on('drag', function(event, d) {
        if (!state.clusterMode) return;
        const pills = document.querySelectorAll('.cb-pill');
        pills.forEach(pill => {
          const rect = pill.getBoundingClientRect();
          const over = event.sourceEvent.clientX >= rect.left && event.sourceEvent.clientX <= rect.right
                    && event.sourceEvent.clientY >= rect.top  && event.sourceEvent.clientY <= rect.bottom;
          const cid = parseInt(pill.dataset.cid);
          const src = getTermCluster(state.dragSrcTerm);
          pill.classList.toggle('drag-target', over && src?.id !== cid);
          if (over) state.dragHoverPill = cid;
          else if (state.dragHoverPill === cid) state.dragHoverPill = null;
        });
      })
      .on('end', function(event, d) {
        if (!state.clusterMode) return;
        d3.select(this).classed('term-row-dragging', false);
        document.querySelectorAll('.cb-pill').forEach(p => p.classList.remove('drag-target'));
        if (state.dragSrcTerm && state.dragHoverPill !== null) {
          const src = getTermCluster(state.dragSrcTerm);
          if (!src || src.id !== state.dragHoverPill) moveTermToCluster(state.dragSrcTerm, state.dragHoverPill);
        }
        state.dragSrcTerm = null; state.dragHoverPill = null;
      })
  );
}

// Close the assign menu on outside click.
export function initClusterMenuDismiss() {
  // Close assign menu when clicking outside
  document.addEventListener('click', function(e) {
    if (state.assignMenuOpen && !e.target.closest('#cb-assign-menu')) {
      hideAssignMenu();
    }
  }, true);
}
