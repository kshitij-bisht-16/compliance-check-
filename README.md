# dfi-compliance-check

A local feasibility prototype: test whether AI vision extraction can reliably
read a real architectural concept sketch / floor plan into structured building
data, then run that data through a configurable bylaw compliance rules engine.

**This is a feasibility test, not the final product.** CAD integration, user
accounts, and real DWG/RVT output are explicitly out of scope for this phase.

## What's here

| Piece | File | Does |
|---|---|---|
| Extraction | `server/extraction.js` | Sends an uploaded image to the Claude vision API, returns structured JSON (room list + areas, footprint, unit count, confidence notes) |
| Rules engine | `server/rulesEngine.js` | Reads bylaw params from `config/bylaws.json`, computes pass / fail / insufficient-data against extracted + user-entered data |
| Live schematic editor | `public/app.js` (`drawResolve`) | Step 2 editable site diagram — drag the building edges (or type) to change setbacks; footprint/FSI/coverage derive from the plot-and-setback envelope and compliance re-checks **live**, so a failing check can be resolved on the schematic. Failing setbacks show as red edges. Edits the schematic model, not the real CAD drawing |
| 2D/3D + interior views | `public/app.js` (`draw3D`, `drawRoomPolys`) + `public/webgl3d.js` | Step 2 diagram has 2D / 3D toggle and an Interior toggle. 3D renders GPU-shaded via **three.js/WebGL** (`webgl3d.js`: lighting, shadows, orbit) with an SVG fallback. Interior shows a colour-coded room layout (2D) and an open-top dollhouse with furniture/doors/windows (3D). Uses real room polygons when extracted, else a schematic treemap. **All furniture/doors/windows are representative (by room type), not read from the drawing.** |
| Bylaw config | `config/bylaws.json` | **Placeholder** FSI, coverage, setbacks, height, parking figures — replace with confirmed target-authority numbers once extraction is proven out |
| Server | `server/index.js` | Express app: `/api/extract`, `/api/comply`, `/api/bylaw-config`, serves the frontend |
| Frontend | `public/` | Upload an image, show extraction results and compliance results (reuses the paper/blueprint styling from the earlier DFI prototypes) |
| Draft sheet | `public/app.js` (`buildSheetHTML`) | Assembles extracted + confirmed data into a printable/PDF **draft submission sheet** — title block, schematic key plan, area statement, compliance table, open items, and schematic elevation + section (indicative massing from floors/height). Marked "DRAFT · NOT FOR SUBMISSION"; **not** a certified statutory set |
| Test harness | `test-sketches/` | Batch-test extraction against real images, log extracted vs. ground-truth, measure accuracy (see its own README) |

## Setup

```bash
cd dfi-compliance-check
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY
npm start                 # http://localhost:3300
```

The server boots and serves the frontend without a key; only the automated
extraction route needs `ANTHROPIC_API_KEY`. Model defaults to `claude-sonnet-5`
(override with `ANTHROPIC_MODEL`).

## Testing extraction without API credits (manual Claude.ai bridge)

You don't need a paid API key to test whether extraction works. On the page,
expand **"No API credits? Use the manual Claude.ai bridge"** under step 01:

1. Copy the prompt shown (it's the exact same prompt `/api/extract` uses).
2. On [claude.ai](https://claude.ai) — your normal subscription, no API cost —
   attach the image, paste the prompt, and send.
3. Paste Claude's JSON reply back into the app and click **Load pasted output**.

The reply flows through the same rendering and compliance path as the automated
route, so you get a real extraction test for free. The automated API button
remains available for when the account has credit.

## Measuring extraction accuracy — the real gate

The whole point of this phase is to measure, not guess: **can AI reliably read a
real drawing into structured data?** The answer decides whether the approach is
viable. You can validate **without API credit** by running drawings through
claude.ai and saving the replies.

```bash
npm run scaffold:truth   # template ground truth for images that lack it
npm run test:sketches     # score extractions, write a markdown accuracy report
```

Extractions come from saved claude.ai replies (`test-sketches/manual-outputs/`)
or, if `ANTHROPIC_API_KEY` is set, the API. Scoring uses tunable tolerance bands
(`test-sketches/validation.config.json`) and produces a shareable markdown report
in `test-sketches/results/`.

**Full step-by-step: [`test-sketches/VALIDATION.md`](test-sketches/VALIDATION.md).**

## Status of the numbers

Every bylaw figure in `config/bylaws.json` is an illustrative placeholder. The
rules engine is deterministic and correct; the *inputs* are not real yet. Confirm
the target authority's development control figures before treating any pass/fail
output as meaningful.
