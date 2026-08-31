// WebGL 3D view (three.js) — GPU-shaded, high-fidelity render of the same block
// data as the SVG view. Image-based environment lighting (IBL), screen-space
// ambient occlusion (SSAO), soft shadows, rounded PBR furniture, reflective glass,
// and a studio backdrop with depth fog. Exposes window.DFI3D.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

let renderer, scene, camera, controls, group, canvas, raf, inited = false;
let composer, ssaoPass, useComposer = false;
let skeleton = false, lastData = null, modelRadius = 12;
let TEX = {}; // procedural (canvas) textures — generated at runtime, no external files

function init(cv) {
  canvas = cv;
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; // filmic response = natural light
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();

  // Image-based lighting: a procedural room gives soft, believable ambient light.
  // Turned up for the bright, evenly-lit architectural-viewer look.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9;
  buildTextures();

  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
  camera.position.set(18, 20, 24);

  controls = new OrbitControls(camera, cv);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.enablePan = true;
  controls.screenSpacePanning = true; // pan follows the cursor in screen space
  controls.panSpeed = 0.9;
  // Right-drag always pans; the Hand tool remaps left-drag to pan (see setPanMode).
  controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // Key light (sun) — the only shadow caster. Softer than sunlight for an even,
  // overcast-studio feel with gentle shadows (like the reference viewer).
  const sun = new THREE.DirectionalLight(0xfff6ec, 1.15);
  sun.position.set(16, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  scene.add(sun);

  // Cool fill from the opposite side to open up the shadows (no shadow casting).
  const fill = new THREE.DirectionalLight(0xccdcf5, 0.4);
  fill.position.set(-14, 12, -10);
  scene.add(fill);

  setBackdrop();

  group = new THREE.Group();
  scene.add(group);

  // Post-processing chain: SSAO adds contact/ambient occlusion in corners and
  // under furniture; OutputPass applies tone mapping + colour management.
  try {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    ssaoPass = new SSAOPass(scene, camera, 1, 1);
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    ssaoPass.kernelRadius = 0.5;
    ssaoPass.minDistance = 0.0008;
    ssaoPass.maxDistance = 0.06;
    composer.addPass(ssaoPass);
    composer.addPass(new OutputPass());
    useComposer = true;
  } catch (e) {
    useComposer = false; // fall back to direct render if postprocessing fails
  }

  inited = true;
  window.DFI3D.ready = true;
  resize();
  animate();
}

// Bright architectural-viewer backdrop: a soft blue-white sky, always light (the
// reference viewers are bright regardless of app theme).
function setBackdrop() {
  const top = '#e6edf4', bot = '#f6f8fa';
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (scene.background && scene.background.dispose) scene.background.dispose();
  scene.background = tex;
  scene.fog = new THREE.Fog(new THREE.Color(bot), 40, 200); // fades distance to sky
}

function animate() {
  raf = requestAnimationFrame(animate);
  if (canvas.style.display === 'none') return; // pause when hidden
  controls.update();
  if (useComposer && composer) composer.render();
  else renderer.render(scene, camera);
}

function resize() {
  if (!inited) return;
  const w = canvas.clientWidth || 480, h = canvas.clientHeight || 380;
  renderer.setSize(w, h, false);
  if (composer) composer.setSize(w, h);
  if (ssaoPass) ssaoPass.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

function clearGroup() {
  while (group.children.length) {
    const c = group.children.pop();
    c.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
    group.remove(c);
  }
}

function mat(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign(
    { color: new THREE.Color(color), roughness: 0.85, metalness: 0.0, envMapIntensity: 0.9 }, opts || {}));
}
// Reflective architectural glass for windows.
function glassMat(color) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color), roughness: 0.06, metalness: 0.0,
    transparent: true, opacity: 0.32, transmission: 0.0,
    clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.5,
    side: THREE.DoubleSide
  });
}

// ---- Procedural textures (canvas-drawn, no external assets) ----
function noiseCanvas(size, lo, hi) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const v = lo + Math.floor(Math.random() * (hi - lo)); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  x.putImageData(img, 0, 0); return c;
}
function weaveCanvas() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(150,150,150,0.55)'; x.lineWidth = 1;
  for (let i = 0; i < s; i += 4) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, s); x.stroke(); x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(s, i + 0.5); x.stroke(); }
  return c;
}
function woodCanvas() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  for (let i = 0; i < s; i++) {                      // vertical grain: grayscale value per column
    const base = 214 + 26 * Math.sin(i * 0.08) + 12 * Math.sin(i * 0.33);
    for (let seg = 0; seg < s; seg += 8) {
      const v = Math.max(150, Math.min(255, base + (Math.random() * 22 - 11))) | 0;
      x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(i, seg, 1, 8);
    }
  }
  for (let k = 0; k < 7; k++) {                      // a few darker grain streaks / knots
    const kx = Math.random() * s; x.strokeStyle = 'rgba(120,120,120,0.22)'; x.lineWidth = 1 + Math.random() * 2;
    x.beginPath(); x.moveTo(kx, 0); x.bezierCurveTo(kx + 12, s * 0.3, kx - 12, s * 0.6, kx + 6, s); x.stroke();
  }
  return c;
}
// Graph-paper ground (the reference's signature look): white with light grid lines.
function gridCanvas() {
  const s = 512, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  x.fillStyle = '#f5f7f9'; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(150,167,184,0.30)'; x.lineWidth = 1;
  for (let i = 0; i <= s; i += 32) { x.beginPath(); x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, s); x.stroke(); x.beginPath(); x.moveTo(0, i + 0.5); x.lineTo(s, i + 0.5); x.stroke(); }
  x.strokeStyle = 'rgba(120,140,160,0.45)'; x.lineWidth = 1.5;      // heavier major border
  x.strokeRect(0.75, 0.75, s - 1.5, s - 1.5);
  return c;
}
// Light ceramic tile with grout lines (colour map).
function tileCanvas() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  x.fillStyle = '#eef1f4'; x.fillRect(0, 0, s, s);
  x.strokeStyle = 'rgba(176,186,196,0.9)'; x.lineWidth = 3; x.strokeRect(1.5, 1.5, s - 3, s - 3);
  return c;
}
// Horizontal lap-siding relief for exterior walls (grayscale bump).
function sidingCanvas() {
  const s = 128, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 10) { x.fillStyle = 'rgba(90,90,90,0.5)'; x.fillRect(0, y, s, 1); x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(0, y + 1, s, 1); }
  return c;
}
function buildTextures() {
  const aniso = renderer.capabilities.getMaxAnisotropy();
  function T(canvas, rx, ry, srgb) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
    t.anisotropy = aniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  }
  const wood = woodCanvas();
  TEX.wall = T(noiseCanvas(128, 200, 232), 3, 2);   // plaster micro-relief (bump)
  TEX.floor = T(noiseCanvas(128, 198, 230), 1.4, 1.4); // ShapeGeometry UV ≈ metres
  TEX.grid = T(gridCanvas(), 1, 1, true);           // graph-paper ground (colour); repeat set per model
  TEX.siding = T(sidingCanvas(), 1, 3, false);      // exterior lap-siding relief
  TEX.tile = T(tileCanvas(), 2, 2, true);           // ceramic floor tile (~0.5 m tiles)
  TEX.fabric = T(weaveCanvas(), 4, 4);
  TEX.woodMap = T(wood, 1, 2, true);                // colour grain (multiplies fill)
  TEX.woodBump = T(wood, 1, 2, false);              // same grain as relief
  TEX.woodFloor = T(wood, 1, 4, true);              // wood-plank floor grain
}
// Floor finish by room type: wood in living areas, tile in wet rooms, concrete elsewhere.
function floorMat(cat) {
  if (cat === 'kitchen' || cat === 'bath' || cat === 'toilet' || cat === 'wash')
    return mat('#eef1f4', { roughness: 0.35, metalness: 0.03, map: TEX.tile, envMapIntensity: 0.9 });
  if (cat === 'parking' || cat === 'passage' || cat === 'balcony' || cat === 'store')
    return mat('#c7cace', { roughness: 0.9, bumpMap: TEX.floor, bumpScale: 0.01 });
  return mat('#b98a55', { roughness: 0.5, metalness: 0.03, map: TEX.woodFloor, bumpMap: TEX.woodBump, bumpScale: 0.006 }); // wood
}
function isWood(color) { return /#(b98c60|a9805a|b08356|c7a97c|9c6b43|efe9df)/i.test(color || ''); }

// our coords: x (width), y (plan depth), z (height, up).  three: X=x, Y=height, Z=plan-depth.
function shapeFrom(poly) {
  const s = new THREE.Shape();
  poly.forEach((p, i) => { i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]); });
  s.closePath();
  return s;
}
function solid(poly, z0, z1, color) {
  const geo = new THREE.ExtrudeGeometry(shapeFrom(poly), { depth: z1 - z0, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, z0, 0);
  const m = new THREE.Mesh(geo, mat(color, { roughness: 0.9 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function floorTile(poly, z, color, cat) {
  const geo = new THREE.ShapeGeometry(shapeFrom(poly));
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, z + 0.01, 0);
  const material = cat ? floorMat(cat) : mat(color, { side: THREE.DoubleSide, roughness: 0.72, bumpMap: TEX.floor, bumpScale: 0.008 });
  material.side = THREE.DoubleSide;
  const m = new THREE.Mesh(geo, material);
  m.receiveShadow = true;
  return m;
}
// a wall segment (thin box) between plan points a,b, from z0..z1
function wallSeg(a, b, z0, z1, color, thick, material) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const geo = new THREE.BoxGeometry(len, z1 - z0, thick || 0.12);
  const m = new THREE.Mesh(geo, material || mat(color, { roughness: 0.92, bumpMap: TEX.wall, bumpScale: 0.012 }));
  m.castShadow = true; m.receiveShadow = true;
  m.position.set((a[0] + b[0]) / 2, z0 + (z1 - z0) / 2, (a[1] + b[1]) / 2);
  m.rotation.y = -Math.atan2(dy, dx);
  return m;
}
function bboxOf(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
// Rounded, PBR furniture box — soft edges catch the light far more naturally than
// hard cubes. Falls back to a plain box if the geometry helper is unavailable.
function furnitureBox(w, h, d, color) {
  const r = Math.max(0.01, Math.min(w, h, d) * 0.12);
  let geo;
  try { geo = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001)); }
  catch (e) { geo = new THREE.BoxGeometry(w, h, d); }
  const metal = /^#8fa3bd$/i.test(color); // the car reads as painted metal
  let opts;
  if (metal) opts = { roughness: 0.35, metalness: 0.55, envMapIntensity: 1.2 };
  else if (isWood(color)) opts = { roughness: 0.55, metalness: 0.03, map: TEX.woodMap, bumpMap: TEX.woodBump, bumpScale: 0.01 }; // wood grain
  else opts = { roughness: 0.7, metalness: 0.02, bumpMap: TEX.fabric, bumpScale: 0.006 };                                       // fabric weave
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Draw a wall from a→c but cut out any doorway openings that lie along it, leaving
// a real gap with a lintel above — instead of a solid wall with a slab on top.
function wallWithOpenings(a, c, z0, z1, color, openings, material, thick) {
  const dx = c[0] - a[0], dy = c[1] - a[1], len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const ux = dx / len, uy = dy / len;
  const ivs = [];
  (openings || []).forEach(o => {
    const t = p => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;         // distance along the wall
    const perp = p => Math.abs(-(p[0] - a[0]) * uy + (p[1] - a[1]) * ux); // distance off the wall line
    if (perp(o.p1) < 0.16 && perp(o.p2) < 0.16) {                   // opening is on this wall line
      let t0 = t(o.p1), t1 = t(o.p2); if (t0 > t1) { const s = t0; t0 = t1; t1 = s; }
      const c0 = Math.max(0, t0), c1 = Math.min(len, t1);
      if (c1 - c0 > 0.25) ivs.push({ t0: c0, t1: c1, top: o.top });
    }
  });
  const pt = t => [a[0] + ux * t, a[1] + uy * t];
  const seg = (p, q, zA, zB) => { const w = wallSeg(p, q, zA, zB, color, thick, material); if (w) group.add(w); };
  if (!ivs.length) { seg(a, c, z0, z1); return; }
  ivs.sort((p, q) => p.t0 - q.t0);
  let cur = 0;
  ivs.forEach(iv => {
    if (iv.t0 - cur > 0.03) seg(pt(cur), pt(iv.t0), z0, z1);
    seg(pt(iv.t0), pt(iv.t1), iv.top, z1); // lintel over the door
    cur = Math.max(cur, iv.t1);
  });
  if (len - cur > 0.03) seg(pt(cur), pt(len), z0, z1);
}

// A framed window with a white surround + a mullion grid (like the reference).
function addWindow(p1, p2, zb, zt) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy);
  if (len < 0.2) return;
  const ux = dx / len, uy = dy / len, h = zt - zb, mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const frame = mat('#f1f1ec', { roughness: 0.55, metalness: 0.02 });
  const glass = glassMat('#bcd6ec');
  const gp = wallSeg(p1, p2, zb, zt, null, 0.03, glass); if (gp) { gp.castShadow = false; group.add(gp); }
  // head + sill bars
  [zb, zt].forEach(z => { const m = wallSeg(p1, p2, z - 0.045, z + 0.045, null, 0.11, frame); if (m) { m.castShadow = false; group.add(m); } });
  // side jambs (vertical posts at each end)
  [p1, p2].forEach(p => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, h + 0.09, 0.11), frame); m.position.set(p[0], zb + h / 2, p[1]); m.rotation.y = -Math.atan2(uy, ux); m.receiveShadow = true; group.add(m); });
  // mullions: one vertical + one horizontal → 2×2 grid of panes
  const mv = new THREE.Mesh(new THREE.BoxGeometry(0.045, h, 0.06), frame); mv.position.set(mid[0], zb + h / 2, mid[1]); mv.rotation.y = -Math.atan2(uy, ux); group.add(mv);
  const mh = wallSeg(p1, p2, zb + h / 2 - 0.022, zb + h / 2 + 0.022, null, 0.06, frame); if (mh) group.add(mh);
}

// A white sectional garage door — panel + horizontal grooves + a frame surround.
function addGarageDoor(p1, p2, z0, ztop) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len, h = ztop - z0;
  const panelMat = mat('#eceae4', { roughness: 0.55, metalness: 0.02 });
  const trimMat = mat('#dcd9d1', { roughness: 0.6 });
  const grooveMat = mat('#c7c3ba', { roughness: 0.7 });
  const panel = wallSeg(p1, p2, z0, ztop, null, 0.08, panelMat); if (panel) group.add(panel);
  const n = Math.max(3, Math.round(h / 0.5));
  for (let i = 1; i < n; i++) { const z = z0 + h * i / n; const g = wallSeg(p1, p2, z - 0.014, z + 0.014, null, 0.1, grooveMat); if (g) { g.castShadow = false; group.add(g); } }
  [p1, p2].forEach(p => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, h + 0.06, 0.13), trimMat); m.position.set(p[0], z0 + h / 2, p[1]); m.rotation.y = -Math.atan2(uy, ux); m.receiveShadow = true; group.add(m); });
  const head = wallSeg(p1, p2, ztop - 0.05, ztop + 0.06, null, 0.13, trimMat); if (head) group.add(head); // lintel trim
}

// A doorway: two slim frame jambs + a thin leaf swung open into the room.
function addDoorway(o) {
  const ux = o.dirx, uy = o.diry, h = o.top - o.z0;
  const w2 = Math.hypot(o.p2[0] - o.p1[0], o.p2[1] - o.p1[1]);
  const frameMat = mat('#efe9df', { roughness: 0.7 });
  const jamb = p => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.22), frameMat);
    m.castShadow = true; m.receiveShadow = true;
    m.position.set(p[0], o.z0 + h / 2, p[1]); m.rotation.y = -Math.atan2(uy, ux);
    return m;
  };
  group.add(jamb(o.p1)); group.add(jamb(o.p2));
  // leaf hinged at p1, rotated toward the room interior (~35°)
  const nx = -uy, ny = ux;
  const toRoom = ((o.cx - o.mx) * nx + (o.cy - o.my) * ny) >= 0 ? 1 : -1;
  const th = 0.62 * toRoom, ca = Math.cos(th), sa = Math.sin(th);
  const ldx = ux * ca - uy * sa, ldy = ux * sa + uy * ca;
  const leafLen = w2 * 0.92, leafH = h - 0.05;
  let geo; try { geo = new RoundedBoxGeometry(leafLen, leafH, 0.045, 2, 0.02); } catch (e) { geo = new THREE.BoxGeometry(leafLen, leafH, 0.045); }
  const leaf = new THREE.Mesh(geo, mat('#9c6b43', { roughness: 0.5, metalness: 0.05, map: TEX.woodMap, bumpMap: TEX.woodBump, bumpScale: 0.012 }));
  leaf.castShadow = true; leaf.receiveShadow = true;
  leaf.position.set(o.p1[0] + ldx * (leafLen / 2), o.z0 + leafH / 2 + 0.02, o.p1[1] + ldy * (leafLen / 2));
  leaf.rotation.y = -Math.atan2(ldy, ldx);
  group.add(leaf);
}

function build(data) {
  if (!inited) return;
  lastData = data;
  clearGroup();
  const blocks = data.blocks || [], ib = data.interiorBounds;
  const W = data.W, D = data.D;
  const cx = W / 2, cy = D / 2;
  group.position.set(-cx, 0, -cy);

  function extEdge(a, b) {
    if (!ib) return false; const t = 0.4;
    return (Math.abs(a[0] - ib.minx) < t && Math.abs(b[0] - ib.minx) < t) || (Math.abs(a[0] - ib.maxx) < t && Math.abs(b[0] - ib.maxx) < t) ||
      (Math.abs(a[1] - ib.miny) < t && Math.abs(b[1] - ib.miny) < t) || (Math.abs(a[1] - ib.maxy) < t && Math.abs(b[1] - ib.maxy) < t);
  }

  // Doorways are invented (the drawing carries no door positions): one opening on
  // each room's longest interior wall. Collected up front so a wall shared by two
  // rooms is cut from both sides — giving a real see-through passage, not a slab.
  const doorOpenings = [];
  blocks.forEach(b => {
    if (!b.isRoom) return;
    const pl = b.poly;
    let di = -1, dl = -1;
    for (let k = 0; k < pl.length; k++) { const a = pl[k], c = pl[(k + 1) % pl.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (!extEdge(a, c) && l > 1.2 && l > dl) { dl = l; di = k; } }
    if (di < 0) return;
    const a = pl[di], c = pl[(di + 1) % pl.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), ux = (c[0] - a[0]) / len, uy = (c[1] - a[1]) / len;
    const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2, dw = Math.min(0.45, len * 0.32);
    const cx2 = pl.reduce((s, p) => s + p[0], 0) / pl.length, cy2 = pl.reduce((s, p) => s + p[1], 0) / pl.length;
    doorOpenings.push({ p1: [mx - ux * dw, my - uy * dw], p2: [mx + ux * dw, my + uy * dw], z0: b.z0, top: b.z0 + Math.min(2.05, (b.z1 - b.z0) - 0.05), dirx: ux, diry: uy, mx: mx, my: my, cx: cx2, cy: cy2 });
  });

  blocks.forEach(b => {
    const pl = b.poly;
    if (b.isRoom) {
      group.add(floorTile(pl, b.z0 + 0.005, b.floorFill || '#e7e9ee', b.cat));
      const openings = doorOpenings.filter(o => Math.abs(o.z0 - b.z0) < 0.01);
      // A parking room puts a garage door on its longest exterior wall.
      const isGarage = b.cat === 'parking';
      let gi = -1, gl = -1;
      if (isGarage) for (let k = 0; k < pl.length; k++) { const a = pl[k], c = pl[(k + 1) % pl.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (extEdge(a, c) && l > gl) { gl = l; gi = k; } }
      for (let i = 0; i < pl.length; i++) {
        const a = pl[i], c = pl[(i + 1) % pl.length];
        const ext = extEdge(a, c);
        // Exterior walls read as dark lap siding; interior partitions stay light.
        const wallMat = ext
          ? mat('#54585d', { roughness: 0.86, metalness: 0.02, bumpMap: TEX.siding, bumpScale: 0.02 })
          : mat('#eceef2', { roughness: 0.9, bumpMap: TEX.wall, bumpScale: 0.012 });
        wallWithOpenings(a, c, b.z0, b.z1, ext ? '#54585d' : '#eceef2', openings, wallMat, ext ? 0.16 : 0.12);
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]), ux = (c[0] - a[0]) / (len || 1), uy = (c[1] - a[1]) / (len || 1);
        const mx = (a[0] + c[0]) / 2, my = (a[1] + c[1]) / 2;
        if (ext) {
          // Eave/coping cap along the top of every exterior wall.
          const cap = wallSeg(a, c, b.z1 - 0.02, b.z1 + 0.1, null, 0.26, mat('#e7e4dc', { roughness: 0.7 }));
          if (cap) group.add(cap);
          if (isGarage && i === gi && len > 1.6) {          // garage door
            const gw = Math.min(len * 0.42, 1.9);
            addGarageDoor([mx - ux * gw, my - uy * gw], [mx + ux * gw, my + uy * gw], b.z0, Math.min(b.z0 + 2.3, b.z1 - 0.2));
          } else if (len > 1) {                              // framed, mullioned window
            const wh = Math.min(len * 0.34, 0.75);
            addWindow([mx - ux * wh, my - uy * wh], [mx + ux * wh, my + uy * wh], b.z0 + 0.95, Math.min(b.z0 + 2.05, b.z1));
          }
        }
      }
    } else if (b.fill) {
      const bb = bboxOf(pl);
      const m = furnitureBox(bb.x1 - bb.x0, b.z1 - b.z0, bb.y1 - bb.y0, b.fill);
      m.position.set((bb.x0 + bb.x1) / 2, b.z0 + (b.z1 - b.z0) / 2, (bb.y0 + bb.y1) / 2);
      group.add(m);
    } else {
      group.add(solid(pl, b.z0, b.z1, '#dfe3ea'));
    }
  });
  doorOpenings.forEach(addDoorway); // frame + open leaf in each cut doorway

  // Skeleton (X-ray) mode: ghost every surface + draw the edge frame.
  if (skeleton) {
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x9fb2cc });
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x6b7280, transparent: true, opacity: 0.06, depthWrite: false });
    const meshes = [];
    group.traverse(o => { if (o.isMesh) meshes.push(o); });
    meshes.forEach(m => {
      m.castShadow = false; m.receiveShadow = false;
      m.material = ghostMat;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 12), edgeMat));
    });
  }

  const box = new THREE.Box3().setFromObject(group);
  const sphere = new THREE.Sphere(); box.getBoundingSphere(sphere);
  modelRadius = sphere.radius || 10;

  // Graph-paper studio ground (shadow catcher), fading into the sky.
  const gsz = Math.max(W, D) * 6;
  if (TEX.grid) TEX.grid.repeat.set(gsz / 4, gsz / 4); // ~0.25 m grid cells
  const gp = new THREE.Mesh(new THREE.PlaneGeometry(gsz, gsz), mat('#ffffff', { roughness: 0.96, envMapIntensity: 0.4, map: TEX.grid }));
  gp.rotation.x = -Math.PI / 2; gp.position.set(cx, -0.02, cy); gp.receiveShadow = true;
  gp.visible = !skeleton;
  group.add(gp);

  // Fit fog + SSAO to the model's real size so both generalise across plots.
  scene.fog.near = modelRadius * 2.2;
  scene.fog.far = modelRadius * 7;
  if (ssaoPass) { ssaoPass.kernelRadius = Math.max(0.25, modelRadius * 0.035); ssaoPass.maxDistance = Math.max(0.03, modelRadius * 0.008); }

  controls.target.copy(sphere.center);
  const r = modelRadius;
  camera.position.copy(sphere.center).add(new THREE.Vector3(r * 1.05, r * 1.05, r * 1.35));
  camera.near = r / 60; camera.far = r * 40; camera.updateProjectionMatrix();
  controls.update();
}

window.DFI3D = {
  ready: false,
  mount: init,
  build: build,
  resize: resize,
  setAutoRotate: function (on) { if (controls) controls.autoRotate = !!on; },
  // Hand (pan) tool: remap left-drag / one-finger drag from orbit to pan.
  setPanMode: function (on) {
    if (!controls) return;
    controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = on ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  },
  setSkeleton: function (on) { skeleton = !!on; if (lastData) build(lastData); }
};
window.addEventListener('resize', resize);
