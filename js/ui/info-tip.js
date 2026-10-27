// ui/info-tip.js: Hover tooltips for the small (i) info icons.

// Hover tooltips for .info-icon elements.
export function initInfoTips() {
  // ── Info icon tooltip ─────────────────────────────────────────────────────────
  (function() {
    const tip = document.getElementById('info-tooltip');
    document.addEventListener('mouseover', function(e) {
      const el = e.target.closest('.info-icon');
      if (!el) return;
      const text = el.getAttribute('data-tip');
      if (!text) return;
      // Support \n line breaks in tooltips
      tip.innerHTML = text.replace(/\n/g, '<br>');
      tip.classList.add('show');
      positionTip(e);
    });
    document.addEventListener('mousemove', function(e) {
      if (!tip.classList.contains('show')) return;
      positionTip(e);
    });
    document.addEventListener('mouseout', function(e) {
      if (!e.target.closest('.info-icon')) return;
      tip.classList.remove('show');
    });
    function positionTip(e) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = 220, h = 80;
      let x = e.clientX + 14;
      let y = e.clientY - 10;
      if (x + w > vw - 8) x = e.clientX - w - 8;
      if (y + h > vh - 8) y = vh - h - 8;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    }
  })();
}
