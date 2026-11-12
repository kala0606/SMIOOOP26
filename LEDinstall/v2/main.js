// OUT OF ONE'S PLACE — v2 (three.js)
// A board of white cubes on textured black. Every second (tick… tock…) four
// cubes tumble one cell forward/back (rotating on the X axis) to reveal the
// words underneath, then tumble home as four others go.
// With sound on, the same positions compose a 120 bpm house loop.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { HouseEngine } from "./audio.js";

// ---------- tweakables ----------
const WORDS = ["OUT", "OF", "ONE'S", "PLACE"];
const TICK = 1.0;          // seconds per beat-pair (one reveal)
const SLIDE = 0.5;         // tumble duration
const STEPS = 8;           // 16th-notes per tick at 120 bpm (0.125 s each)
const BPM = 120;
const SHORT_SIDE = 6;      // cells on the shorter screen side
// --------------------------------

// ---------- renderer / scene ----------
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap; // blurrable, soft-edged shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030303);
scene.fog = new THREE.Fog(0x030303, 30, 70);

const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 200);

// ---------- textured black floor ----------
function makeGrainTexture(size, base, spread, blotches) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  g.fillStyle = `rgb(${base},${base},${base})`;
  g.fillRect(0, 0, size, size);
  // soft blotches, like worn paint / concrete
  for (let i = 0; i < blotches; i++) {
    const x = Math.random() * size, y = Math.random() * size, r = 20 + Math.random() * size * 0.25;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() < 0.5 ? 255 : 0;
    grad.addColorStop(0, `rgba(${v},${v},${v},0.035)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  // fine grain
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * spread;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const floorTex = makeGrainTexture(512, 16, 14, 60);
floorTex.repeat.set(10, 10);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.12;
floor.receiveShadow = true;
scene.add(floor);

// the board: a slightly darker, slightly glossier slab
const boardTex = makeGrainTexture(512, 9, 10, 40);
const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.6, metalness: 0.1 });
let board = null;

// ---------- lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x111111, 0.35));

const key = new THREE.DirectionalLight(0xffffff, 2.6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.bias = -0.0002;
key.shadow.normalBias = 0.02;
key.shadow.radius = 14;      // blur amount: higher = softer
key.shadow.blurSamples = 25;
scene.add(key, key.target);

const rim = new THREE.DirectionalLight(0xbfd4ff, 0.6);
scene.add(rim);

// a light hovering low over the board that flashes on the kick
const pulse = new THREE.PointLight(0xffffff, 0, 14, 1.6);
pulse.position.set(0, 3, 0);
scene.add(pulse);

// ---------- word tiles ----------
const wordTextures = [];
function buildWordTextures() {
  wordTextures.forEach((t) => t.dispose());
  wordTextures.length = 0;
  const S = 512;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `200px "Archivo Black"`;
  const longest = Math.max(...WORDS.map((w) => probe.measureText(w).width));
  const size = Math.min(S * 0.4, (S * 0.8 * 200) / longest);
  for (const w of WORDS) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "#000";
    g.fillRect(0, 0, S, S);
    g.fillStyle = "#fff";
    g.font = `${size}px "Archivo Black"`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(w, S / 2, S / 2 + size * 0.04);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    wordTextures.push(tex);
  }
}

// two sets of 4 tiles: last beat's words (being covered) and this beat's (being revealed)
const tileGeo = new THREE.PlaneGeometry(0.97, 0.97);
tileGeo.rotateX(-Math.PI / 2);
const wordTiles = { prev: [], curr: [] };
function buildWordTiles() {
  for (const set of ["prev", "curr"]) {
    wordTiles[set].forEach((m) => scene.remove(m));
    wordTiles[set] = WORDS.map((_, i) => {
      const m = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ map: wordTextures[i], toneMapped: false }));
      m.position.y = 0.002;
      m.visible = false;
      scene.add(m);
      return m;
    });
  }
}

// ---------- grid + cubes ----------
let cols = 0, rows = 0;
const cubes = []; // {c, r, key, mesh}
const cubeGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.06);
const cubeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.0 });

const key2 = (c, r) => c + "," + r;
const isWhiteHome = (c, r) => (c + r) % 2 === 0;
const cx = (c) => c - (cols - 1) / 2;
const cz = (r) => r - (rows - 1) / 2;

function buildGrid() {
  const aspect = window.innerWidth / window.innerHeight;
  let nc, nr;
  if (aspect >= 1) {
    nr = SHORT_SIDE;
    nc = Math.max(SHORT_SIDE, Math.min(13, Math.round(SHORT_SIDE * aspect)));
  } else {
    nc = Math.max(4, SHORT_SIDE - 1);
    nr = Math.max(nc, Math.min(12, Math.round(nc / aspect)));
  }
  if (nc === cols && nr === rows) return false;
  cols = nc;
  rows = nr;

  cubes.forEach((k) => scene.remove(k.mesh));
  cubes.length = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!isWhiteHome(c, r)) continue;
      const mesh = new THREE.Mesh(cubeGeo, cubeMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      cubes.push({ c, r, key: key2(c, r), mesh });
    }
  }

  if (board) scene.remove(board);
  board = new THREE.Mesh(new THREE.BoxGeometry(cols + 0.3, 0.12, rows + 0.3), boardMat);
  board.position.y = -0.06;
  board.receiveShadow = true;
  scene.add(board);
  boardTex.repeat.set(cols / 6, rows / 6);

  const s = Math.max(cols, rows) / 2 + 3;
  Object.assign(key.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 50 });
  key.shadow.camera.updateProjectionMatrix();
  return true;
}

// Tumble a cube from its home cell by s ∈ [-1, 1] rows, rolling over its bottom edge
// (a rotation on the X axis). s = ±1 means it now rests in the neighbouring row.
function poseCube(mesh, x, z, s) {
  if (s === 0) {
    mesh.position.set(x, 0.5, z);
    mesh.rotation.set(0, 0, 0);
    return;
  }
  const sg = Math.sign(s);
  const a = s * (Math.PI / 2);
  const oy = 0.5, oz = -sg * 0.5; // centre relative to the pivot edge
  const c = Math.cos(a), sn = Math.sin(a);
  mesh.position.set(x, oy * c - oz * sn, z + sg * 0.5 + oy * sn + oz * c);
  mesh.rotation.set(a, 0, 0);
}

// ---------- beat states ----------
// state = { words: [{c, r}], moves: Map(cubeKey -> ±1), dest: Set(cellKey) }
const EMPTY = { words: [], moves: new Map(), dest: new Set() };
const states = new Map();
let firstState = 0, lastState = -1;

function resetStates(fromTick) {
  states.clear();
  states.set(fromTick - 1, EMPTY);
  firstState = fromTick - 1;
  lastState = fromTick - 1;
}

function getState(n) {
  if (n < firstState) return EMPTY;
  while (lastState < n) {
    lastState++;
    states.set(lastState, makeState(states.get(lastState - 1)));
  }
  // forget old beats
  for (const k of states.keys()) if (k < n - 4 && k > firstState) states.delete(k);
  return states.get(n) || EMPTY;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeState(last) {
  const avoid = new Set(last.words.map((w) => key2(w.c, w.r)));
  for (let attempt = 0; attempt < 300; attempt++) {
    const picks = [];
    let tries = 0;
    while (picks.length < WORDS.length && tries++ < 500) {
      const c = Math.floor(Math.random() * cols);
      const r = Math.floor(Math.random() * rows);
      if (!isWhiteHome(c, r) || avoid.has(key2(c, r))) continue;
      if (picks.some((p) => Math.max(Math.abs(p.c - c), Math.abs(p.r - r)) < 2)) continue;
      picks.push({ c, r });
    }
    if (picks.length < WORDS.length) continue;
    picks.sort((a, b) => a.r - b.r || a.c - b.c); // reading order

    // each covering cube tumbles one row forward or back (X-axis roll)
    const moves = new Map();
    const dest = new Set();
    let ok = true;
    for (const p of picks) {
      const dz = shuffle([1, -1]).find((d) => {
        const nr = p.r + d;
        const k = key2(p.c, nr);
        // stay on the board, and don't cross a cube that's tumbling home through that cell
        return nr >= 0 && nr < rows && !dest.has(k) && !last.dest.has(k);
      });
      if (!dz) { ok = false; break; }
      moves.set(key2(p.c, p.r), dz);
      dest.add(key2(p.c, p.r + dz));
    }
    if (!ok) continue;
    return { words: picks, moves, dest };
  }
  return last;
}

// ---------- clock (audio clock when sound is on, so picture and music never drift) ----------
const engine = new HouseEngine();
const p0 = performance.now();
let visualShift = 0;     // keeps time continuous when sound is toggled
let audioOffset = 0;     // ctx.currentTime - masterTime
function masterTime() {
  if (engine.on) return engine.ctx.currentTime - audioOffset;
  return (performance.now() - p0) / 1000 + visualShift;
}

// ---------- the composer: positions -> music ----------
// Chord per beat comes from where the four words landed.
const BASS_ROOTS = [0, 8, 3, 10];            // A, F, C, G  (semitones above A1)
const CHORDS = [
  [0, 3, 7, 10],  // Am7
  [0, 4, 7, 11],  // Fmaj7
  [0, 4, 7, 14],  // Cadd9
  [0, 4, 7, 9],   // G6
];
const A1 = 55;
const hz = (semis) => A1 * Math.pow(2, semis / 12);

function harmonyOf(state) {
  if (!state.words.length) return { root: 0, chord: CHORDS[0] };
  const sum = state.words.reduce((s, w) => s + w.c + 2 * w.r, 0);
  const i = sum % 4;
  return { root: BASS_ROOTS[i], chord: CHORDS[i] };
}
const panOf = (c) => (cols > 1 ? (c / (cols - 1)) * 1.6 - 0.8 : 0);

let nextStep = 0;
function playStep(k, at) {
  const tick = Math.floor(k / STEPS);
  const s = k % STEPS;      // 16th within this reveal (0..7)
  const bar = k % 16;       // 16th within the bar
  const curr = getState(tick);
  const prev = getState(tick - 1);
  const { root, chord } = harmonyOf(curr);

  // four on the floor
  if (s % 4 === 0) engine.kick(at);
  // clap on 2 and 4
  if (bar === 4 || bar === 12) engine.clap(at);
  // offbeat open hat, quiet 16th shuffle in between
  if (s % 4 === 2) engine.hat(at, true, 1);
  else if (s % 2 === 1) engine.hat(at + 0.012, false, 0.6 + Math.random() * 0.4, Math.random() * 0.6 - 0.3);

  // offbeat bassline on this beat's root; octave jump if the words sit low on the board
  if (s === 2 || s === 6) engine.bass(at, hz(root), 0.22);
  if (s === 7 && curr.words.some((w) => w.r >= rows / 2)) engine.bass(at, hz(root + 12), 0.1);

  // chord bed for the whole second
  if (s === 0) engine.pad(at, chord.map((n) => hz(root + n + 24)), TICK);

  // the tumbling cubes, as an arpeggio: OUT, OF, ONE'S, PLACE on the first four 16ths.
  // row picks the chord tone, column picks the octave + stereo position
  if (s < 4 && curr.words[s]) {
    const w = curr.words[s];
    const tone = chord[w.r % chord.length];
    const oct = w.c % 2 === 0 ? 36 : 48;
    engine.pluck(at, hz(root + tone + oct), panOf(w.c), 0.8 + 0.2 * (s === 0));
  }

  // cubes landing back home on the half: tick… tock…
  if (s === 4) {
    prev.words.forEach((w, i) => {
      const base = tick % 2 === 0 ? 1250 : 880;
      engine.tock(at + i * 0.004, base * (1 + (rows - w.r) * 0.015), panOf(w.c));
    });
  }
}

function scheduler() {
  if (!engine.on) return;
  const m = masterTime();
  const stepLen = 60 / BPM / 4;
  while (nextStep * stepLen < m + 0.15) {
    const at = nextStep * stepLen + audioOffset;
    if (at > engine.ctx.currentTime - 0.005) playStep(nextStep, at);
    nextStep++;
  }
}
setInterval(scheduler, 25);

// ---------- sound button ----------
const btn = document.getElementById("sound");
btn.addEventListener("click", async () => {
  const m = masterTime();
  if (!engine.on) {
    await engine.start();
    audioOffset = engine.ctx.currentTime - m;
    nextStep = Math.ceil((m + 0.05) / (60 / BPM / 4));
  } else {
    visualShift = m - (performance.now() - p0) / 1000;
    await engine.stop();
  }
  btn.setAttribute("aria-pressed", String(engine.on));
  btn.querySelector(".label").textContent = engine.on ? "SOUND ON" : "SOUND OFF";
});

// ---------- camera work ----------
function fitDistance(elev) {
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const w = cols / 2 + 0.5;
  const d = (rows / 2) * Math.sin(elev) + 0.5;
  return Math.max(w / Math.tan(hfov / 2), d / Math.tan(vfov / 2)) + 1;
}

// Static, front-on: the camera looks straight down at the board, like the p5 version.
function placeCamera() {
  const dist = fitDistance(Math.PI / 2);
  camera.up.set(0, 0, -1); // row 0 at the top of the screen
  camera.position.set(0, dist, 0);
  camera.lookAt(0, 0, 0);
}

// ---------- loop ----------
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function placeTiles(set, state, show) {
  wordTiles[set].forEach((m, i) => {
    const w = state.words[i];
    m.visible = show && !!w;
    if (w) m.position.set(cx(w.c), 0.002, cz(w.r));
  });
}

function frame() {
  const T = masterTime();
  const tick = Math.floor(T / TICK);
  const curr = getState(tick);
  const prev = getState(tick - 1);
  const e = ease(Math.min(1, (T - tick * TICK) / SLIDE));

  for (const k of cubes) {
    const s = (prev.moves.get(k.key) || 0) * (1 - e) + (curr.moves.get(k.key) || 0) * e;
    poseCube(k.mesh, cx(k.c), cz(k.r), s);
  }
  placeTiles("prev", prev, e < 1);
  placeTiles("curr", curr, true);

  // kick envelope from the beat phase (works with or without sound)
  const beatPhase = (T * BPM) / 60 % 1;
  const kickEnv = Math.exp(-beatPhase * 9);
  pulse.intensity = 6 * kickEnv;

  // key light circles slowly so the shadows sweep across the board
  const la = T * 0.11;
  key.position.set(Math.cos(la) * 9, 11, Math.sin(la) * 6 + 3);
  rim.position.set(-Math.cos(la) * 8, 4, -Math.sin(la) * 8 - 4);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (buildGrid()) resetStates(Math.floor(masterTime() / TICK));
  placeCamera();
}

// ---------- boot ----------
async function boot() {
  try {
    await Promise.race([document.fonts.load('200px "Archivo Black"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch (_) { /* fall back to system font */ }
  buildWordTextures();
  buildWordTiles();
  resize();
  window.addEventListener("resize", resize);
  requestAnimationFrame(frame);
}
boot();
