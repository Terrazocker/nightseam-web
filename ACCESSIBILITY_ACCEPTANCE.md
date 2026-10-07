# Human accessibility acceptance still required

October 7, 2026. Automated browser checks cover keyboard control/focus, dialog
isolation, accessible labels, non-color summaries, reduced motion and enlarged
responsive content. They do not verify what an actual screen reader announces
or the behavior of native browser zoom. Available automation does not control
Windows assistive-technology UI or listen to its announcements. A11Y-001 remains
open until a human records the following outcomes on the prepared candidate.

Use an isolated browser profile/test site. Do not clear the owner's saved data.
Record browser, screen reader/version, date, zoom, page, action and actual result.

1. At 100% native browser zoom, navigate Home, Features, About, Changes, Privacy
   and Imprint with keyboard and screen reader. Verify main navigation, current
   page, phone-menu disclosure and expanded source/privacy sections are clear.
2. First visit to the planner: welcome heading, coordinates/timezone fields,
   elevation-as-metadata note and validation errors are announced. Complete or
   skip; focus enters usable planning controls.
3. Operate Site/Rig/date/minimum altitude/time and all four tabs. Confirm the
   selected clock is exposed, view/site/night changes announce once, and a slider
   drag does not repeatedly read the whole page.
4. Open/close Options, Weather and Setup using keys. Escape returns to the visible
   trigger. Modal Tab stays inside reachable controls; closed disclosures and
   background controls are absent from modal navigation. Inline/docked target
   details remain complementary and leave the map/time controls operable.
5. Select/close/reopen targets across Catalog/Sky/Tonight. Read chart summaries
   and state labels. Expand source information; check loading/error/retry messages,
   image source/license links and no focus takeover when asynchronous data arrives.
6. Edit a Horizon, undo/redo/save, leave with dirty edits and exercise restore
   failure. Ensure warnings and validation errors are readable without color.
7. Repeat at 200% and 400% native browser zoom (not CSS zoom or viewport scaling).
   Verify text reflows, controls/focus remain reachable, dialogs fit, and dense
   tables scroll within their named region without hiding their headings.
8. Test return visit with saved site/rig/horizon and reduced-motion preference.
   Record defects in BUGS.md with reproduction; do not mark pass from screenshots.

Publication readiness must identify this manual evidence or an explicit owner
decision to publish with the remaining limitation. That decision does not turn
unperformed acceptance into a passed audit.
