/*
 * Meteor shower easter egg — triggered by clicking the brand logo.
 * A short full-screen canvas with a digital star field and diagonal meteors,
 * auto-fades after ~8 s; ESC or another logo click ends it early.
 * Respects prefers-reduced-motion (no animation).
 */
export function meteorShower() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('meteor-canvas')) { stop(); return; } // toggle off

  const cvs = document.createElement('canvas');
  cvs.id = 'meteor-canvas';
  cvs.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;z-index:70;pointer-events:none;' +
    'background:radial-gradient(ellipse at 50% 28%, rgba(5,12,24,.5), rgba(2,5,12,.82));' +
    'opacity:0;transition:opacity .6s;';
  document.body.appendChild(cvs);
  requestAnimationFrame(() => { cvs.style.opacity = '1'; });

  const ctx = cvs.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  let W = 0, H = 0, raf = 0, stopped = false;
  const meteors = [];
  const stars = [];
  const t0 = performance.now();
  const DURATION = 8000;

  const resize = () => {
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = W * dpr; cvs.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 70; i++) {
    stars.push({
      x: Math.random() * 1, y: Math.random() * 0.75, // normalized, re-randomized on resize
      r: 0.5 + Math.random() * 1.4, tw: Math.random() * Math.PI * 2,
    });
  }
  const spawn = () => {
    const fromLeft = Math.random() < 0.5;
    meteors.push({
      x: fromLeft ? -40 : W + 40,
      y: Math.random() * H * 0.55,
      vx: (fromLeft ? 1 : -1) * (7 + Math.random() * 9),
      vy: 3.5 + Math.random() * 5,
      life: 0,
      max: 55 + Math.random() * 50,
      len: 55 + Math.random() * 75,
    });
  };
  for (let i = 0; i < 14; i++) setTimeout(spawn, i * 80);

  const step = () => {
    if (stopped) return;
    const el = document.getElementById('meteor-canvas');
    if (!el) { stopped = true; return; }
    const now = performance.now();
    const elapsed = now - t0;
    if (elapsed < DURATION && Math.random() < 0.22) spawn();
    ctx.clearRect(0, 0, W, H);
    // digital star field
    for (const s of stars) {
      const a = 0.5 + 0.5 * Math.sin(now / 850 + s.tw);
      ctx.fillStyle = `rgba(215,232,255,${(0.2 + 0.6 * a).toFixed(2)})`;
      ctx.fillRect(s.x * W, s.y * H, s.r, s.r); // crisp pixels: digital feel
    }
    // meteors
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.x += m.vx; m.y += m.vy; m.life++;
      if (m.life > m.max || m.x < -W * 0.3 || m.x > W * 1.3 || m.y > H * 1.05) {
        meteors.splice(i, 1);
        continue;
      }
      const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * 3.5, m.y - m.vy * 3.5);
      g.addColorStop(0, 'rgba(255,255,255,.95)');
      g.addColorStop(0.22, 'rgba(150,210,255,.55)');
      g.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 3.5, m.y - m.vy * 3.5);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.95)';
      ctx.fillRect(m.x - 1, m.y - 1, 2, 2);
    }
    const fade = elapsed > DURATION ? Math.max(0, 1 - (elapsed - DURATION) / 900) : 1;
    el.style.opacity = fade.toFixed(2);
    if (elapsed < DURATION + 950) raf = requestAnimationFrame(step);
    else { el.remove(); window.removeEventListener('resize', resize); window.removeEventListener('keydown', escH); }
  };
  raf = requestAnimationFrame(step);

  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    const el = document.getElementById('meteor-canvas');
    if (el) el.remove();
    window.removeEventListener('resize', resize);
    window.removeEventListener('keydown', escH);
  }
  const escH = (ev) => { if (ev.key === 'Escape') stop(); };
  window.addEventListener('keydown', escH);
}