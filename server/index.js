const path = require('path');
// Load .env from the project root regardless of the process working directory
// (the preview launcher starts this from the parent folder).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const multer = require('multer');

const { extractBuildingData, parseModelJson, EXTRACTION_PROMPT } = require('./extraction');
const { computeCompliance, loadBylawConfig } = require('./rulesEngine');
const projects = require('./projectStore');
const auth = require('./authStore');
const mcpClient = require('./mcpClient');
const mcpTools = require('./mcpTools');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '12mb' })); // room for saved drawings (data URLs)

// ---- Auth: cookie parsing + session helpers ----
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie;
  if (h) h.split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function setSession(res, uid) {
  const token = auth.sign(uid);
  res.setHeader('Set-Cookie', `${auth.COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${auth.SESSION_DAYS * 86400}`);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', `${auth.COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
async function currentUser(req) {
  const token = parseCookies(req)[auth.COOKIE];
  const payload = token && auth.verifyToken(token);
  return payload ? auth.userById(payload.uid) : null;
}
async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in required.' });
    req.user = user; next();
  } catch (err) { res.status(500).json({ error: err.message }); }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const user = await auth.createUser(req.body || {});
    setSession(res, user.id);
    res.status(201).json({ user: auth.publicUser(user) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await auth.authenticate(email, password);
    if (!user) return res.status(401).json({ error: 'Wrong email or password.' });
    setSession(res, user.id);
    res.json({ user: auth.publicUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/auth/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

// Tells the frontend whether real Google Sign-In is configured. When no
// GOOGLE_CLIENT_ID is set, the UI offers a clearly-labelled demo instead.
app.get('/api/auth/config', (req, res) => {
  res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, googleDemo: !process.env.GOOGLE_CLIENT_ID });
});

// Google sign-in. Real path: verify the ID token from Google Identity Services.
// Demo path (only when GOOGLE_CLIENT_ID is unset): trust a supplied email so the
// journey is usable without Google credentials.
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential, demoEmail, demoName } = req.body || {};
    let profile;
    if (credential) {
      profile = await auth.verifyGoogleIdToken(credential, process.env.GOOGLE_CLIENT_ID);
      profile = { email: profile.email, name: profile.name, sub: profile.sub, provider: 'google' };
    } else if (demoEmail && !process.env.GOOGLE_CLIENT_ID) {
      profile = { email: demoEmail, name: demoName || '', sub: null, provider: 'google-demo' };
    } else {
      return res.status(400).json({ error: 'Missing Google credential.' });
    }
    const user = await auth.upsertOAuthUser(profile);
    setSession(res, user.id);
    res.json({ user: auth.publicUser(user) });
  } catch (err) {
    console.error('[auth.google]', err.message);
    res.status(401).json({ error: err.message || 'Google sign-in failed.' });
  }
});
app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    res.json({ user: auth.publicUser(user) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.use(express.static(path.join(__dirname, '..', 'public')));
// three.js served locally (offline, no CDN) for the WebGL 3D view
app.use('/three', express.static(path.join(__dirname, '..', 'node_modules', 'three')));

// Bound the cost of the paid AI extraction on a public deployment: require a
// signed-in user, and cap calls globally per day + per user per hour. Counters
// are in-memory (reset on restart) — fine for a demo, and cheap.
const EXTRACT_DAILY_MAX = parseInt(process.env.EXTRACT_DAILY_MAX || '30', 10);
const EXTRACT_USER_HOURLY_MAX = parseInt(process.env.EXTRACT_USER_HOURLY_MAX || '5', 10);
let extractDay = { key: '', count: 0 };
const extractUserHits = new Map(); // uid -> [timestamps]
function extractGate(uid) {
  const now = Date.now();
  const dayKey = new Date().toISOString().slice(0, 10);
  if (extractDay.key !== dayKey) extractDay = { key: dayKey, count: 0 };
  if (extractDay.count >= EXTRACT_DAILY_MAX) return { ok: false, msg: 'Daily limit for AI extraction on this demo has been reached. Try the sample project, or check back tomorrow.' };
  const hits = (extractUserHits.get(uid) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= EXTRACT_USER_HOURLY_MAX) return { ok: false, msg: 'You have hit the hourly extraction limit for this demo. Try the sample project.' };
  return { ok: true, commit() { extractDay.count++; hits.push(now); extractUserHits.set(uid, hits); } };
}

app.post('/api/extract', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server. See .env.example.' });
  }
  const gate = extractGate(req.user.id);
  if (!gate.ok) return res.status(429).json({ error: gate.msg });
  try {
    const base64 = req.file.buffer.toString('base64');
    const result = await extractBuildingData(base64, req.file.mimetype);
    gate.commit();
    res.json(result);
  } catch (err) {
    console.error('[extract]', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/comply', (req, res) => {
  try {
    const bylawConfig = loadBylawConfig();
    const result = computeCompliance(req.body || {}, bylawConfig);
    res.json(result);
  } catch (err) {
    console.error('[comply]', err);
    res.status(500).json({ error: err.message });
  }
});

// Exposes the exact extraction prompt so the manual Claude.ai bridge in the UI
// uses the same instructions the automated /api/extract route would.
app.get('/api/extraction-prompt', (req, res) => {
  res.json({ prompt: EXTRACTION_PROMPT });
});

// Parses a raw model response (e.g. pasted back from claude.ai) into the same
// structured shape the automated route returns — one place for the parse logic.
app.post('/api/parse-extraction', (req, res) => {
  const raw = (req.body && req.body.raw) || '';
  const result = parseModelJson(raw);
  res.json({ data: result.data, raw, error: result.error });
});

app.get('/api/bylaw-config', (req, res) => {
  try {
    res.json(loadBylawConfig());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Projects (CRUD, scoped to the signed-in user; Supabase or files) ----
app.get('/api/projects', requireAuth, async (req, res) => {
  try { res.json({ projects: await projects.list(req.user.id) }); }
  catch (err) { console.error('[projects.list]', err); res.status(500).json({ error: err.message }); }
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const p = await projects.get(req.params.id, req.user.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/projects', requireAuth, async (req, res) => {
  try { res.status(201).json(await projects.create(req.body || {}, req.user.id)); }
  catch (err) { console.error('[projects.create]', err); res.status(500).json({ error: err.message }); }
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const p = await projects.update(req.params.id, req.body || {}, req.user.id);
    if (!p) return res.status(404).json({ error: 'Not found' });
    res.json(p);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  try {
    const ok = await projects.remove(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ---- MCP client: connect the app OUT to external MCP servers ----
app.get('/api/mcp/servers', requireAuth, (req, res) => {
  try { res.json({ servers: mcpClient.listServers(req.user.id) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/mcp/servers', requireAuth, async (req, res) => {
  try { res.status(201).json({ server: await mcpClient.addServer(req.body || {}, req.user.id) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

app.post('/api/mcp/servers/:id/call', requireAuth, async (req, res) => {
  try {
    const { tool, arguments: args } = req.body || {};
    const result = await mcpClient.callTool(req.params.id, tool, args || {}, req.user.id);
    res.json({ result });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.delete('/api/mcp/servers/:id', requireAuth, (req, res) => {
  try {
    const ok = mcpClient.removeServer(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ---- MCP server over HTTP (Streamable HTTP transport) — reachable by URL ----
// Connect a URL-based client (claude.ai connectors, Claude Code --transport http,
// Claude Desktop remote MCP) to http(s)://<host>/mcp. Optionally protect with a
// bearer token via env MCP_HTTP_TOKEN (clients send Authorization: Bearer <token>).
function mcpCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Accept');
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
}
function mcpTokenOk(req) {
  const token = process.env.MCP_HTTP_TOKEN;
  if (!token) return true; // open when no token configured
  const h = req.headers.authorization || '';
  return h === 'Bearer ' + token;
}
app.options('/mcp', (req, res) => { mcpCors(res); res.status(204).end(); });
app.get('/mcp', (req, res) => { mcpCors(res); res.status(405).json({ error: 'Use POST for JSON-RPC (Streamable HTTP). This server sends no server-initiated stream.' }); });
app.post('/mcp', async (req, res) => {
  mcpCors(res);
  if (!mcpTokenOk(req)) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: bearer token required.' } });
  res.setHeader('Mcp-Session-Id', 'dfi-stateless'); // stateless server — tools carry no session
  const body = req.body;
  const batch = Array.isArray(body);
  const msgs = batch ? body : [body];
  const responses = [];
  for (const m of msgs) { try { const r = await mcpTools.dispatch(m); if (r) responses.push(r); } catch (e) { responses.push({ jsonrpc: '2.0', id: (m && m.id) || null, error: { code: -32603, message: e.message } }); } }
  if (!responses.length) return res.status(202).end(); // only notifications were sent
  res.json(batch ? responses : responses[0]);
});

const PORT = process.env.PORT || 3300;
// Bind 0.0.0.0 so platform proxies (Fly.io, Render, …) can reach the app.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`dfi-compliance-check running on 0.0.0.0:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set — extraction will fail until configured.');
  if (!process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET not set — set it in production so sessions survive restarts.');
  const sb = require('./supabase');
  console.log('Storage:', sb.configured() ? 'Supabase Postgres' : 'local files');
});
