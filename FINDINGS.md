# Findings & open hypotheses

A running record of what this prototype has actually established, what it hasn't,
and the hypotheses that should be stated up front so the feasibility test measures
the question that matters — not a narrower one.

## The feasibility question, stated honestly

The question that matters is: **"Can AI convert a concept drawing into
submission-ready compliance output?"** For a while this prototype was testing a
narrower question — *"can AI read rooms and footprint off an image?"* — while a
human typed in the values the pass/fail actually hinges on (setbacks, height, plot
dimensions). Reading rooms is the easy half; **reading dimensioned setbacks off a
site plan is the hard vision problem**, and it is now in the extraction schema and
the accuracy harness (setbacks, plot W/D, height, floor count, road width).

## Hypothesis 1 — scale ambiguity is decisive

**An unscaled sketch fundamentally cannot yield reliable areas or setbacks. No
model fixes that.** The likely real finding is:

> Extraction is usable **if and only if** the drawing carries dimensions or a
> stated scale. On unscaled concept sketches, areas and setbacks are guesses.

If true, this is not a failure — it is a **product requirement**: the tool must
either mandate dimensioned/scaled inputs, or pair each image with typed plot data
(plot W×D, road width) so the model only has to read what's actually measurable.

**How it's being tested:** every ground-truth file carries a `dimensioned` flag,
and the accuracy report (`npm run test:sketches`) breaks results into
**Dimensioned vs Unscaled**. A large gap between those two rows confirms the
hypothesis. A result like *"62% of fields within tolerance on unscaled sketches,
91% on dimensioned plans"* is a **successful** feasibility test — it tells you
exactly where the human-in-the-loop line has to be.

## Hypothesis 2 — the flat bylaw model is a toy relative to real DCR

The v1 rules engine (`config/bylaws.json`) uses flat scalar setbacks and a single
FSI number. Real Indian development control does not work that way:

- **Setbacks are slab tables**, varying by **abutting road width** and **building
  height** — and the side/rear values are *formulas* (`H/2 − 4`, `H/3`), not
  constants. Plus a long-building adjustment (>40 m).
- **Max height is capped by road width**, not a fixed number.
- **FSI is a stack** — basic + premium + TDR + ancillary — where each layer uses a
  *different plot basis* (net-of-setback vs gross), and computation is P-line-based
  with exemptions (stilt parking, balconies up to a %, ducts/voids, service areas).
- **Parking** is table-based by use and carpet-area band, not 1 ECS/unit.
- **Ground coverage** is governed *indirectly* through marginal distances, not a
  single permissible %.

So the placeholder problem is **not just wrong numbers — the schema is wrong**.
A realistic structure is sketched in `config/bylaws.v2.example.json`, and the
rules engine would need to move from scalar comparison to **table lookup + formula
evaluation + FSI decomposition** (a rewrite, listed in that file's
`_rules_engine_rework_required`).

## DCR reference (grounding for v2)

From published **UDCPR 2020** (Maharashtra) tables — Nagpur values, illustrative
of structure, verify against your target authority:

**Front setback** — by abutting road width, with height overrides:

| Road width | Front setback | | Building height | Front override |
|---|---|---|---|---|
| < 18 m | 3.0 m | | > 14 & ≤ 24 m | 6.0 m |
| ≥ 18 & < 30 m | 4.5 m | | > 24 & ≤ 37.5 m | 9.0 m |
| ≥ 30 m | 6.0 m | | > 37.5 m | 12.0 m |

**Side & rear** (apartments/other) — by height band:

| Height | Rear | Side |
|---|---|---|
| ≤ 14 m | 1.5 m | 1.5 m |
| > 14 & ≤ 24 m | max(H/2 − 4, 3) | max(H/2 − 4, 3) |
| > 24 & ≤ 37.5 m | H/3 | H/3 |
| > 37.5 m | 12 m | 12 m |

**Max height by road width:** < 9 m → 14 m · 9–15 m → 24 m · 15–24 m → 37.5 m ·
≥ 24 m → no cap (high-rise NOC/structural review). Long-building rule: if length or
depth > 40 m, add 10% of (dimension − 4) to affected-side margins.

Sources: [UDCPR 2020 (MMRDA PDF)](https://www.mmrda.maharashtra.gov.in/sites/default/files/2023-10/UDCPR_compressed_2.pdf) ·
[Nagpur setbacks (UDCPR)](https://infralens.in/dcr/setbacks/nagpur) ·
[FSI calculation & exemptions](https://foot2feet.com/blog/Calculation-of-FSI-Pline-and-its-exemption-in-UDCPR-2020)

## What is proven vs unproven

- **Proven:** the pipeline runs end to end (extract → check → resolve → draft
  sheet), and the accuracy harness measures per-field, tolerance-based, split by
  dimensioned/unscaled. The machinery works.
- **Unproven:** actual extraction accuracy on **real, unseen** drawings —
  especially setbacks and unscaled sketches. Blocked on (a) API credit and (b)
  real drawings with independent ground truth. This is still the gate.

## Next actions (unchanged in priority)

1. Run the accuracy batch on **real drawings** (dimensioned + unscaled) and
   **publish the split**, however ugly. That number is the deliverable.
2. Extend the extraction test set with unscaled sketches to populate the
   Unscaled row and confirm Hypothesis 1.
3. Decide the v2 rules-engine rework against the **confirmed** target authority's
   DCR (v2 schema is a starting point, not a spec).
