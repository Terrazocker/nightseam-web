/* Night vision: a red display that keeps the observer's eyes dark-adapted.
 * A classic script in <head>, so the red filter is on before the first paint
 * and a dark-adapted eye never sees the normal colours flash. app.js owns the
 * toggle; this file only applies the stored choice. The choice belongs to the
 * device (a phone at the telescope, not the desktop at home), so it lives in
 * localStorage and is not part of backups. */
(function () {
  try {
    if (localStorage.getItem('nightseam_night_red') === '1') {
      document.documentElement.classList.add('night-red');
    }
  } catch (err) { /* storage blocked: start in normal colours */ }
}());
