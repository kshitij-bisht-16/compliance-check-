#!/usr/bin/env node
// Extraction accuracy validation harness.
//
// For every image in test-sketches/images/, obtains a structured extraction and
// scores it against a hand-verified ground-truth file, using per-field tolerance
// bands from validation.config.json. Writes a shareable markdown report plus a
// console summary — so extraction reliability is a measured number, not a guess.
//
// Two ways to get the extraction per image (auto-detected, in this order):
//   1. MANUAL  — a saved claude.ai reply at manual-outputs/<basename>.txt (raw
//                reply, prose ok) or manual-outputs/<basename>.json (parsed).
//                No API credit needed — this is how you validate today.
//   2. API     — if no manual output exists and ANTHROPIC_API_KEY is set, calls
//                the Claude API directly (same path the app uses).
// Images with neither are listed as "not extracted".
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { extractBuildingData, parseModelJson } = require('../server/extraction');

const IMAGES_DIR = path.join(__dirname, 'images');
const TRUTH_DIR = path.join(__dirname, 'ground-truth');
const MANUAL_DIR = path.join(__dirname, 'manual-outputs');
const RESULTS_DIR = path.join(__dirname, 'results');
const CONFIG_PATH = path.join(__dirname, 'validation.config.json');

const MIME_BY_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// ground-truth field -> how to pull the predicted value out of an extraction object.
// Handles the nested plot/setback fields added to test the hard part (setbacks, plot, height).
const FIELD_GETTERS = {
  total_footprint_sqm: (e) => e.total_footprint_sqm_estimate,
  unit_count: (e) => e.unit_count_estimate,
  room_count: (e) => (Array.isArray(e.rooms) ? e.rooms.length : null),
  door_count: (e) => e.door_count_estimate,
  window_count: (e) => e.window_count_estimate,
  wall_count: (e) => e.wall_count_estimate,
  plot_width_m: (e) => e.plot && e.plot.width_m,
  plot_depth_m: (e) => e.plot && e.plot.depth_m,
  plot_area_sqm: (e) => e.plot && e.plot.area_sqm,
  setback_front_m: (e) => e.setbacks_m && e.setbacks_m.front,
  setback_rear_m: (e) => e.setbacks_m && e.setbacks_m.rear,
  setback_side_m: (e) => e.setbacks_m && e.setbacks_m.side,
  building_height_m: (e) => e.building_height_m,
  floor_count: (e) => e.floor_count
};

const tolerances = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).tolerances || {};

async function main() {
  [IMAGES_DIR, MANUAL_DIR, RESULTS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

  const files = fs.readdirSync(IMAGES_DIR).filter((f) => MIME_BY_EXT[path.extname(f).toLowerCase()]);
  if (!files.length) {
    console.log('No images in test-sketches/images/. Add real drawings (PNG/JPG) and re-run.');
    return;
  }

  const results = [];
  for (const file of files) {
    const base = path.basename(file, path.extname(file));
    const truthPath = path.join(TRUTH_DIR, base + '.json');
    const truth = fs.existsSync(truthPath) ? stripComment(JSON.parse(fs.readFileSync(truthPath, 'utf8'))) : null;

    process.stdout.write('· ' + file + ' — ');
    const extraction = await getExtraction(base, file);
    console.log(extraction.source + (extraction.error ? ' (parse failed)' : ''));

    results.push({
      file: file,
      source: extraction.source,
      extracted: extraction.data,
      error: extraction.error,
      truth: truth,
      comparison: truth && extraction.data ? compare(extraction.data, truth) : null
    });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(RESULTS_DIR, 'run-' + stamp + '.json'), JSON.stringify(results, null, 2));
  const report = buildReport(results, stamp);
  const reportPath = path.join(RESULTS_DIR, 'report-' + stamp + '.md');
  fs.writeFileSync(reportPath, report);

  printConsoleSummary(results);
  console.log('\nMarkdown report: ' + path.relative(process.cwd(), reportPath));
}

// Resolve an extraction for one image: manual output first, then API.
async function getExtraction(base, file) {
  const txt = path.join(MANUAL_DIR, base + '.txt');
  const json = path.join(MANUAL_DIR, base + '.json');
  if (fs.existsSync(txt)) {
    const parsed = parseModelJson(fs.readFileSync(txt, 'utf8'));
    return { source: 'manual', data: parsed.data, error: parsed.error };
  }
  if (fs.existsSync(json)) {
    try {
      return { source: 'manual', data: stripComment(JSON.parse(fs.readFileSync(json, 'utf8'))), error: null };
    } catch (e) {
      return { source: 'manual', data: null, error: 'manual JSON invalid' };
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const mediaType = MIME_BY_EXT[path.extname(file).toLowerCase()];
      const b64 = fs.readFileSync(path.join(IMAGES_DIR, file)).toString('base64');
      const r = await extractBuildingData(b64, mediaType);
      return { source: 'api', data: r.data, error: r.error };
    } catch (e) {
      return { source: 'api', data: null, error: e.message };
    }
  }
  return { source: 'none', data: null, error: 'no manual output and no API key' };
}

function compare(extracted, truth) {
  const out = {};
  for (const [tk, get] of Object.entries(FIELD_GETTERS)) {
    if (truth[tk] == null) continue;
    let predicted = get(extracted);
    if (predicted === undefined) predicted = null;
    out[tk] = scoreField(tk, predicted, truth[tk]);
  }
  return out;
}

function scoreField(field, predicted, actual) {
  if (predicted == null) return { predicted: null, actual: actual, abs_error: null, pct_error: null, within: false };
  const absErr = Math.abs(predicted - actual);
  const pctErr = actual !== 0 ? round2((absErr / Math.abs(actual)) * 100) : null;
  const tol = tolerances[field];
  let within = false;
  if (tol) {
    within = tol.type === 'percent' ? pctErr != null && pctErr <= tol.value : absErr <= tol.value;
  }
  return { predicted: predicted, actual: actual, abs_error: round2(absErr), pct_error: pctErr, within: within };
}

function buildReport(results, stamp) {
  const scored = results.filter((r) => r.comparison);
  const lines = [];
  lines.push('# Extraction accuracy report');
  lines.push('');
  lines.push('_Generated ' + stamp.replace(/-/g, ':').replace('T', ' ').slice(0, 19) + '_  ');
  lines.push('Images: ' + results.length + ' · scored against ground truth: ' + scored.length);
  lines.push('');

  // Overall
  const allFields = [];
  scored.forEach((r) => Object.values(r.comparison).forEach((c) => allFields.push(c)));
  const withinCount = allFields.filter((c) => c.within).length;
  if (allFields.length) {
    lines.push('## Overall');
    lines.push('');
    lines.push('**' + pct(withinCount, allFields.length) + '** of scored fields within tolerance (' +
      withinCount + '/' + allFields.length + ').');
    lines.push('');
  }

  // Dimensioned vs unscaled — the decisive split. An unscaled sketch cannot
  // yield reliable areas/setbacks; this is where that shows up as a number.
  const dimGroup = scored.filter((r) => (r.truth || {}).dimensioned === true);
  const undimGroup = scored.filter((r) => (r.truth || {}).dimensioned === false);
  if (dimGroup.length || undimGroup.length) {
    lines.push('## Dimensioned vs unscaled');
    lines.push('');
    lines.push('| Drawing type | Images | Fields within tolerance |');
    lines.push('|---|---|---|');
    if (dimGroup.length) { const g = groupWithin(dimGroup); lines.push('| Dimensioned / to-scale | ' + dimGroup.length + ' | ' + pct(g.within, g.fields) + ' (' + g.within + '/' + g.fields + ') |'); }
    if (undimGroup.length) { const g = groupWithin(undimGroup); lines.push('| Unscaled sketch | ' + undimGroup.length + ' | ' + pct(g.within, g.fields) + ' (' + g.within + '/' + g.fields + ') |'); }
    lines.push('');
    lines.push('_Hypothesis under test: extraction is usable **only** when the drawing carries dimensions or a scale. A large gap between these two rows confirms it — and means the product must mandate dimensioned inputs (or pair the image with typed plot data)._');
    lines.push('');
  }

  // Per-field aggregate
  const byField = {};
  scored.forEach((r) => Object.entries(r.comparison).forEach(([f, c]) => {
    (byField[f] = byField[f] || []).push(c);
  }));
  if (Object.keys(byField).length) {
    lines.push('## By field');
    lines.push('');
    lines.push('| Field | Samples | Within tolerance | Avg % error |');
    lines.push('|---|---|---|---|');
    Object.entries(byField).forEach(([f, cs]) => {
      const within = cs.filter((c) => c.within).length;
      const pcts = cs.map((c) => c.pct_error).filter((x) => x != null);
      const avg = pcts.length ? (pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(1) + '%' : '—';
      lines.push('| ' + f + ' | ' + cs.length + ' | ' + pct(within, cs.length) + ' (' + within + '/' + cs.length + ') | ' + avg + ' |');
    });
    lines.push('');
  }

  // Per image
  lines.push('## Per image');
  lines.push('');
  results.forEach((r) => {
    lines.push('### ' + r.file + '  \n_source: ' + r.source + (r.error ? ' · error: ' + r.error : '') + '_');
    lines.push('');
    if (!r.truth) {
      lines.push('No ground-truth file — not scored. Add `ground-truth/' + baseName(r.file) + '.json` to score it.');
      lines.push('');
      return;
    }
    if (!r.comparison) {
      lines.push('No extraction available to score.');
      lines.push('');
      return;
    }
    lines.push('| Field | Actual | Predicted | Abs err | % err | Verdict |');
    lines.push('|---|---|---|---|---|---|');
    Object.entries(r.comparison).forEach(([f, c]) => {
      lines.push('| ' + f + ' | ' + fmtv(c.actual) + ' | ' + fmtv(c.predicted) + ' | ' +
        fmtv(c.abs_error) + ' | ' + (c.pct_error == null ? '—' : c.pct_error + '%') + ' | ' +
        (c.within ? '✓ pass' : '✗ off') + ' |');
    });
    lines.push('');
  });

  lines.push('---');
  lines.push('_Tolerances from validation.config.json. A "pass" means the field is within its tolerance band, not that it is exactly correct. Ground truth is hand-verified; extraction quality is only as trustworthy as the ground truth it is scored against._');
  return lines.join('\n') + '\n';
}

function printConsoleSummary(results) {
  const scored = results.filter((r) => r.comparison);
  console.log('\n=== Accuracy summary ===');
  console.log(results.length + ' image(s); ' + scored.length + ' scored against ground truth.');
  const noTruth = results.filter((r) => !r.truth).map((r) => r.file);
  const noExtract = results.filter((r) => r.truth && !r.comparison).map((r) => r.file);
  if (noTruth.length) console.log('No ground truth: ' + noTruth.join(', '));
  if (noExtract.length) console.log('No extraction: ' + noExtract.join(', '));

  const byField = {};
  scored.forEach((r) => Object.entries(r.comparison).forEach(([f, c]) => (byField[f] = byField[f] || []).push(c)));
  Object.entries(byField).forEach(([f, cs]) => {
    const within = cs.filter((c) => c.within).length;
    console.log('  ' + f + ': ' + within + '/' + cs.length + ' within tolerance');
  });

  const dim = scored.filter((r) => (r.truth || {}).dimensioned === true);
  const undim = scored.filter((r) => (r.truth || {}).dimensioned === false);
  if (dim.length || undim.length) {
    console.log('  --- dimensioned vs unscaled ---');
    if (dim.length) { const g = groupWithin(dim); console.log('  dimensioned: ' + g.within + '/' + g.fields + ' fields within tolerance (' + dim.length + ' img)'); }
    if (undim.length) { const g = groupWithin(undim); console.log('  unscaled:    ' + g.within + '/' + g.fields + ' fields within tolerance (' + undim.length + ' img)'); }
  }
}

function groupWithin(subset) {
  const fields = [];
  subset.forEach((r) => Object.values(r.comparison).forEach((c) => fields.push(c)));
  return { fields: fields.length, within: fields.filter((c) => c.within).length };
}

function stripComment(o) { if (o && typeof o === 'object') delete o._comment; return o; }
function baseName(f) { return f.replace(/\.[^.]+$/, ''); }
function round2(n) { return Math.round(n * 100) / 100; }
function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '—'; }
function fmtv(v) { return v == null ? '—' : v; }

main().catch((err) => { console.error(err); process.exit(1); });
