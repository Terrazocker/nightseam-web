# Future astronomy/forecast scope proposal

October 7, 2026. These backlog entries are product decisions, not implemented
features. This pass defines a concrete starting scope while the owner decides
whether to commission new features separately. No new external requests, CSP
allowlist, astronomy formulas or forecast claims have been added.

## Moving targets

Recommended first slice: seven observable planets (Mercury, Venus, Mars, Jupiter,
Saturn, Uranus, Neptune), separate from fixed deep-sky Catalog IDs and ranking.
Retain the existing Sun/Moon implementation and authority. Then consider selected
comets/asteroids by unambiguous source ID, not an unbounded moving-object import.

JPL Horizons is the proposed reference/observer-ephemeris source. It exposes
observer tables, explicit timescales and site coordinates. Validate any chosen
implementation against that authority across sites/dates, including meridian/
horizon boundaries. Browser API compatibility, terms/usage limits, privacy and
service failures must be verified before introducing it as a live dependency.
Reference: [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).

Before implementation, approve date coverage and accuracy targets, local vs
online computation, permitted coordinate sharing and data freshness/cache policy.
Out-of-range/expired ephemerides must show unavailable rather than extrapolate
silently. Preserve site-zone/selected-time truth and shared panorama visibility;
do not treat changing positions as permanent J2000 catalog coordinates. Revisit
elevation deliberately if a new observer model uses height; current planning
keeps elevation as metadata. Backup/schema changes need staged/rollback-safe
compatibility. First acceptance should cover controlled fixtures, live provider
failure, expired data, selected-time movement and published reference comparisons.

## Seeing

Current Open-Meteo weather remains optional with its documented coordinate/timezone
requests. Cloud/wind/humidity forecasts are weather conditions, not a validated
angular seeing forecast. Do not relabel them as seeing or derive invented arcsecond
precision. Reference: [Open-Meteo weather documentation](https://open-meteo.com/en/docs).

A seeing integration needs a named provider with a supported API, permitted reuse,
model/unit/coverage descriptions, refresh limits, terms/cost and error behavior.
No such provider/account/key is selected. Recommend keeping weather as-is until
those requirements and the owner's desired observing use are decided. Any future
provider stays opt-in, discloses coordinate sharing, reports forecast age/source
and does not block planning when unavailable.

## Offline reopening

Keep the truthful current limit: an already loaded tab can plan with available
data; reopening offline is not guaranteed. A separate offline feature would need
a service-worker update policy, complete asset/catalog pairing, explicit storage
limits and tests for interrupted updates/rollback. It is not part of startup
compression or ordinary cache headers and is not implemented in this pass.
