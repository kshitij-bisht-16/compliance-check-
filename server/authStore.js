// Minimal, dependency-free auth for the local prototype.
// - Passwords hashed with scrypt (Node crypto), never stored in plaintext.
// - Sessions are stateless signed tokens (HMAC-SHA256), delivered as an
//   httpOnly cookie so page JS can't read them.
// Prototype-grade: no email verification, rate limiting, or HTTPS enforcement.
// For real use, put it behind HTTPS and set a strong SESSION_SECRET.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sb = require('./supabase');

const DIR = path.join(__dirname, '..', 'auth');
const USERS = path.join(DIR, 'users.json');
const SECRET_FILE = path.join(DIR, '.secret');
const USERS_TABLE = 'users';
const SESSION_DAYS = 7;

function ensure() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  if (!fs.existsSync(USERS)) fs.writeFileSync(USERS, '[]');
}
function load() { ensure(); return JSON.parse(fs.readFileSync(USERS, 'utf8')); }
function save(list) { fs.writeFileSync(USERS, JSON.stringify(list, null, 2)); }

// Server secret for signing session tokens — env override, else generated once.
function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  ensure();
  if (!fs.existsSync(SECRET_FILE)) fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(SECRET_FILE, 'utf8');
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publicUser(u) { return u ? { id: u.id, email: u.email, name: u.name } : null; }

async function findByEmail(email) {
  email = String(email || '').toLowerCase();
  if (sb.configured()) { const rows = await sb.select(USERS_TABLE, 'email=' + sb.eq(email) + '&select=data'); return (rows && rows[0]) ? rows[0].data : null; }
  return load().find((u) => u.email.toLowerCase() === email) || null;
}
async function persistNewUser(user) {
  if (sb.configured()) await sb.insert(USERS_TABLE, { id: user.id, email: user.email, data: user });
  else { const users = load(); users.push(user); save(users); }
}
async function persistUser(user) {
  if (sb.configured()) await sb.update(USERS_TABLE, 'id=' + sb.eq(user.id), { data: user });
  else { const users = load(); const i = users.findIndex((x) => x.id === user.id); if (i >= 0) { users[i] = user; save(users); } }
}
function newId() { return 'usr_' + Date.now().toString(36) + crypto.randomBytes(3).toString('hex'); }

async function createUser({ email, name, password }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters.');
  if (await findByEmail(email)) throw new Error('An account with that email already exists.');
  const { salt, hash } = hashPassword(password);
  const user = { id: newId(), email, name: (name && String(name).trim()) || email.split('@')[0], salt, hash, createdAt: new Date().toISOString() };
  await persistNewUser(user);
  return user;
}

async function authenticate(email, password) {
  const user = await findByEmail(email);
  if (!user || !user.hash) return null; // no hash → OAuth-only account
  return verifyPassword(password, user.salt, user.hash) ? user : null;
}

// Find-or-create a user that signed in via an OAuth provider (no password).
async function upsertOAuthUser({ email, name, sub, provider }) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Google returned an invalid email.');
  const existing = await findByEmail(email);
  if (existing) {
    let changed = false;
    if (!existing.provider) { existing.provider = provider || 'google'; changed = true; }
    if (sub && existing.googleSub !== sub) { existing.googleSub = sub; changed = true; }
    if (changed) await persistUser(existing);
    return existing;
  }
  const u = { id: newId(), email, name: (name && String(name).trim()) || email.split('@')[0], provider: provider || 'google', googleSub: sub || null, createdAt: new Date().toISOString() };
  await persistNewUser(u);
  return u;
}

// ---- Real Google ID-token verification (JWKS + RS256, no external deps) ----
let _certs = { keys: null, exp: 0 };
async function googleCerts() {
  if (_certs.keys && Date.now() < _certs.exp) return _certs.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('Could not fetch Google certificates.');
  const data = await res.json();
  _certs = { keys: data.keys, exp: Date.now() + 60 * 60 * 1000 }; // cache 1h
  return data.keys;
}
async function verifyGoogleIdToken(idToken, clientId) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Malformed Google token.');
  let header, payloadPeek;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); payloadPeek = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); }
  catch (e) { throw new Error('Malformed Google token.'); }
  if (!header || !payloadPeek) throw new Error('Malformed Google token.');
  const jwk = (await googleCerts()).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('Unknown Google signing key.');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), pub, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('Invalid Google token signature.');
  const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  if (clientId && p.aud !== clientId) throw new Error('Google token audience mismatch.');
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(p.iss) < 0) throw new Error('Bad Google token issuer.');
  if (!p.exp || p.exp * 1000 < Date.now()) throw new Error('Google token expired.');
  if (p.email && p.email_verified === false) throw new Error('Google email not verified.');
  return p; // { email, name, sub, picture, ... }
}

// ---- stateless session token: base64url(payload).hmac ----
function b64(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function sign(uid) {
  const body = b64({ uid, exp: Date.now() + SESSION_DAYS * 864e5 });
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(token) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || Date.now() > p.exp) return null;
    return p; // { uid, exp }
  } catch (e) { return null; }
}
async function userById(id) {
  if (sb.configured()) { const rows = await sb.select(USERS_TABLE, 'id=' + sb.eq(id) + '&select=data'); return (rows && rows[0]) ? rows[0].data : null; }
  return load().find((u) => u.id === id) || null;
}

const COOKIE = 'dfi_session';
module.exports = {
  COOKIE, SESSION_DAYS,
  createUser, authenticate, publicUser, userById, sign, verifyToken,
  upsertOAuthUser, verifyGoogleIdToken
};
