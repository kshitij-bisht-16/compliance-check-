// Minimal Supabase client over its PostgREST API — dependency-free (global fetch).
// Active only when SUPABASE_URL and a service key are set; otherwise the stores
// fall back to local files, so local dev keeps working unchanged.
//
// Use the SERVICE ROLE key here (server-side only, never sent to the browser) —
// it bypasses row-level security, so no policies are needed for the prototype.
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

function configured() { return !!(URL && KEY); }
function base() { return URL.replace(/\/$/, '') + '/rest/v1/'; }
function headers(extra) {
  return Object.assign({ apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' }, extra || {});
}
async function req(method, pathAndQuery, body, prefer) {
  const res = await fetch(base() + pathAndQuery, {
    method,
    headers: headers(prefer ? { Prefer: prefer } : {}),
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) throw new Error('Supabase ' + method + ' ' + res.status + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

const q = (s) => encodeURIComponent(s);

module.exports = {
  configured,
  eq: (v) => 'eq.' + q(v),
  select: (table, query) => req('GET', table + (query ? '?' + query : ''), undefined),
  insert: (table, row) => req('POST', table, row, 'return=representation'),
  upsert: (table, row) => req('POST', table, row, 'resolution=merge-duplicates,return=representation'),
  update: (table, query, patch) => req('PATCH', table + '?' + query, patch, 'return=representation'),
  remove: (table, query) => req('DELETE', table + '?' + query, undefined, 'return=representation')
};
