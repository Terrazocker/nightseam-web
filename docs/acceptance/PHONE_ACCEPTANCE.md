# Phone owner acceptance

The phone layout and night vision (DESIGN.md, "Phone layout"; DECISIONS.md
2026-10-20) have software checks in the browser suite at phone sizes, in
headless Chrome. These real-device checks are the owner's: one evening with
the phone you observe with, ideally one iPhone and one Android phone. Record
the device, browser, OS version and what you observed; actual outcomes go in
RELEASES.md.

**Before you start.** Use the published site or a preview of this branch.
Clear the site's data once (browser settings), so the first check really is a
first open. Turn the screen brightness down as you would at the telescope.

## Daytime, indoors

1. **First open.** The welcome sheet comes up from the bottom. Tap *Use my
   location*, then save the site. Target: the Tonight list appears with the
   first targets visible without scrolling.
2. **Summary line.** It names your site, minimum altitude and the night
   ("… · min 25° · Tue, 20 Oct"). Tap it. Target: the *Observing setup* sheet
   opens from the bottom; change the date and the minimum altitude there;
   the summary and the list follow. *Done* and a tap outside both close it.
   No field zooms the page when tapped (iPhone).
3. **One hand.** Hold the phone in one hand and use only that thumb. Target:
   every tab, the time slider and *Done* are reachable without regripping;
   nothing needs a second try to hit.
4. **Time slider.** Drag the pinned slider on Tonight, Catalog and Sky View.
   Target: the time follows the thumb smoothly, and every view shows the same
   time. Horizon has no slider.
5. **Catalog.** Open *Filters*, tick a type, close it. Target: the button
   says how many filters are on; each row shows name, designations, type,
   current altitude and best window without scrolling sideways.
6. **Target details.** Tap a target. Target: the details slide up from the
   bottom; while scrolling them, the name, star and close stay at the top.
   The altitude chart's hour labels are readable.
7. **Sky View.** Pinch to zoom in and out; with the map zoomed, drag it with
   one finger; with the map not zoomed, a one-finger drag scrolls the page.
   Try − and + too. Target: no page zoom, no stuck state; *Reset view* returns
   to the whole sky.
8. **Sideways.** Turn the phone landscape on Tonight and Sky View. Target: the
   summary sits beside the brand, the bars stay slim, the sky map fits
   between them.
9. **Install.** Add the planner to the home screen (Android: *Install app*;
   iPhone: Share → *Add to Home Screen*). Target: a sharp NightSeam icon, and
   it opens full screen in its own window, on Tonight.

## At night, outdoors

10. **Night vision.** Tap the eye in the header. Target: everything turns red
    and dim, charts and photos included; the bottom bars stay in place and
    scrolling stays smooth. Reload the page. Target: it comes back red with
    no flash of normal colours.
11. **Dark adaptation.** After 20 minutes outside with night vision on and
    the brightness at its lowest, use the planner for a minute. Target: faint
    stars are still visible afterwards. Note whether anything (the status
    bar, the keyboard, a dialog) stays bright.
12. **Gloves or cold hands** (if relevant). Repeat step 3. Target: still no
    missed taps.

13. **Offline.** After using the planner once, switch on airplane mode and
    open it again (from the home-screen icon if installed). Target: it opens
    on Tonight with your site and targets; weather and photos say they are
    unavailable. Switch the network back on and reload: still the same
    version, no error.

Known limit: the browser's own status and address bars are outside the
page and do not turn red.
