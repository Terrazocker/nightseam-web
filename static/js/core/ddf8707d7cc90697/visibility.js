/*
 * NightSeam core - visibility predicates and the minimum-altitude rule (pure).
 *
 * Phase 2, concept 4. This is the ONE predicate behind every "can I see it?"
 * decision on both shells (desktop derive.js, web nightrank.js/detail loop):
 * above the minimum altitude AND above the obstruction ceiling AND below the
 * sky-mode upper ceiling (ceilTop; absent = no upper limit, like the 90.5
 * sentinel). No Python implementation is authoritative - the server ships raw
 * tracks only and the clients derive visibility.
 */

/** Selected-time sky visibility for a body (Sun, Moon or catalog object): it
 *  is a visible sky object only while its APPARENT altitude is above the
 *  horizon. The chart's Sun/Moon used to be drawn down to a fixed -6 deg
 *  (civil-twilight) floor, so they appeared below the horizon near dusk/dawn;
 *  the astronomy is the only rule. */
export function aboveHorizon(apparentAltDeg) {
  return Number.isFinite(apparentAltDeg) && apparentAltDeg > 0;
}

/** The one per-sample visibility predicate. `ceilTop` absent/undefined means
 *  "no upper ceiling" (the 90.5 sentinel the desktop uses). */
export function sampleVisible(alt, minAlt, ceil, ceilTop) {
  return alt >= minAlt && alt > ceil && alt < (ceilTop ?? 90.5);
}

/** Per-sample status. `minAlt` is passed in so the shell keeps ownership of
 *  the resolved threshold (which re-derives live on a Bortle change). */
export function statusOf(o, i, minAlt) {
  const alt = o.alt[i], ceil = o.ceil[i];
  // mirror the visibility predicate (o.vis): a sky-mode upper ceiling
  // (ceil_top) blocks ABOVE the band, exactly like a horizon obstruction
  // blocks below it - status must never say "Observable" where vis[] says no
  const top = o.ceil_top ? o.ceil_top[i] : 90.5;
  if (alt <= 0)       return { code: "hor", text: "Below horizon" };
  if (alt <= ceil || alt >= top) return { code: "blk", text: "Blocked" };
  if (alt < minAlt)   return { code: "low", text: "Too low" };
  return                 { code: "vis", text: "Observable" };
}

/** The authoritative minimum-altitude rule (shared with the server): an
 *  explicitly stored min_useful_alt wins; otherwise the Bortle-derived default
 *  17 + 2*bortle applies ("darker skies -> lower default"). The server ships
 *  the resolved value PLUS the explicit flag, so the clients re-derive the
 *  threshold live when Bortle changes instead of freezing it at boot. */
export function effectiveMinAlt(bortle, explicitMinAlt) {
  return explicitMinAlt != null ? explicitMinAlt : 17 + 2 * (bortle || 4);
}
