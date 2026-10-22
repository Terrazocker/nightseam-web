# Prepared static delivery configuration

## Current status — October 13, 2026

Measured on the live v0.1.1 site with browser-like GET requests
(`Accept-Encoding: gzip, deflate, br, zstd`):

- **Compression works (HOST-DELIVERY-001 closed).** nginx answers with Brotli:
  `/` 3,292 -> 1,087 bytes, `/astro/` 15,348 -> 4,465, app.js 205,511 ->
  57,654, style.css 67,353 -> 13,719, catalog.json 5,088,280 -> 801,556,
  catalog-provenance.json 6,739,158 -> 441,764. A request offering only gzip
  gets no compression for these files, which is what the October 7
  measurements below used; browsers always offer `br`.
- **Two serving paths.** On GET, nginx serves HTML, JS, CSS and the large
  catalog files itself (nginx-style ETags, no `.htaccess` headers). HEAD
  requests and small JSON files (version.json, the manifests) are passed to
  Apache, which applies `.htaccess`: there, and only there, the CSP,
  `frame-ancestors`, `nosniff` and Referrer-Policy headers appear. So page
  loads carry no security response headers; the meta CSP in each page is
  enforced. The provider exposes neither nginx directives nor the compression
  or static-file settings, so this is a hosting limitation (BUGS.md). The
  `.htaccess` header blocks stay: they cost nothing and apply if hosting
  changes. Check headers with GET, never with `curl -I`.

Prepared release assets keep their `?v=` query, so the token-based immutable
rule below applies to them too. The live website remains v0.1.1, deployed
October 8. Local review remediation now uses immutable content-addressed
release graphs and atomic canonical-HTML switches; that new publication
workflow has not been deployed. The October 7 observations below are dated
evidence, not a claim that v0.1.0 is still the current website.

Future provider policy must also allow immutable caching for the prepared
content-addressed release namespaces while canonical entry HTML revalidates.
Verify the candidate's actual paths and GET response headers after authorized
publication; numeric-query rules alone do not establish that new policy.

## Pairing relay (PHP) — prepared October 19, 2026, not deployed

Phone pairing needs the one server script `web/relay.php`, published at
`/astro/relay.php` (DECISIONS.md, 2026-10-19; plan in
docs/horizon/HORIZON_PAIRING_PLAN.md). Checked by the owner on October 19:

- PHP 8.3 as an FPM application on Plesk, running as the subscription's
  system user, with up to 10 workers started on demand. Today it is "served
  by nginx", which bypasses `.htaccess`. Switch to **FPM application served
  by Apache** when the relay is deployed: nginx keeps serving static files and
  passes `.php` to Apache, so the `relay.php` section of `web/.htaccess`
  (`no-store`, an API CSP, every other PHP file denied) applies.
- The data folder `nightseam-relay/` sits in the webspace root next to the
  document root (`httpdocs/`), inside `open_basedir`, writable by the PHP
  user, unreachable by URL. The script derives it from `DOCUMENT_ROOT` and
  answers 503 if it is missing, not writable or inside the document root.
  The vhost name stays out of the repository.
- Imunify is active. Before deploying, run the phase 0 probe: upload
  `docs/horizon/relay_probe.php` by hand to `httpdocs/astro/`, run
  `python scripts/relay_probe.py https://nightseam.de/astro/relay_probe.php`
  under each handler, record the output in RELEASES.md and delete the probe.
  It checks writing, renaming, reading, locking and deleting in the data
  folder, that 1 KB, 60 KB and 64 KB binary POST bodies arrive unchanged, and
  that PHP sees the visitor's public address (not nginx's), which the rate
  limits need.
- After deployment, check with GET and POST (never only `curl -I`): an
  unknown box answers 404 with `Cache-Control: no-store` and the relay's
  `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, and
  `/astro/anything.php` is refused.
- How long the host keeps access logs, which record the request line with
  the box id, is stated on the privacy page (Hosting).

## Observed after authorized deployment — October 7, 2026

NightSeam Web v0.1.0 is deployed. Both entry routes and all 52 HTTP-readable
release files match decoded SHA-256 hashes; both .htaccess files also match FTPS
readback. Hosting redirects nightseam.de to www.nightseam.de. Tests cover that
actual origin, fresh/cached Wikipedia photos, credits, sources and return visits.

Live HTML/version/manifests report public,max-age=0,must-revalidate. Numeric-token
app/catalog/provenance requests report public,max-age=31536000,immutable.
Version and catalog manifests negotiate gzip with Vary:Accept-Encoding. HTML,
app.js and the two large catalog JSON payloads did not negotiate gzip in the
measured requests. Cache acceptance is complete; full text/large-payload
compression remains HOST-DELIVERY-001. The local 4.091-second compressed benchmark
is still a simulation, not a measured live performance result. FTPS access cannot
configure the provider's nginx/Plesk controls; use supported host controls/support
for this remaining setting, then remeasure the actual GET responses.

Evidence: ignored logs/deployment-0.1.0-20261007/http-verified.json and
browser-accepted.json. No provider log-policy or CDN change was made.

October 6, 2026. ZAP-Hosting/Plesk, no CDN, as confirmed by the owner. The
configured request-log policy is already recorded in Privacy and BUGS.md.
This file covers delivery performance, not a new logging-policy request.

The local planner now starts without fetching optional catalog source data.
web/.htaccess and landing/.htaccess prepare Apache compression and token-aware
caching. Apache needs mod_deflate/mod_headers and permitted FileInfo overrides.
No Apache server is available here for a native configuration syntax check.
nginx may serve static paths directly, so .htaccess is not proof of live headers.

Use Plesk's supported compression/cache controls, or ask host support to apply
the equivalent policy at the nginx layer if those controls are unavailable:

- Compress HTML, CSS, JavaScript, JSON and SVG with gzip; set Vary: Accept-Encoding.
- Revalidate entry HTML, version.json, /astro/sw.js and catalog manifests
  (max-age=0, must-revalidate). Do not cache HTML as immutable. Serve sw.js as
  JavaScript (browsers refuse other types for a service worker).
- For static assets with a numeric v query token, allow public max-age=31536000,
  immutable. Reuse a token only for identical bytes. Unversioned assets revalidate.
- Content-addressed core directories can also be immutable; preserve existing
  production hash directories for cached clients.
- Preserve the CSP, Referrer-Policy and nosniff headers. The planner's meta CSP
  remains the fallback where host response headers cannot be configured.

Reference configuration for host support (gzip directives in server/http scope;
cache mappings require http scope and should not be pasted into a location-only
Plesk field):

```nginx
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_min_length 512;
gzip_types text/plain text/css text/javascript application/javascript application/json image/svg+xml;

map "$uri:$arg_v" $nightseam_static_cache {
    default "public, max-age=0, must-revalidate";
    ~*/(version\.json|catalog\.manifest\.json|catalog-provenance\.manifest\.json): "public, max-age=0, must-revalidate";
    ~*\.(js|css|json|svg|png|jpe?g|ico|woff2?):[0-9]+$ "public, max-age=31536000, immutable";
    ~*\.(html): "public, max-age=0, must-revalidate";
}
# In the site's existing static serving locations, without replacing routing:
# add_header Cache-Control $nightseam_static_cache;
```

After separately authorized publication, inspect actual GET responses for /,
/astro/, the current app token, catalog token and provenance token. Confirm
Content-Encoding:gzip when requested, Vary:Accept-Encoding, correct Cache-Control,
correct decoded hashes, successful return visits and unchanged photo/CSP policy.
Do not purge storage or use no-store to conceal a token error. Record observed
headers and timings before marking live delivery complete.

Local simulation: python scripts/preview_site.py --port 8082 --performance.
It supplies real gzip/ETag/cache responses for acceptance/measurement, independently
of Apache/nginx. Baseline and after results live in ignored logs/remaining-work/.

Syntax/reference authority:
[Apache mod_headers](https://httpd.apache.org/docs/2.4/mod/mod_headers.html),
[Apache mod_deflate](https://httpd.apache.org/docs/2.4/mod/mod_deflate.html),
[nginx gzip module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html).
