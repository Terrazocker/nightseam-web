# NightSeam full review charter

## Subject

- Workspace: `<workspace>\AstroPilot-local`
- Review label: `0.6.32-full`
- Revision at start: `32778465fdfcb8e88d694a9bc2839814f60bcc10`
- Describe at start: `v0.6.32-3-g3277846`
- Head subject: `release record: 0.6.32`
- Tree at start: dirty only because `REVIEW-PROMPT.md` was already untracked when the review began. It is user-supplied and will not be changed. Review output is confined to this directory.

## Scope and method

This is a read-only review of the Python backend/storage, shared JavaScript core,
web planner, desktop shell, visual and accessibility behaviour, catalogue pipeline,
test/release controls, security/performance, and documentation accuracy. The
contract is `AGENTS.md`; design judgements are made against `DESIGN.md`.

Candidates are only filed as CONFIRMED after an executable reproduction or a
browser observation, then an attempt to refute the claim. Existing documented
carry-over items CR2, DS4, DS5, and WB7 and recorded product decisions are not
re-filed. No source, test, generated asset, deployment, tag, or user data will be
modified.

## Planned evidence

- Targeted source/consumer traces and scratch-only probes under `evidence/`.
- Reference-anchor, selected invariant, guard, and full-suite runs.
- Real-browser web and desktop gates plus review screenshots at representative
  widths/themes/states, visually inspected before any UI conclusion.
- Final revision/tree-state recheck and a report of work that could not be run.
