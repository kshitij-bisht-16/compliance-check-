// Shared MCP tool definitions + JSON-RPC dispatch, used by BOTH transports:
//  - server/mcp.js       (stdio — a local process)
//  - POST /mcp in index.js (Streamable HTTP — reachable by URL)
const { computeCompliance, loadBylawConfig } = require('./rulesEngine');
const projects = require('./projectStore');
const { parseModelJson } = require('./extraction');

const SERVER_INFO = { name: 'dfi-compliance', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2024-11-05';

const tools = [
  {
    name: 'check_compliance',
    description: 'Run the DFI bylaw compliance engine (UDCPR-structured) on building data. Returns pass / fail / insufficient-data per parameter (FSI, coverage, setbacks, height, parking) plus per-room area/width checks.',
    inputSchema: {
      type: 'object',
      properties: {
        plot_area_sqm: { type: 'number', description: 'Plot area in square metres' },
        footprint_sqm: { type: 'number', description: 'Ground-floor building footprint in sq.m' },
        floors: { type: 'number', description: 'Number of floors' },
        unit_count: { type: 'number', description: 'Dwelling units' },
        setback_front_m: { type: 'number' },
        setback_rear_m: { type: 'number' },
        setback_side_m: { type: 'number' },
        height_m: { type: 'number', description: 'Building height in metres' },
        road_width_m: { type: 'number', description: 'Abutting road width in metres (drives setback/height lookups)' },
        parking_provided: { type: 'number', description: 'Proposed parking in ECS' },
        rooms: { type: 'array', items: { type: 'object' }, description: 'Optional: [{ label, approx_area_sqm, polygon_m, level }] for per-room checks' }
      }
    },
    run: (a) => computeCompliance(a || {}, loadBylawConfig())
  },
  {
    name: 'get_bylaw_config',
    description: 'Return the active bylaw configuration used by the compliance engine (UDCPR 2020 reference — illustrative placeholders).',
    inputSchema: { type: 'object', properties: {} },
    run: () => loadBylawConfig()
  },
  {
    name: 'parse_extraction',
    description: 'Parse a raw model reply (e.g. text pasted back from claude.ai) into the structured building-data JSON the compliance engine expects.',
    inputSchema: { type: 'object', properties: { raw: { type: 'string', description: 'Raw model output (may include prose or code fences)' } }, required: ['raw'] },
    run: (a) => { const r = parseModelJson((a && a.raw) || ''); if (r.error || !r.data) throw new Error(r.error || 'Could not parse structured data.'); return r.data; }
  },
  {
    name: 'list_projects',
    description: 'List saved compliance projects (id, name, typology, plot size, room count, compliance summary, dates).',
    inputSchema: { type: 'object', properties: {} },
    run: async () => ({ projects: await projects.list() })
  },
  {
    name: 'get_project',
    description: 'Get one saved project by id — full extraction, planning inputs, and compliance summary.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: async (a) => { const p = await projects.get((a && a.id) || ''); if (!p) throw new Error('Project not found: ' + (a && a.id)); return p; }
  }
];

function toolContent(value, isError) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text: text }], isError: !!isError };
}

// Handle one JSON-RPC message → resolves to a response object, or null for
// notifications (nothing to send back). Async because some tools hit the store.
async function dispatch(msg) {
  if (!msg || typeof msg !== 'object') return null;
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id: id, result: result });
  switch (method) {
    case 'initialize':
      return ok({ protocolVersion: (params && params.protocolVersion) || DEFAULT_PROTOCOL, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
    case 'notifications/initialized':
    case 'initialized':
      return null;
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
    case 'tools/call': {
      const t = tools.find((x) => x.name === (params && params.name));
      if (!t) return ok(toolContent('Unknown tool: ' + (params && params.name), true));
      try { return ok(toolContent(await t.run((params && params.arguments) || {}))); }
      catch (e) { return ok(toolContent('Error: ' + e.message, true)); }
    }
    default:
      if (id !== undefined && id !== null) return { jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } };
      return null;
  }
}

module.exports = { tools, dispatch, SERVER_INFO, DEFAULT_PROTOCOL };
