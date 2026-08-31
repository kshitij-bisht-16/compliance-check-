// MCP CLIENT — lets the DFI app connect out to external MCP servers and call
// their tools. Manages stdio connections (spawns the server process, speaks
// JSON-RPC 2.0 over stdin/stdout) and keeps a registry in mcp/servers.json.
//
// SECURITY: adding a stdio server spawns a local command. This is intentional
// (that's how MCP clients work) but only safe because the app is local and
// behind login. Do not expose this to untrusted users.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = path.join(__dirname, '..', 'mcp');
const FILE = path.join(DIR, 'servers.json');
const RPC_TIMEOUT = 12000;

const conns = {}; // id -> live connection state

function ensure() { if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true }); if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, '[]'); }
function load() { ensure(); try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return []; } }
function save(list) { fs.writeFileSync(FILE, JSON.stringify(list, null, 2)); }
function owns(s, ownerId) { return !ownerId || !s.ownerId || s.ownerId === ownerId; }

function connectStdio(server) {
  return new Promise((resolve, reject) => {
    let proc;
    try { proc = spawn(server.command, server.args || [], { stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return reject(new Error('Could not start command: ' + e.message)); }

    const conn = { proc, pending: new Map(), buf: '', tools: [], info: null, status: 'connecting', nextId: 1 };
    conns[server.id] = conn;

    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk) => {
      conn.buf += chunk;
      let nl;
      while ((nl = conn.buf.indexOf('\n')) >= 0) {
        const line = conn.buf.slice(0, nl).trim();
        conn.buf = conn.buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
        if (msg.id !== undefined && conn.pending.has(msg.id)) {
          const p = conn.pending.get(msg.id); conn.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || 'RPC error')); else p.resolve(msg.result);
        }
      }
    });
    proc.stderr.on('data', () => {}); // the server's own logs — ignore
    proc.on('error', (e) => { conn.status = 'error'; conn.error = e.message; reject(new Error(e.message)); });
    proc.on('exit', () => { conn.status = 'exited'; conn.pending.forEach((p) => p.reject(new Error('Server process exited'))); conn.pending.clear(); });

    conn.rpc = (method, params) => new Promise((res, rej) => {
      const id = conn.nextId++;
      conn.pending.set(id, { resolve: res, reject: rej });
      try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); } catch (e) { conn.pending.delete(id); return rej(e); }
      setTimeout(() => { if (conn.pending.has(id)) { conn.pending.delete(id); rej(new Error('Request timed out')); } }, RPC_TIMEOUT);
    });
    conn.notify = (method, params) => { try { proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); } catch (e) {} };

    conn.rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'dfi-compliance-app', version: '1.0.0' } })
      .then((initRes) => { conn.info = (initRes && initRes.serverInfo) || null; conn.notify('notifications/initialized', {}); return conn.rpc('tools/list', {}); })
      .then((list) => { conn.tools = (list && list.tools) || []; conn.status = 'connected'; resolve(conn); })
      .catch((err) => { conn.status = 'error'; conn.error = err.message; try { proc.kill(); } catch (e) {} reject(err); });
  });
}

async function ensureConnected(server) {
  const c = conns[server.id];
  if (c && c.status === 'connected') return c;
  return connectStdio(server);
}

async function addServer(cfg, ownerId) {
  ensure();
  const server = {
    id: 'mcp_' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'),
    ownerId: ownerId || null,
    name: (cfg.name && String(cfg.name).trim()) || 'MCP server',
    transport: cfg.transport || 'stdio',
    command: cfg.command && String(cfg.command).trim(),
    args: Array.isArray(cfg.args) ? cfg.args : [],
    createdAt: new Date().toISOString()
  };
  if (server.transport !== 'stdio') throw new Error('Only the stdio transport is supported in this prototype.');
  if (!server.command) throw new Error('A command is required (e.g. "node").');
  const conn = await connectStdio(server); // throws if it can't connect / handshake
  server.tools = conn.tools; server.info = conn.info;
  const list = load(); list.push(server); save(list);
  return summarize(server);
}

function summarize(s) {
  const live = conns[s.id];
  return {
    id: s.id, name: s.name, transport: s.transport, command: s.command, args: s.args,
    status: (live && live.status) || 'idle',
    info: (live && live.info) || s.info || null,
    tools: (live && live.tools && live.tools.length ? live.tools : s.tools) || []
  };
}

function listServers(ownerId) { return load().filter((s) => owns(s, ownerId)).map(summarize); }

async function callTool(id, toolName, args, ownerId) {
  const server = load().find((s) => s.id === id && owns(s, ownerId));
  if (!server) throw new Error('MCP server not found.');
  const conn = await ensureConnected(server);
  return conn.rpc('tools/call', { name: toolName, arguments: args || {} });
}

function removeServer(id, ownerId) {
  const list = load();
  const s = list.find((x) => x.id === id && owns(x, ownerId));
  if (!s) return false;
  if (conns[id]) { try { conns[id].proc.kill(); } catch (e) {} delete conns[id]; }
  save(list.filter((x) => x.id !== id));
  return true;
}

module.exports = { addServer, listServers, callTool, removeServer };
