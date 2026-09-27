"""Browser checks for the packaged executable's catalog-only default shell."""

from harness import check


@check("desktop-catalog-only-launch", "catalog")
def desktop_catalog_only_launch(c):
    requests = []
    library_calls = []
    ingest_posts = []
    reindex_calls = []

    def fail_first_library(route):
        library_calls.append(route.request.url)
        if len(library_calls) == 1:
            route.fulfill(status=503, content_type="application/json",
                          body='{"detail":"temporary archive failure"}')
        else:
            route.fulfill(json={
                "image_dir": "C:/archive",
                "total_images": 2,
                "total_exposure": 3600,
                "objects": [{
                    "object_id": "ngc224", "name": "M31",
                    "designation": "NGC 224", "otype": "galaxy",
                    "ra_hours": 6, "dec_deg": 0, "size_am": 190,
                    "n_images": 2, "n_sessions": 1,
                    "total_exposure": 3600,
                    "images": [
                        {"file": "M31/20260927/lights/a.fits"},
                        {"file": "M31/20260927/lights/b.fits"},
                    ],
                    "sessions": [{
                        "undated": True, "start": None, "end": None,
                        "n_images": 2, "exposure": 3600,
                        "types": {"light": {"n": 2, "exposure": 3600}},
                        "filters": {"L": {"n": 2, "exposure": 3600}},
                    }],
                }],
            })

    def mock_ingest(route):
        ingest_posts.append(route.request.post_data or "")
        route.fulfill(json={"results": [{"file": "calibration.fits", "ok": True}]})

    def mock_reindex(route):
        reindex_calls.append(route.request.url)
        route.fulfill(json={"added": 0, "skipped": 0, "failed": 0})

    c.page.on("request", lambda request: requests.append(request.url))
    c.allow_failed_responses("one deliberate catalog Library retry response")
    c.allow_console_errors("one deliberate catalog Library retry response")
    c.page.route("**/api/library", fail_first_library)
    c.page.route("**/api/library/imports", lambda route: route.fulfill(json=[{
        "slug": "M31", "session": "20260927", "frame": "light",
        "n_files": 2, "total_exposure": 3600, "object_name": "M31",
    }]))
    c.page.route("**/api/images/ingest", mock_ingest)
    c.page.route("**/api/library/reindex", mock_reindex)
    with c.page.expect_response(
            lambda response: response.url.endswith("/api/library")
            and response.status == 503) as first_response:
        c.goto()
    c.expect_eq(first_response.value.status, 503,
                "the test must exercise an initial Library failure")
    c.page.locator("#versionTag").filter(has_text="Image Catalog").wait_for()
    planner_direct = c.page.request.get(c.url("/index.html"))
    c.expect_eq(planner_direct.status, 404,
                "catalog-only executable must not serve the planner at /index.html")
    c.expect("/js/main.js" not in planner_direct.text() and
             'data-tab="tonight"' not in planner_direct.text(),
             "direct planner route must not reveal planner markup")
    c.expect_eq(len(library_calls), 1,
                "catalog startup should make its initial Library request")

    c.expect_eq(c.page.locator("#catalogTabs [role='tab']").count(), 3,
                "the catalog shell must expose Library, Import Exposures, and Sky Map")
    for selector in ("#tabs", "#tab-tonight", "#tab-sky", "#tab-horizon",
                     "#siteSelect", "#weatherPanel", "#wizardModal"):
        c.expect_eq(c.page.locator(selector).count(), 0,
                    f"catalog-only shell unexpectedly contains {selector}")
    c.expect(c.page.locator("#tab-library").is_visible(),
             "Library should be the initial catalog view")

    c.page.locator("#catalog-tab-import").click()
    c.expect(c.page.locator("#tab-import").is_visible(),
             "the FITS import and reindex view should remain available")
    for selector in ("#btnIngest", "#btnArcReindex", "#fitFilesCal",
                     "#importHistory"):
        c.expect_eq(c.page.locator(selector).count(), 1,
                    f"the archive import workflow is missing {selector}")
    c.expect("Recent imports" in c.page.locator("#tab-import").inner_text(),
             "recent session imports should remain available")
    c.page.locator("#catalog-tab-skymap").click()
    c.expect(c.page.locator("#tab-skymap").is_visible(),
             "the fixed library Sky Map should remain available")

    c.page.locator("#catalog-tab-import").click()
    with c.page.expect_response(
            lambda response: response.url.endswith("/api/library")
            and response.status == 200) as retry_response:
        c.page.locator("#catalog-tab-library").click()
    c.expect_eq(retry_response.value.status, 200,
                "returning to Library should retry the failed request")
    c.expect_eq(len(library_calls), 2,
                "Library selection should issue exactly one retry")
    c.page.locator("#libraryObjectList .library-object").filter(
        has_text="M31").wait_for()
    c.page.locator("#versionTag").filter(has_text="NightSeam v").wait_for()
    version_text = c.page.locator("#versionTag").inner_text()
    c.expect(version_text.startswith("NightSeam v") and
             "Image Catalog" in version_text,
             "a recovered Library load should restore the versioned catalog tag")
    c.page.locator("#librarySessions tr.library-session").wait_for()
    c.expect("+ Darks" in c.page.locator("#librarySessionActions").inner_text(),
             "a retried Library load should restore its selected-session actions")

    c.page.evaluate("""() => {
      const nativeClick = HTMLInputElement.prototype.click;
      window.__ns_file_inputs_clicked = [];
      HTMLInputElement.prototype.click = function() {
        if (this.id === 'fitFiles' || this.id === 'fitFilesCal') {
          window.__ns_file_inputs_clicked.push(this.id);
          return;
        }
        return nativeClick.call(this);
      };
    }""")

    c.page.locator("#librarySessionActions [data-library-add='dark']").click()
    c.expect(c.page.locator("#tab-import").is_visible(),
             "session calibration actions should open Import Exposures")
    c.expect("fitFilesCal" in c.page.evaluate("() => window.__ns_file_inputs_clicked.join(',')"),
             "a selected session's + Darks action should open its FITS picker")
    with c.page.expect_response(
            lambda response: response.url.endswith("/api/images/ingest")
            and response.status == 200):
        c.page.locator("#fitFilesCal").set_input_files({
            "name": "dark.fits", "mimeType": "application/fits",
            "buffer": b"SIMPLE  =                    T\n",
        })
    c.expect('name="frame"' in ingest_posts[-1] and "dark" in ingest_posts[-1]
             and 'name="session"' in ingest_posts[-1]
             and "20260927" in ingest_posts[-1],
             "session calibration import should post the selected frame and session")
    c.page.locator("#importHistory .imp-item").wait_for()

    c.page.locator("#importHistory [data-imp='flat']").click()
    with c.page.expect_response(
            lambda response: response.url.endswith("/api/images/ingest")
            and response.status == 200):
        c.page.locator("#fitFilesCal").set_input_files({
            "name": "flat.fits", "mimeType": "application/fits",
            "buffer": b"SIMPLE  =                    T\n",
        })
    c.expect('name="frame"' in ingest_posts[-1] and "flat" in ingest_posts[-1]
             and 'name="session"' in ingest_posts[-1]
             and "20260927" in ingest_posts[-1],
             "recent-import calibration should post its selected frame and session")

    c.page.locator("#btnTopIngest").click()
    c.expect("fitFiles" in c.page.evaluate("() => window.__ns_file_inputs_clicked.join(',')"),
             "the primary Import FITS action should open the light-frame picker")
    with c.page.expect_response(
            lambda response: response.url.endswith("/api/library/reindex")
            and response.status == 200):
        c.page.locator("#btnTopReindex").click()
    c.expect_eq(len(reindex_calls), 1,
                "the primary reindex action should call the archive reindex endpoint")

    c.page.locator("#catalog-tab-skymap").click()
    canvas = c.page.locator("#skymapCanvas")
    bounds = canvas.bounding_box()
    c.page.mouse.click(bounds["x"] + bounds["width"] / 4,
                       bounds["y"] + bounds["height"] / 2)
    c.expect("M31" in c.page.locator("#skymapSelection").inner_text(),
             "map selection should show an archive-only object summary")
    c.page.wait_for_timeout(100)

    requested_paths = [url.split("?", 1)[0].split("/", 3)[-1]
                       for url in requests]
    for forbidden in ("api/night", "api/panoramas", "api/catalog", "api/weather",
                      "api/sites", "api/update-check", "js/detail.js",
                      "api/object/ngc224"):
        c.expect(not any(forbidden in path for path in requested_paths),
                 f"catalog-only startup or map selection requested {forbidden}")
    c.expect(not any("open-meteo.com" in url.lower() for url in requests),
             "catalog-only startup must not request planner weather")
    c.expect(not any("wikipedia.org" in url.lower() for url in requests),
             "catalog-only startup must not prefetch planner example images")
    c.expect(any("api/library" in path for path in requested_paths),
             "catalog-only startup should load the image library")

    c.goto("/catalog.html?planner-unavailable=1")
    notice = c.page.locator(".catalog-launch-notice")
    notice.wait_for(state="visible")
    c.expect("Close that window" in notice.inner_text() and "--planner" in notice.inner_text(),
             "planner mode mismatch should explain how to switch without a blank 404")
