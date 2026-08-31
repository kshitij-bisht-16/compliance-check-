# test-sketches

Harness for measuring extraction accuracy against real drawings, instead of
guessing at it from a handful of manual tries.

**→ For the full step-by-step, read [VALIDATION.md](VALIDATION.md).** This file is
the quick reference.

## Layout

- `images/` — drop real concept sketches / floor plans here (PNG or JPG). Gitignored — likely real DFI project drawings.
- `ground-truth/` — one JSON file per image, same basename, hand-verified correct values. Optional per image; unmatched images are logged but not scored. Scaffold blanks with `npm run scaffold:truth`.
- `manual-outputs/` — saved claude.ai replies (`<basename>.txt` or `.json`) so you can validate **without API credit**. Gitignored.
- `results/` — timestamped JSON logs **and** shareable markdown reports. Gitignored.
- `validation.config.json` — per-field tolerance bands defining what counts as an acceptable extraction.

## How an extraction is obtained (per image)

1. **Manual** — if `manual-outputs/<basename>.txt|json` exists, it's used (no API needed).
2. **API** — otherwise, if `ANTHROPIC_API_KEY` is set, the Claude API is called.
3. Neither → listed as "not extracted".

## Ground-truth file format

`ground-truth/<image-basename>.json`:

```json
{
  "total_footprint_sqm": 462,
  "unit_count": 6,
  "wall_count": 24,
  "door_count": 8,
  "window_count": 14,
  "room_count": 9
}
```

Only include fields you've actually verified against the drawing — omitted fields are skipped in scoring rather than counted as a miss.

## Running

From the project root:

```bash
npm run scaffold:truth   # optional — templates ground truth for new images
npm run test:sketches    # scores every image, writes a markdown report + JSON log
```

Output: a per-field, per-image accuracy report (`results/report-<timestamp>.md`),
a raw log (`results/run-<timestamp>.json`), and a console summary. A field "passes"
when it's within its tolerance band in `validation.config.json` — tune those bands
to what DFI actually needs.
