// OUT OF ONE'S PLACE
// Clockwork checkerboard: every second (tick… tock…) four white squares
// snap out of place in a quick half-second slide, revealing the words
// hidden underneath. Next second, they slide home and four others move.
//
// Recursion: some cells are subdivided into smaller 2x2 checkerboards,
// which can subdivide again, several levels deep. On each beat some of these
// nested blocks turn one quarter like clockwork gears, with the same timing.

// ---------- tweakables ----------
const WORDS = ["OUT", "OF", "ONE'S", "PLACE"];
const TICK_MS = 1000;              // one beat
const SLIDE_MS = 500;              // slide duration within each beat
const TARGET_CELLS_SHORT_SIDE = 6; // roughly how many cells fit on the shorter side
const MIN_CELL = 50;               // px, never smaller than this
const FONT = "Archivo Black";

const MAX_DEPTH = 1;               // how many times a cell can split (1 cell -> 4 -> 16 -> 64)
const SPLIT_MIN = 0.25;            // chance a cell splits in the quietest areas
const SPLIT_CHANCE = 0.8;          // chance a cell splits where the clusters are densest
const SPLIT_DEEPER = 0.55;         // chance a sub-square splits again
const CLUSTER_SCALE = 0.3;         // noise scale: smaller = bigger patches of recursion
const ROTATE_CHANCE = 0.3;         // per beat, chance each nested block turns a quarter
// ---------------------------------

let cell, cols, rows, offX, offY;
let visible;       // {c0, c1, r0, r1} on-screen cell range
let wordSize;
let prev, curr;    // word states: { words: [{c,r,word}], moves: Map("c,r" -> {dx,dy}) }
let lastTick = -1;
let nested = new Map(); // "c,r" -> root node of a subdivided cell
let allNodes = [];      // every subdivided node, for per-beat rotation

function setup() {
  createCanvas(windowWidth, windowHeight);
  strokeWeight(0.3)
  // noStroke();
  textAlign(CENTER, CENTER);
  layout();
  if (document.fonts) document.fonts.ready.then(fitText);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  layout();
}

function layout() {
  cell = max(MIN_CELL, floor(min(width, height) / TARGET_CELLS_SHORT_SIDE));
  cols = ceil(width / cell) + 1;
  rows = ceil(height / cell) + 1;
  offX = (width - cols * cell) / 2;
  offY = (height - rows * cell) / 2;
  visible = {
    c0: ceil(-offX / cell),
    c1: floor((width - offX) / cell) - 1,
    r0: ceil(-offY / cell),
    r1: floor((height - offY) / cell) - 1,
  };
  fitText();
  buildRecursion();
  curr = makeState(null);
  prev = curr;
}

function fitText() {
  textFont(FONT);
  textSize(100);
  const longest = max(WORDS.map((w) => textWidth(w)));
  wordSize = min(cell * 0.42, (cell * 0.82 * 100) / longest);
}

const key2 = (c, r) => c + "," + r;
const isWhiteHome = (c, r) => (c + r) % 2 === 0;

// ---------- recursion ----------

// A node is a square split into a 2x2 checkerboard. Its 4 children sit in
// clockwise slots (TL, TR, BR, BL); each child is either a plain colour
// (true = white) or another node. `rot` turns the children around the slots.
const SLOTS = [[0, 0], [1, 0], [1, 1], [0, 1]];

function makeNode(white, depth) {
  const node = { kids: [], rot: 0, prevRot: 0 };
  // clockwise from TL: same, opposite, same, opposite -> a checkerboard
  const colours = [white, !white, white, !white];
  for (const col of colours) {
    if (depth < MAX_DEPTH && random() < SPLIT_DEEPER) node.kids.push(makeNode(col, depth + 1));
    else node.kids.push(col);
  }
  return node;
}

function buildRecursion() {
  nested = new Map();
  allNodes = [];
  noiseSeed(floor(random(1e6)));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Perlin noise clusters the recursion into patches instead of scattering it
      const n = noise(c * CLUSTER_SCALE, r * CLUSTER_SCALE);
      const chance = constrain(map(n, 0.35, 0.65, SPLIT_MIN, SPLIT_CHANCE), SPLIT_MIN, SPLIT_CHANCE);
      if (random() < chance) nested.set(key2(c, r), makeNode(isWhiteHome(c, r), 1));
    }
  }

  // keep enough plain white cells on screen for the words to keep moving
  const { c0, c1, r0, r1 } = visible;
  const whiteVisible = [];
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) if (isWhiteHome(c, r)) whiteVisible.push(key2(c, r));
  const needPlain = WORDS.length * 3;
  let nestedWhite = shuffle(whiteVisible.filter((k) => nested.has(k)));
  while (whiteVisible.length - nestedWhite.length < needPlain && nestedWhite.length) {
    nested.delete(nestedWhite.pop());
  }
  allNodes = [];
  for (const node of nested.values()) collectNodes(node);
}

function collectNodes(node) {
  allNodes.push(node);
  for (const k of node.kids) if (typeof k === "object") collectNodes(k);
}

function drawNode(node, x, y, size, t) {
  const half = size / 2;
  for (let i = 0; i < 4; i++) {
    const a = SLOTS[(i + node.prevRot) % 4];
    const b = SLOTS[(i + node.rot) % 4];
    const kx = x + lerp(a[0], b[0], t) * half;
    const ky = y + lerp(a[1], b[1], t) * half;
    const kid = node.kids[i];
    if (kid === true) rect(kx, ky, half + 0.5, half + 0.5);
    else if (kid !== false) drawNode(kid, kx, ky, half, t);
  }
}

// ---------- word beats ----------

// Pick 4 new word cells (plain white cells, spread apart, not last beat's)
// and a direction for each covering square to slide out of the way.
function makeState(last) {
  const { c0, c1, r0, r1 } = visible;
  const avoid = new Set();
  if (last) last.words.forEach((w) => avoid.add(key2(w.c, w.r)));

  for (let attempt = 0; attempt < 200; attempt++) {
    const picks = [];
    let tries = 0;
    while (picks.length < WORDS.length && tries++ < 400) {
      const c = floor(random(c0, c1 + 1));
      const r = floor(random(r0, r1 + 1));
      const k = key2(c, r);
      if (!isWhiteHome(c, r) || avoid.has(k) || nested.has(k)) continue;
      // keep words at least 2 cells apart so each slide has room
      if (picks.some((p) => max(abs(p.c - c), abs(p.r - r)) < 2)) continue;
      picks.push({ c, r });
    }
    if (picks.length < WORDS.length) continue;

    // reading order: top-to-bottom, left-to-right
    picks.sort((a, b) => a.r - b.r || a.c - b.c);

    const wordKeys = new Set(picks.map((p) => key2(p.c, p.r)));
    const taken = new Set();
    const moves = new Map();
    let ok = true;
    for (const p of picks) {
      const dirs = shuffle([[1, 0], [-1, 0], [0, 1], [0, -1]]);
      const d = dirs.find(([dx, dy]) => {
        const nc = p.c + dx, nr = p.r + dy;
        return nc >= 0 && nc < cols && nr >= 0 && nr < rows &&
          !wordKeys.has(key2(nc, nr)) && !taken.has(key2(nc, nr));
      });
      if (!d) { ok = false; break; }
      taken.add(key2(p.c + d[0], p.r + d[1]));
      moves.set(key2(p.c, p.r), { dx: d[0], dy: d[1] });
    }
    if (!ok) continue;

    return {
      words: picks.map((p, i) => ({ c: p.c, r: p.r, word: WORDS[i] })),
      moves,
    };
  }
  return last || { words: [], moves: new Map() };
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2;
}

function draw() {
  const now = millis();
  const tick = floor(now / TICK_MS);
  if (tick !== lastTick) {
    prev = curr;
    curr = makeState(prev);
    for (const n of allNodes) {
      n.rot %= 4;
      n.prevRot = n.rot;
      if (random() < ROTATE_CHANCE) n.rot += 1;
    }
    lastTick = tick;
  }
  const t = easeInOutCubic(constrain((now % TICK_MS) / SLIDE_MS, 0, 1));

  background(0,100);

  // 1) words on black — old ones stay until their squares slide back over them
  fill(255);
  textSize(wordSize);
  const showWords = t < 1 ? [...prev.words, ...curr.words] : curr.words;
  for (const w of showWords) {
    text(w.word, offX + (w.c + 0.5) * cell, offY + (w.r + 0.5) * cell + wordSize * 0.04);
  }

  // 2) recursive cells (static position, their insides turn on the beat)
  for (const [k, node] of nested) {
    const [c, r] = k.split(",").map(Number);
    drawNode(node, offX + c * cell, offY + r * cell, cell, t);
  }

  // 3) plain white squares: home position, plus the word-reveal slide
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = key2(c, r);
      if (!isWhiteHome(c, r) || nested.has(k)) continue;
      const a = prev.moves.get(k) || { dx: 0, dy: 0 };
      const b = curr.moves.get(k) || { dx: 0, dy: 0 };
      const dx = lerp(a.dx, b.dx, t);
      const dy = lerp(a.dy, b.dy, t);
      rect(offX + (c + dx) * cell, offY + (r + dy) * cell, cell + 0.5, cell + 0.5);
    }
  }
}

// press "s" to save a frame
function keyPressed() {
  if (key === "s" || key === "S") saveCanvas("out-of-ones-place", "png");
}
