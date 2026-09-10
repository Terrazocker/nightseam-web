/*
 * NightSeam Web — draggable popups for the Glass (dome) theme.
 * Port of the desktop app's dragwin.js: in the Glass theme the detail /
 * settings modal and the menu sheet become movable windows.
 *
 * Rules:
 *  - Active only when <html data-theme="dome">.
 *  - Modal := #modal .modal, grabbed by its .modal-head (skip interactive).
 *  - Sheet := #menuPanel, grabbed on non-interactive spots.
 *  - First grab converts the element to position:fixed with viewport
 *    coordinates (the modal-wrap backdrop-filter and the topbar's
 *    backdrop-filter are containing blocks — fixed still resolves
 *    against the filtered box, which for the full-viewport modal-wrap
 *    is the viewport; the sheet is inside the filtered topbar, but
 *    viewport-relative left/top keep it sane).
 *  - Clamped to stay reachable; inline positions reset when the theme
 *    changes.
 */

const THEME_SEL = 'html[data-theme="dome"]';

function isDomeTheme() {
  return document.documentElement && document.documentElement.getAttribute('data-theme') === 'dome';
}

function isInteractive(el) {
  return !!el && !!el.closest('button, input, select, textarea, a, label, .close');
}

let active = null; // { el, startX, startY, origLeft, origTop, mode }

function grabTarget(e) {
  if (!isDomeTheme()) return null;
  if (!(e.target instanceof Element)) return null; // synthetic/edge events
  const head = e.target.closest('#modal .modal-head');
  if (head) {
    const modal = head.closest('.modal');
    if (!modal || isInteractive(e.target)) {
      // still allow grabbing from the header text (not from buttons/inputs)
      if (isInteractive(e.target)) return null;
    }
    return { el: modal, mode: 'modal' };
  }
  const panel = e.target.closest('#menuPanel');
  if (panel) {
    if (isInteractive(e.target)) return null;
    return { el: panel, mode: 'sheet' };
  }
  return null;
}

function onPointerDown(e) {
  const g = grabTarget(e);
  if (!g) return;
  if (e.button !== 0 && e.pointerType === 'mouse') return;
  active = { el: g.el, mode: g.mode, startX: e.clientX, startY: e.clientY,
             left: g.el.getBoundingClientRect().left, top: g.el.getBoundingClientRect().top };
  // convert to fixed on first grab so dragging is viewport-anchored
  if (g.mode === 'modal') {
    const r = g.el.getBoundingClientRect();
    g.el.style.position = 'fixed';
    g.el.style.left = r.left + 'px';
    g.el.style.top = r.top + 'px';
    g.el.style.margin = '0';
    g.el.style.transform = g.el.style.transform === 'none' ? '' : 'none';
    active.left = r.left; active.top = r.top;
  } else {
    // sheet: drop the centered transform, keep current box
    const r = g.el.getBoundingClientRect();
    g.el.style.position = 'fixed';
    g.el.style.left = r.left + 'px';
    g.el.style.top = r.top + 'px';
    g.el.style.transform = 'none';
    g.el.style.margin = '0';
    active.left = r.left; active.top = r.top;
  }
  e.preventDefault();
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(e) {
  if (!active) return;
  let x = active.left + (e.clientX - active.startX);
  let y = active.top + (e.clientY - active.startY);
  const w = active.el.offsetWidth || 200;
  const h = active.el.offsetHeight || 120;
  const minX = 8, minY = 4;
  const maxX = window.innerWidth - Math.min(w, 120) - 8;
  const maxY = window.innerHeight - Math.min(h, 40) - 4;
  x = Math.max(minX, Math.min(maxX, x));
  y = Math.max(minY, Math.min(maxY, y));
  active.el.style.left = x + 'px';
  active.el.style.top = y + 'px';
}

function onPointerUp() {
  if (!active) return;
  active = null;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
}

function resetInlinePositions() {
  document.querySelectorAll('#modal .modal, #menuPanel').forEach((el) => {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.margin = '';
    el.style.transform = '';
  });
}

let _bound = false;
function initDragWindows() {
  // reset inline positions when the theme flips (back to centered sheet etc.)
  if (!_bound) {
    _bound = true;
    const mo = new MutationObserver(() => resetInlinePositions());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('pointerdown', onPointerDown, true);
  }
}

export { initDragWindows };