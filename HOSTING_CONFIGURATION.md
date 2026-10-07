# Prepared static delivery configuration

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
- Revalidate entry HTML, version.json and catalog manifests (max-age=0,
  must-revalidate). Do not cache HTML as immutable.
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
