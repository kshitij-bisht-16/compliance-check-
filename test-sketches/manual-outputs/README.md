# manual-outputs

Drop saved claude.ai extraction replies here to validate accuracy **without API credit**.

One file per image, matching the image's basename:

- `<basename>.txt` — paste claude.ai's raw reply as-is (prose around the JSON is fine; the harness pulls the JSON out).
- `<basename>.json` — or the parsed JSON object alone, if you prefer.

Example: for `images/site_a.png`, save `manual-outputs/site_a.txt`.

The batch harness (`npm run test:sketches`) prefers a manual output if one exists, and falls back to the API only when there's none and `ANTHROPIC_API_KEY` is set. This folder is gitignored — the replies are your local test data.
