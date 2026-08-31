#!/usr/bin/env node
// MCP server (stdio transport) for the DFI compliance prototype.
// Reachable as a local process; tools + logic live in mcpTools.js (shared with
// the HTTP transport at POST /mcp). JSON-RPC 2.0, newline-delimited.
// IMPORTANT: only JSON-RPC may go to stdout — logging must use stderr.
const { dispatch } = require('./mcpTools');

function send(msg) { process.stdout.write(JSON.stringify(msg) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { process.stderr.write('[mcp] bad JSON line\n'); continue; }
    Promise.resolve()
      .then(() => dispatch(msg))
      .then((resp) => { if (resp) send(resp); })
      .catch((e) => process.stderr.write('[mcp] handler error: ' + e.message + '\n'));
  }
});
process.stdin.on('end', () => process.exit(0));
process.stderr.write('[mcp] dfi-compliance MCP server ready (stdio)\n');
