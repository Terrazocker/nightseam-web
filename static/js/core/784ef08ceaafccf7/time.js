/*
 * NightSeam core - timezone arithmetic (pure).
 *
 * Phase 2, concept 3. IANA-zone resolution uses the host's Intl database (an
 * environment capability, like Math - not DOM, storage or network); shells pass
 * instants/offsets and keep their own formatting and zone-selection state.
 *
 * Convention: offsets are minutes EAST of UTC (the API/planning convention,
 * `app/planning.local_utc` does `local - tz_min`). That is the OPPOSITE sign
 * of `Date#getTimezoneOffset()` (minutes WEST).
 */

/** Minutes EAST of UTC for an IANA zone at epoch ms (DST-aware).
 *  Parses Intl's long/short offset names ("GMT+02:00", "GMT+5:30", "GMT");
 *  returns null for an unknown/missing zone. */
export function offsetEastMin(tzName, ms) {
  if (!tzName) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, timeZoneName: 'longOffset', hour12: false,
    }).formatToParts(new Date(ms));
    const p = parts.find((x) => x.type === 'timeZoneName');
    if (!p || !p.value) return null;
    if (p.value === 'GMT' || p.value === 'UTC') return 0;
    const m = p.value.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return sign * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch { return null; }
}

/** Minutes EAST of UTC in effect at local noon of `dateStr` (YYYY-MM-DD) in
 *  `tzName`, via the installed tz database. Falls back to the machine offset
 *  when the zone is absent or the date is malformed (the desktop rule). */
export function zoneOffsetAtLocalNoon(tzName, dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number);
  if (!y || !m || !d) return -new Date().getTimezoneOffset();
  if (!tzName) return -new Date(y, m - 1, d, 12).getTimezoneOffset();
  let ms = Date.UTC(y, m - 1, d, 12);
  for (let i = 0; i < 3; i++) {
    const off = offsetEastMin(tzName, ms);
    if (off == null) return -new Date(y, m - 1, d, 12).getTimezoneOffset();
    ms = Date.UTC(y, m - 1, d, 12) + off * 60000;
  }
  const off = offsetEastMin(tzName, ms);
  return off == null ? 0 : off;
}

/** A wall-clock Date (site zone, read through browser-local getters) is the
 *  UTC instant shifted by `offsetEast + machineWest` minutes. `machineWest` is
 *  the host's `date.getTimezoneOffset()` at that instant. */
export function wallFromUtcMs(ms, offsetEast, machineWest) {
  return ms + (offsetEast + machineWest) * 60000;
}

/** Inverse of wallFromUtcMs: interpret a wall-clock Date as a UTC instant. */
export function utcFromWallMs(ms, offsetEast, machineWest) {
  return ms - (offsetEast + machineWest) * 60000;
}
