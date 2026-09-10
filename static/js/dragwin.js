/* Draggable popup windows - active only in the Glass theme.
   Lets the user move popups freely inside the window:
   - modal boxes (#detailModal, #sitesModal, #libEditModal, #wizardModal)
     are dragged by their header bar,
   - the options sheet (#menuPanel) is dragged from any non-interactive
     spot.
   The theme check happens at pointer-down time, so this follows theme
   switches from the picker without re-init. Pure pointer events - no
   dependency on the app's state. */
export function enableDraggablePopups() {
  const isDomeTheme = () =>
    document.documentElement.getAttribute("data-theme") === "dome";

  /* Clamp an inline position so the popup stays grabbable: at least 120 px of
     it visible horizontally, and its header row (40 px) reachable vertically.
     Uses the element's real size, so a wide modal cannot be parked almost
     entirely off-screen. */
  function clampPos(el, x, y) {
    const w = el.offsetWidth;
    const minX = Math.min(0, 120 - w);
    const maxX = Math.max(minX, window.innerWidth - 120);
    const minY = 4, maxY = Math.max(minY, window.innerHeight - 40);
    return [Math.max(minX, Math.min(maxX, x)),
            Math.max(minY, Math.min(maxY, y))];
  }

  /* ---- generic drag controller ---- */
  function attachDrag(el, shouldStart) {
    let dragging = false;
    let offX = 0, offY = 0;

    const grab = (e) => {
      if (!isDomeTheme()) return;
      if (e.button !== undefined && e.button !== 0) return; // left only
      if (!shouldStart(e)) return;
      if (e.target.closest && e.target.closest("button, input, select, a, textarea"))
        return; // never hijack interactive controls
      const r = el.getBoundingClientRect();
      el.style.position = "fixed";
      el.style.left = r.left + "px";
      el.style.top = r.top + "px";
      el.style.transform = "none"; // neutralise the sheet's centering
      el.style.margin = "0";
      el.style.right = "auto";
      el.style.bottom = "auto";
      offX = e.clientX - r.left;
      offY = e.clientY - r.top;
      dragging = true;
      if (el.setPointerCapture) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
      e.preventDefault();
    };

    const move = (e) => {
      if (!dragging) return;
      const [x, y] = clampPos(el, e.clientX - offX, e.clientY - offY);
      el.style.left = x + "px";
      el.style.top = y + "px";
      e.preventDefault();
    };

    const release = () => { dragging = false; };

    el.addEventListener("pointerdown", grab);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
  }

  /* ---- modal boxes: header is the handle ---- */
  const modals = () => document.querySelectorAll(".modal .modal-box");
  modals().forEach((box) => {
    const header = box.querySelector(":scope > header");
    if (header) attachDrag(box, (e) => header.contains(e.target));
  });

  /* keep modals draggable if the DOM is rebuilt (they are static, but
     the wizard body is rebuilt - the box itself stays) */
  const mo = new MutationObserver(() => {
    modals().forEach((box) => {
      if (box.__apDrag) return;
      box.__apDrag = true;
      const header = box.querySelector(":scope > header");
      if (header) attachDrag(box, (e) => header.contains(e.target));
    });
  });
  mo.observe(document.body, { childList: true, subtree: false });

  /* ---- options sheet: drag from non-interactive spots ---- */
  const sheet = () => document.querySelector("#menuPanel");
  const s = sheet();
  if (s) {
    s.__apDrag = true;
    attachDrag(s, (e) =>
      !e.target.closest("button, input, select, a, textarea, label")
    );
  }

  /* shrinking/maximising the window must not strand a dragged popup
     off-screen with no handle left to grab */
  window.addEventListener("resize", () => {
    document.querySelectorAll("#menuPanel, .modal .modal-box").forEach((el) => {
      if (!el.style.left) return;            // never dragged - CSS still owns it
      const [x, y] = clampPos(el, parseFloat(el.style.left) || 0,
                              parseFloat(el.style.top) || 0);
      el.style.left = x + "px";
      el.style.top = y + "px";
    });
  });
}

/* wire-up hook for main.js */
export function initDragWindows() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", enableDraggablePopups, { once: true });
  } else {
    enableDraggablePopups();
  }

  /* when the theme changes, drop any inline drag positions so a
     popup dragged in one theme does not leak into another (e.g. a
     Glass drag must not sit stranded off-centre in Default) */
  const resetInline = () => {
    document.querySelectorAll("#menuPanel, .modal .modal-box").forEach((el) => {
      el.style.removeProperty("left");
      el.style.removeProperty("top");
      el.style.removeProperty("right");
      el.style.removeProperty("bottom");
      el.style.removeProperty("margin");
      el.style.removeProperty("transform");
      el.style.removeProperty("position");
    });
  };
  new MutationObserver(resetInline).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
}