// Project store — dual-mode. Uses Supabase Postgres when configured, else local
// JSON files in projects/. All functions are async (files are wrapped so both
// backends share one interface). A project is stored whole in a `data` jsonb
// column; id/owner_id/updated_at are duplicated as columns for filtering.
const fs = require('fs');
const path = require('path');
const sb = require('./supabase');

const DIR = path.join(__dirname, '..', 'projects');
const TABLE = 'projects';

function ensureDir() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); }
function idFor() { return 'proj_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fileFor(id) {
  if (!/^proj_[a-z0-9]+$/i.test(id)) throw new Error('Invalid project id');
  return path.join(DIR, id + '.json');
}
function owns(p, ownerId) { return !ownerId || !p.ownerId || p.ownerId === ownerId; }

// Compact card view for the listing page (no heavy geometry).
function summarize(p) {
  return {
    id: p.id,
    name: p.name || 'Untitled project',
    typology: (p.extraction && p.extraction.typology_guess) || null,
    plot_area_sqm: (p.extraction && p.extraction.plot && p.extraction.plot.area_sqm) || (p.inputs && parseFloat(p.inputs.plot_area_sqm)) || null,
    floors: p.extraction && p.extraction.floor_count != null ? p.extraction.floor_count : (p.inputs && parseFloat(p.inputs.floors)) || null,
    rooms: p.extraction && Array.isArray(p.extraction.rooms) ? p.extraction.rooms.length : 0,
    compliance: p.compliance || null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

function readAllFiles() {
  ensureDir();
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch (e) { return null; } })
    .filter(Boolean);
}

async function list(ownerId) {
  if (sb.configured()) {
    // visible = owned OR legacy (owner_id null)
    const filter = ownerId ? 'or=(owner_id.' + sb.eq(ownerId) + ',owner_id.is.null)&' : '';
    const rows = await sb.select(TABLE, filter + 'select=data&order=updated_at.desc');
    return (rows || []).map((r) => summarize(r.data));
  }
  return readAllFiles().filter((p) => owns(p, ownerId)).map(summarize)
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

async function get(id, ownerId) {
  if (sb.configured()) {
    const rows = await sb.select(TABLE, 'id=' + sb.eq(id) + '&select=data');
    if (!rows || !rows.length) return null;
    const p = rows[0].data;
    return owns(p, ownerId) ? p : null;
  }
  ensureDir();
  const fp = fileFor(id);
  if (!fs.existsSync(fp)) return null;
  const p = JSON.parse(fs.readFileSync(fp, 'utf8'));
  return owns(p, ownerId) ? p : null;
}

async function create(data, ownerId) {
  const now = new Date().toISOString();
  const project = Object.assign({}, data, { id: idFor(), ownerId: ownerId || null, createdAt: now, updatedAt: now });
  if (sb.configured()) {
    await sb.insert(TABLE, { id: project.id, owner_id: project.ownerId, data: project, updated_at: now });
  } else {
    ensureDir();
    fs.writeFileSync(fileFor(project.id), JSON.stringify(project, null, 2));
  }
  return project;
}

async function update(id, data, ownerId) {
  const existing = await get(id, ownerId);
  if (!existing) return null;
  const project = Object.assign({}, existing, data, {
    id: existing.id,
    ownerId: existing.ownerId || ownerId || null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  });
  if (sb.configured()) {
    await sb.update(TABLE, 'id=' + sb.eq(id), { data: project, owner_id: project.ownerId, updated_at: project.updatedAt });
  } else {
    fs.writeFileSync(fileFor(id), JSON.stringify(project, null, 2));
  }
  return project;
}

async function remove(id, ownerId) {
  const existing = await get(id, ownerId);
  if (!existing) return false;
  if (sb.configured()) await sb.remove(TABLE, 'id=' + sb.eq(id));
  else fs.unlinkSync(fileFor(id));
  return true;
}

module.exports = { list, get, create, update, remove, summarize };
