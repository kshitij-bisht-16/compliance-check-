# Extraction accuracy validation — how to run it

The whole prototype rests on one unproven assumption: **can AI reliably read a
real drawing into structured data?** This is how you turn that from a guess into
a number. Do this before investing further — the result decides whether the
approach is viable.

You do **not** need API credit to start. You can validate today using claude.ai
manually (the "manual" path below).

---

## 1. Gather real drawings

Pick **5–10 real DFI drawings** — a spread, not the easy ones:

- concept sketches (hand-drawn, undimensioned) — the hardest, most honest test
- clean site plans / floor plans with dimensions
- a mix of typologies you actually work on

Put them in `test-sketches/images/` (PNG or JPG). This folder is gitignored, so
real project drawings stay local.

> The two synthetic dummies shipped with the repo are **too clean** to be a fair
> test. Real accuracy will be lower on real sketches — that's the point of measuring.

## 2. Build ground truth

For each image, record what's *actually* true — measured or known from the real
project, not eyeballed. Scaffold blank templates:

```bash
npm run scaffold:truth
```

This creates `ground-truth/<image>.json` for any image missing one. Open each and
fill in only the fields you've verified (delete the rest — omitted fields aren't
counted against the model):

```json
{
  "dimensioned": true,
  "total_footprint_sqm": 462,
  "unit_count": 24,
  "room_count": 9,
  "plot_width_m": 21,
  "plot_depth_m": 24,
  "setback_front_m": 6,
  "setback_rear_m": 4.5,
  "setback_side_m": 3,
  "building_height_m": 23.4,
  "floor_count": 8
}
```

Set **`dimensioned`** `true` if the drawing has dimension lines or a stated scale,
`false` if it's an unscaled sketch — this drives the **dimensioned vs unscaled**
split in the report, which is the whole point (Hypothesis 1 in `../FINDINGS.md`).
The **setback / plot / height** fields are the hard part — include them for site
plans so the test covers what compliance actually needs, not just rooms.

## 3. Get an extraction per image — two ways

**A. Manual (no API credit) — recommended to start**
For each image: open [claude.ai](https://claude.ai), attach the image, paste the
prompt from the app's "manual bridge" (or `GET /api/extraction-prompt`), send.
Save Claude's reply to `manual-outputs/<image-basename>.txt` (raw reply is fine —
prose around the JSON is handled).

**B. API (needs credit)**
Just set `ANTHROPIC_API_KEY` in `.env`. Any image without a manual output is
extracted via the API automatically.

You can mix both — manual output wins when present.

## 4. Run the scorer

```bash
npm run test:sketches
```

It prints a summary and writes a shareable **markdown report** and a raw JSON log
to `test-sketches/results/`.

## 5. Read the result

The report gives, per field:

- **Within tolerance** — the extraction was close enough to be usable (bands set
  in `validation.config.json` — tune them to what DFI actually needs).
- **Avg % error** — how far off, on average.

Interpreting it honestly:

- **Footprint / areas within ~15% on real dimensioned drawings** → promising; the
  extraction front-end is worth building on.
- **Unit / room counts frequently wrong, or footprint wildly off on undimensioned
  sketches** → expected, and the key finding: extraction needs dimensioned input,
  or a human-in-the-loop confirm step, before compliance output can be trusted.

Either way you now have evidence. A low score isn't a failure of the exercise —
it's the exercise working. It tells you where a human check is non-negotiable
before this feeds a submission sheet.

## What this does and doesn't prove

- It measures **reading accuracy** against your ground truth — nothing more.
- It says nothing about the compliance verdicts (those depend on real bylaw
  figures, still placeholders) or about statutory drawing output (not built).
- Ground truth is only as good as your measurements — sloppy ground truth gives a
  meaningless score.
