const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'bylaws.json');

function loadBylawConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * Computes pass/fail/insufficient_data for each bylaw parameter given
 * extracted-and-user-confirmed building data. Setbacks/height are looked up
 * and computed per UDCPR structure (road-width bands, height-band formulas);
 * room standards are checked per-room from extracted geometry.
 *
 * @param {object} input  building data (plot/footprint/floors/setbacks/height/road width/rooms…)
 * @param {object} cfg    bylaw config from loadBylawConfig()
 * @returns {{authority, checks:[], roomChecks:[], derived:{}}}
 */
function computeCompliance(input, cfg) {
  const checks = [];

  const plot = num(input.plot_area_sqm);
  const footprint = num(input.footprint_sqm);
  const floors = num(input.floors);
  const units = num(input.unit_count);
  const height = num(input.height_m);
  const roadWidth = num(input.road_width_m) || cfg.road_width_default_m || 12;
  // Effective height used by the setback/height formulas.
  const H = height != null ? height : (floors ? floors * 3.2 : null);

  // ---- FSI (stack: basic + premium) ----
  if (plot && footprint) {
    const builtUp = round2(footprint * (floors || 1));
    const fsiAchieved = round2(builtUp / plot);
    const fsiMax = round2((cfg.fsi.basic || 0) + (cfg.fsi.premium_max || 0));
    checks.push(check('FSI / FAR', fsiMax, fsiAchieved, fsiAchieved <= fsiMax, cfg.fsi.clause, cfg.fsi.severity,
      'Basic ' + cfg.fsi.basic + ' + premium up to ' + cfg.fsi.premium_max + ' → ' + fsiMax + ' max. Achieved = built-up ' + builtUp + ' ÷ plot ' + plot + '.'));

    const gc = cfg.ground_coverage_pct;
    const coverage = round2((footprint / plot) * 100);
    checks.push(check('Ground coverage %', gc.permissible, coverage, coverage <= gc.permissible, gc.clause, gc.severity, gc.note));
  } else {
    checks.push(insufficient('FSI / FAR', null, 'Needs plot area and footprint', cfg.fsi.clause, cfg.fsi.severity));
    checks.push(insufficient('Ground coverage %', cfg.ground_coverage_pct.permissible, 'Needs plot area and footprint', cfg.ground_coverage_pct.clause, 'advisory'));
  }

  // ---- Front setback: max(road-width band, height override) ----
  {
    const fs2 = cfg.front_setback;
    const roadReq = lookupBand(fs2.by_road_width_m, roadWidth);
    const heightReq = H != null ? lookupRange(fs2.height_override_m, H) : null;
    const required = Math.max(roadReq || 0, heightReq || 0);
    const proposed = num(input.setback_front_m);
    const basis = 'Road ' + roadWidth + ' m → ' + fmt(roadReq) + ' m' + (heightReq ? '; height ' + round1(H) + ' m → ' + fmt(heightReq) + ' m (governs)' : '');
    if (proposed != null) checks.push(check('Front setback', round2(required), proposed, proposed >= required, fs2.clause, fs2.severity, basis));
    else checks.push(insufficient('Front setback', round2(required), 'Needs a dimensioned site plan or manual entry', fs2.clause, fs2.severity, basis));
  }

  // ---- Side & rear: height-band formula ----
  {
    const sr = cfg.side_rear_setback;
    const required = H != null ? evalBandFormula(sr.bands, H) : null;
    const basis = H != null ? 'Height ' + round1(H) + ' m → band formula → ' + fmt(required) + ' m' : 'Needs building height';
    ['rear', 'side'].forEach((s) => {
      const proposed = num(input['setback_' + s + '_m']);
      if (required == null) checks.push(insufficient(cap(s) + ' setback', null, 'Needs building height to compute the margin', sr.clause, sr.severity, basis));
      else if (proposed != null) checks.push(check(cap(s) + ' setback', round2(required), proposed, proposed >= required, sr.clause, sr.severity, basis));
      else checks.push(insufficient(cap(s) + ' setback', round2(required), 'Needs a dimensioned drawing or manual entry', sr.clause, sr.severity, basis));
    });
  }

  // ---- Height cap by road width ----
  {
    const mh = cfg.max_height;
    const cap2 = lookupBand(mh.by_road_width_m, roadWidth);
    const basis = 'Abutting road ' + roadWidth + ' m → ' + (cap2 == null ? 'no fixed cap (high-rise, CFO NOC)' : cap2 + ' m');
    if (H == null) checks.push(insufficient('Height', cap2, 'Needs floors or height', mh.clause, mh.severity, basis));
    else if (cap2 == null) checks.push(check('Height', '—', round1(H), true, mh.clause, mh.severity, basis + ' — verify high-rise approvals'));
    else checks.push(check('Height', cap2, round1(H), H <= cap2, mh.clause, mh.severity, basis));
  }

  // ---- Parking (ECS) by carpet-area band, fallback per-unit ----
  {
    const pk = cfg.parking;
    if (units != null) {
      // Per-unit carpet area if plot/units gives a rough proxy; else fallback rate.
      const perUnitCarpet = plot && units ? round1((footprint || plot) * (floors || 1) / units) : null;
      let rate = pk.ecs_per_unit_fallback;
      let basis = 'Fallback ' + rate + ' ECS/unit × ' + units + ' units';
      if (perUnitCarpet != null) {
        rate = lookupBand(pk.ecs_by_carpet_area_band_sqm, perUnitCarpet, 'ecs');
        basis = '~' + perUnitCarpet + ' m² carpet/unit → ' + rate + ' ECS × ' + units + ' units';
      }
      const required = round2(units * rate * (1 + (pk.visitor_pct || 0) / 100));
      const provided = num(input.parking_provided);
      if (provided != null) checks.push(check('Parking (ECS)', required, provided, provided >= required, pk.clause, pk.severity, basis + ' + ' + pk.visitor_pct + '% visitor'));
      else checks.push(insufficient('Parking (ECS)', required, 'Enter proposed parking count to check', pk.clause, pk.severity, basis));
    } else {
      checks.push(insufficient('Parking (ECS)', null, 'Needs a unit count to derive the requirement', pk.clause, pk.severity));
    }
  }

  // ---- Per-room standards ----
  const roomChecks = computeRoomChecks(input.rooms, cfg.room_standards);
  if (roomChecks.length) {
    const regulated = roomChecks.filter((r) => r.category !== 'other');
    const failed = regulated.filter((r) => r.status === 'fail').length;
    const okN = regulated.length - failed;
    checks.push(
      failed
        ? check('Room standards', regulated.length + ' rooms', okN + '/' + regulated.length + ' ok', false, cfg.room_standards.clause, cfg.room_standards.severity, 'Min area & width per room — see the room-by-room table below.')
        : check('Room standards', regulated.length + ' rooms', 'All meet minimums', true, cfg.room_standards.clause, cfg.room_standards.severity, 'Min area & width per room — see the room-by-room table below.')
    );
  }

  return {
    authority: cfg.authority,
    checks,
    roomChecks,
    derived: { effective_height_m: H == null ? null : round1(H), road_width_m: roadWidth }
  };
}

// ---- Per-room geometric checks ----
function computeRoomChecks(rooms, std) {
  if (!Array.isArray(rooms) || !std) return [];
  return rooms
    .map((r) => {
      const category = roomCategory(r.label);
      const area = num(r.approx_area_sqm);
      const width = polyMinWidth(r.polygon_m);
      const minArea = std.min_area_sqm[category];
      const minWidth = std.min_width_m[category];
      const issues = [];
      if (category === 'other' || minArea == null) {
        return { room: r.label || 'room', level: r.level || 0, category: 'other', area, width, minArea: null, minWidth: null, status: 'na', issues };
      }
      if (area != null && area < minArea) issues.push('area ' + fmt(area) + ' < ' + minArea + ' m²');
      if (width != null && minWidth != null && width < minWidth) issues.push('width ' + fmt(width) + ' < ' + minWidth + ' m');
      const status = issues.length ? 'fail' : (area == null && width == null ? 'na' : 'pass');
      return { room: r.label || 'room', level: r.level || 0, category, area, width, minArea, minWidth, status, issues };
    })
    .filter((r) => r.category !== 'other'); // keep the table to regulated rooms
}

// Room label → standards category. Mirrors the frontend room styling.
function roomCategory(label) {
  const l = (label || '').toLowerCase();
  const has = (...a) => a.some((s) => l.indexOf(s) >= 0);
  if (has('toilet', 'w.c', ' wc', 'water closet')) return 'toilet';
  if (has('bath', 'wash', 'shower')) return 'bath';
  if (has('kitchen', 'pantry')) return 'kitchen';
  if (has('bed', 'master', 'living', 'hall', 'lounge', 'drawing', 'dining', 'family')) return 'habitable';
  return 'other';
}

// Smallest side of a polygon's axis-aligned bounding box (m) — a proxy for min room width.
function polyMinWidth(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return null;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys);
  return round1(Math.min(w, d));
}

// ---- band / formula helpers ----
// bands like [{up_to:18,value:3},{up_to:30,value:4.5},{above:30,value:6}]
function lookupBand(bands, x, key) {
  key = key || 'value';
  for (const b of bands) {
    if (b.up_to != null && x <= b.up_to) return b[key];
    if (b.above != null && x > b.above) return b[key];
  }
  return bands.length ? bands[bands.length - 1][key] : null;
}
// ranges like [{over:14,up_to:24,value:6},{over:24,up_to:37.5,value:9},{over:37.5,value:12}]
function lookupRange(ranges, x) {
  for (const r of ranges) {
    const okLow = r.over == null || x > r.over;
    const okHigh = r.up_to == null || x <= r.up_to;
    if (okLow && okHigh) return r.value;
  }
  return null;
}
// bands like [{up_to_height_m:14,formula:"1.5"},{up_to_height_m:24,formula:"max(H/2-4,3)"},…]
function evalBandFormula(bands, H) {
  for (const b of bands) {
    const okHigh = b.up_to_height_m == null || H <= b.up_to_height_m;
    const okLow = b.above_height_m == null || H > b.above_height_m;
    if (okHigh && okLow) return round2(evalFormula(b.formula, H));
  }
  return null;
}
// Safe evaluator for the small formula vocabulary we allow: numbers, H, + - * /, and max().
function evalFormula(expr, H) {
  if (expr == null) return null;
  const s = String(expr).replace(/max\(([^,]+),([^)]+)\)/g, (_, a, c) => 'Math.max(' + a + ',' + c + ')');
  if (!/^[0-9H+\-*/.,()\sMathmax]*$/.test(s)) return NaN;
  // eslint-disable-next-line no-new-func
  return Function('H', 'Math', 'return (' + s + ');')(H, Math);
}

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }
function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }
function fmt(n) { return n == null ? '—' : (Math.round(n * 100) / 100); }
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function check(parameter, permissible, proposed, pass, clause, severity, reason) {
  return { parameter, permissible, proposed, status: pass ? 'pass' : 'fail', clause: clause || null, severity: severity || 'mandatory', reason: reason || null };
}
function insufficient(parameter, permissible, reason, clause, severity, basis) {
  return { parameter, permissible, proposed: null, status: 'insufficient_data', reason: reason + (basis ? ' · ' + basis : ''), clause: clause || null, severity: severity || 'mandatory' };
}

module.exports = { computeCompliance, loadBylawConfig };
