/* model.js — 原理图数据模型 / 符号库 / 网络推导 / ERC */
'use strict';

const GRID = 10, EPS = 0.8;
const r2 = n => Math.round(n * 100) / 100;
const rk = (x, y) => r2(x) + ',' + r2(y);
const uid = p => p + Math.random().toString(36).slice(2, 7);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const snapv = v => Math.round(v / GRID) * GRID;

/* ---------- 符号库 ---------- */
const L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="sym"/>`;
const T = (x, y, s) => `<text class="symtxt" x="${x}" y="${y}">${esc(s)}</text>`;

const PASS = () => [{ n: '1', x: -40, y: 0, role: 'passive' }, { n: '2', x: 40, y: 0, role: 'passive' }];

const SYM = {
  res: {
    label: '电阻', cat: 'passive', ref: 'R', pins: PASS,
    body: () => L(-40, 0, -22, 0) + `<rect x="-22" y="-8" width="44" height="16" class="sym"/>` + L(22, 0, 40, 0)
  },
  cap: {
    label: '电容', cat: 'passive', ref: 'C', pins: PASS,
    body: () => L(-40, 0, -5, 0) + L(-5, -14, -5, 14) + L(5, -14, 5, 14) + L(5, 0, 40, 0)
  },
  ind: {
    label: '电感', cat: 'passive', ref: 'L', pins: PASS,
    body: () => L(-40, 0, -21, 0) + `<path class="sym" d="M-21,0 A7,7 0 0 1 -7,0 A7,7 0 0 1 7,0 A7,7 0 0 1 21,0"/>` + L(21, 0, 40, 0)
  },
  diode: {
    label: '二极管', cat: 'discrete', ref: 'D',
    pins: () => [{ n: '1', name: 'A', x: -40, y: 0, role: 'passive' }, { n: '2', name: 'K', x: 40, y: 0, role: 'passive' }],
    body: () => L(-40, 0, -12, 0) + `<path class="symfill" d="M-12,-12 L12,0 L-12,12 Z"/>` + L(12, -12, 12, 12) + L(12, 0, 40, 0)
  },
  led: {
    label: 'LED', cat: 'discrete', ref: 'D',
    pins: () => [{ n: '1', name: 'A', x: -40, y: 0, role: 'passive' }, { n: '2', name: 'K', x: 40, y: 0, role: 'passive' }],
    body: () => L(-40, 0, -12, 0) + `<path class="symfill" d="M-12,-12 L12,0 L-12,12 Z"/>` + L(12, -14, 12, 14) + L(12, 0, 40, 0)
      + L(16, -16, 26, -26) + `<path class="sym" d="M26,-26 l-8,2 M26,-26 l-2,8"/>`
      + L(4, -20, 14, -30) + `<path class="sym" d="M14,-30 l-8,2 M14,-30 l-2,8"/>`
  },
  bjt: {
    label: '三极管', cat: 'discrete', ref: 'Q',
    pins: () => [{ n: '1', name: 'B', x: -40, y: 0 }, { n: '2', name: 'C', x: 20, y: -40 }, { n: '3', name: 'E', x: 20, y: 40, role: 'out' }],
    body: () => `<circle cx="0" cy="0" r="20" class="sym"/>` + L(-40, 0, -8, 0) + L(-8, -14, -8, 14)
      + L(-8, -6, 20, -22) + L(20, -22, 20, -40) + L(-8, 6, 20, 22) + L(20, 22, 20, 40)
  },
  mos: {
    label: 'MOSFET', cat: 'discrete', ref: 'M',
    pins: () => [{ n: '1', name: 'G', x: -40, y: 0 }, { n: '2', name: 'D', x: 20, y: -40 }, { n: '3', name: 'S', x: 20, y: 40, role: 'out' }],
    body: () => L(-40, 0, -16, 0) + L(-16, -14, -16, 14)
      + L(-10, -14, -10, -6) + L(-10, -4, -10, 4) + L(-10, 6, -10, 14)
      + L(-10, -10, 20, -10) + L(20, -10, 20, -40)
      + L(-10, 10, 20, 10) + L(20, 10, 20, 40)
      + `<path class="symfill" d="M-3,10 l9,-4 l0,8 Z"/>`
  },
  opamp: {
    label: '运放', cat: 'ic', ref: 'U',
    pins: () => [{ n: '1', name: '-', x: -40, y: -20, role: 'in' }, { n: '2', name: '+', x: -40, y: 20, role: 'in' }, { n: '3', name: 'OUT', x: 40, y: 0, role: 'out' }],
    body: () => `<path class="sym" d="M-30,-30 L30,0 L-30,30 Z"/>` + L(-40, -20, -30, -20) + L(-40, 20, -30, 20) + L(30, 0, 40, 0)
  },
  sw: {
    label: '开关', cat: 'passive', ref: 'SW', pins: PASS,
    body: () => L(-40, 0, -18, 0) + `<circle cx="-14" cy="0" r="4" class="sym"/>` + `<circle cx="14" cy="0" r="4" class="sym"/>`
      + L(14, 0, 40, 0) + L(-12, -2, 12, -16)
  },
  fuse: {
    label: '保险丝', cat: 'passive', ref: 'F', pins: PASS,
    body: () => L(-40, 0, -22, 0) + `<rect x="-22" y="-8" width="44" height="16" class="sym"/>` + L(22, 0, 40, 0) + L(-22, 0, 22, 0)
  },
  ic: {
    label: 'IC / 芯片', cat: 'ic', ref: 'U',
    pins: c => icPins(c),
    body: c => icBody(c)
  },
  conn: {
    label: '连接器', cat: 'ic', ref: 'J',
    pins: c => icPins(c, true),
    body: c => icBody(c, true)
  },
  gnd: {
    label: '地 GND', cat: 'power', ref: '#PWR', global: true, defNet: 'GND',
    pins: () => [{ n: '1', x: 0, y: 0, role: 'power' }],
    body: () => L(0, 0, 0, 10) + L(-11, 10, 11, 10) + L(-7, 14, 7, 14) + L(-3, 18, 3, 18)
  },
  vcc: {
    label: '电源', cat: 'power', ref: '#PWR', global: true, defNet: '5V',
    pins: () => [{ n: '1', x: 0, y: 0, role: 'power' }],
    body: () => L(0, 0, 0, -10) + L(-10, -10, 10, -10) + L(0, -10, 0, -16)
  },
  tp: {
    label: '测试点', cat: 'power', ref: 'TP',
    pins: () => [{ n: '1', x: 0, y: 0, role: 'passive' }],
    body: () => `<circle cx="0" cy="0" r="6" class="sym"/>`
  }
};

const PALETTE = ['res', 'cap', 'ind', 'diode', 'led', 'bjt', 'mos', 'opamp', 'sw', 'fuse', 'ic', 'conn', 'gnd', 'vcc', 'tp'];

function icGeom(c, isConn) {
  const n = Math.max(2, Math.min(40, c.pinCount || (isConn ? 4 : 8)));
  const W = isConn ? 60 : 100;
  let left, right;
  if (isConn) { left = n; right = 0; } else { left = Math.ceil(n / 2); right = n - left; }
  const rows = Math.max(left, right, 2);
  const H = Math.max(60, rows * 20 + 20);
  return { n, left, right, W, H };
}
function icPins(c, isConn) {
  const g = icGeom(c, isConn);
  const out = [];
  for (let i = 0; i < g.left; i++) out.push({ n: String(i + 1), x: -80, y: -g.H / 2 + 20 + i * 20, role: 'unknown', side: 'L' });
  for (let j = 0; j < g.right; j++) out.push({ n: String(g.n - j), x: 80, y: -g.H / 2 + 20 + j * 20, role: 'unknown', side: 'R' });
  return out;
}
function icBody(c, isConn) {
  const g = icGeom(c, isConn), hw = g.W / 2, hh = g.H / 2;
  let s = `<rect x="${-hw}" y="${-hh}" width="${g.W}" height="${g.H}" class="sym box"/>`;
  for (let i = 0; i < g.left; i++) {
    const y = -hh + 20 + i * 20, num = i + 1;
    s += L(-80, y, -hw, y);
    s += `<text class="pnum" x="${-hw - 4}" y="${y - 3}" text-anchor="end">${num}</text>`;
    const nm = c.pinNames && c.pinNames[num]; if (nm) s += `<text class="pname" x="${-hw + 5}" y="${y - 3}">${esc(nm)}</text>`;
  }
  for (let j = 0; j < g.right; j++) {
    const y = -hh + 20 + j * 20, num = g.n - j;
    s += L(hw, y, 80, y);
    s += `<text class="pnum" x="${hw + 4}" y="${y - 3}" text-anchor="start">${num}</text>`;
    const nm = c.pinNames && c.pinNames[num]; if (nm) s += `<text class="pname" x="${hw - 5}" y="${y - 3}" text-anchor="end">${esc(nm)}</text>`;
  }
  return s;
}

function pinAbs(c, pin) {
  let x = pin.x, y = pin.y;
  if (c.mirror) x = -x;
  const a = ((c.rot || 0) % 360) * Math.PI / 180, co = Math.cos(a), si = Math.sin(a);
  return [r2(c.x + x * co - y * si), r2(c.y + x * si + y * co)];
}
function defPins(c) { const d = SYM[c.kind]; return d ? d.pins(c) : []; }
function compBBox(c) {
  const pts = defPins(c).map(p => pinAbs(c, p));
  if (c.kind === 'ic' || c.kind === 'conn') {
    const g = icGeom(c, c.kind === 'conn'), hw = g.W / 2, hh = g.H / 2;
    [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].forEach(([x, y]) => pts.push(pinAbs(c, { x, y })));
  }
  if (!pts.length) return { x0: c.x - 20, y0: c.y - 20, x1: c.x + 20, y1: c.y + 20 };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  let pt = 8, pb = 8, pl = 8, pr = 8;
  if (c.kind === 'led') { pt = 28; pr = 20; }
  if (c.kind === 'tp') { pt = 10; pb = 12; }
  return { x0: Math.min(...xs) - pl, y0: Math.min(...ys) - pt, x1: Math.max(...xs) + pr, y1: Math.max(...ys) + pb };
}

/* ---------- 工程对象 ---------- */
function newProject(name) {
  return {
    meta: { name: name || '未命名工程', source: '', created: new Date().toISOString().slice(0, 19).replace('T', ' '), ver: 1 },
    components: [], wires: [], junctions: [], labels: [], links: [],
    compStatus: {}, pinChecked: [], disconnected: [],
    image: { src: '', w: 0, h: 0, anchors: {} }
  };
}
function nextRef(p, prefix) {
  if (prefix === '#PWR') {
    let m = 0;
    for (const c of p.components) { const mm = /^#PWR(\d+)$/.exec(c.ref); if (mm) m = Math.max(m, +mm[1]); }
    return '#PWR' + String(m + 1).padStart(2, '0');
  }
  let max = 0;
  const re = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$');
  for (const c of p.components) { const m = re.exec(c.ref); if (m) max = Math.max(max, +m[1]); }
  return prefix + (max + 1);
}
function addComp(p, kind, x, y, extra) {
  const d = SYM[kind];
  const c = Object.assign({ id: uid('c'), kind, x: snapv(x), y: snapv(y), rot: 0, mirror: false }, extra || {});
  if (!c.ref) c.ref = nextRef(p, d.ref);
  if (kind === 'ic') { c.pinCount = c.pinCount || 8; c.part = c.part || 'IC'; }
  if (kind === 'conn') { c.pinCount = c.pinCount || 4; c.part = c.part || 'CN'; }
  if (kind === 'gnd') c.netName = c.netName || 'GND';
  if (kind === 'vcc') c.netName = c.netName || '5V';
  if (!c.part) c.part = d.label;
  p.components.push(c);
  return c;
}
function findComp(p, ref) { return p.components.find(c => c.ref === ref); }
function delComp(p, id) {
  const c = p.components.find(x => x.id === id); if (!c) return;
  p.components = p.components.filter(x => x.id !== id);
  const pre = c.ref + '.';
  p.pinChecked = p.pinChecked.filter(k => !k.startsWith('p:' + pre));
  p.disconnected = p.disconnected.filter(k => !k.startsWith('p:' + pre));
  p.links = p.links.filter(l => !l.a.startsWith(pre) && !l.b.startsWith(pre));
  delete p.compStatus[c.ref];
}

/* ---------- 网络推导 ---------- */
class UF {
  constructor() { this.m = new Map(); }
  find(k) { if (!this.m.has(k)) this.m.set(k, k); let r = k; while (this.m.get(r) !== r) r = this.m.get(r); let c = k; while (this.m.get(c) !== c) { const n = this.m.get(c); this.m.set(c, r); c = n; } return r; }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.m.set(ra, rb); }
}

function onSegStrict(px, py, s) {
  if (Math.abs(s.y1 - s.y2) < 0.5) {
    if (Math.abs(py - s.y1) > 0.5) return false;
    const a = Math.min(s.x1, s.x2), b = Math.max(s.x1, s.x2);
    return px > a + 0.5 && px < b - 0.5;
  }
  if (Math.abs(s.x1 - s.x2) < 0.5) {
    if (Math.abs(px - s.x1) > 0.5) return false;
    const a = Math.min(s.y1, s.y2), b = Math.max(s.y1, s.y2);
    return py > a + 0.5 && py < b - 0.5;
  }
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len2 = dx * dx + dy * dy;
  const t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
  if (t <= 0.01 || t >= 0.99) return false;
  return Math.hypot(s.x1 + t * dx - px, s.y1 + t * dy - py) < 0.8;
}
function segInt(A, B) {
  const dh = (s) => Math.abs(s.y1 - s.y2) < 0.5, dv = (s) => Math.abs(s.x1 - s.x2) < 0.5;
  let H = null, V = null;
  if (dh(A) && dv(B)) { H = A; V = B; } else if (dv(A) && dh(B)) { H = B; V = A; }
  else if (dh(A) && dh(B)) return null; else if (dv(A) && dv(B)) return null;
  else { // 对角兜底
    const d1x = A.x2 - A.x1, d1y = A.y2 - A.y1, d2x = B.x2 - B.x1, d2y = B.y2 - B.y1;
    const den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-9) return null;
    const t = ((B.x1 - A.x1) * d2y - (B.y1 - A.y1) * d2x) / den;
    const u = ((B.x1 - A.x1) * d1y - (B.y1 - A.y1) * d1x) / den;
    if (t <= 0.01 || t >= 0.99 || u <= 0.01 || u >= 0.99) return null;
    return [A.x1 + t * d1x, A.y1 + t * d1y];
  }
  const ax0 = Math.min(H.x1, H.x2), ax1 = Math.max(H.x1, H.x2);
  const by0 = Math.min(V.y1, V.y2), by1 = Math.max(V.y1, V.y2);
  const x = V.x1, y = H.y1;
  if (x > ax0 + 0.5 && x < ax1 - 0.5 && y > by0 + 0.5 && y < by1 - 0.5) return [x, y];
  return null;
}

function deriveNets(p) {
  const uf = new UF();
  const coords = new Map();
  const disc = new Set(p.disconnected || []);
  const addAt = (x, y, id) => {
    const k = rk(x, y);
    if (!coords.has(k)) coords.set(k, []);
    coords.get(k).push(id);
  };
  const pinNodes = [];
  for (const c of p.components) {
    for (const pin of defPins(c)) {
      const key = 'p:' + c.ref + '.' + pin.n;
      const [X, Y] = pinAbs(c, pin);
      const node = {
        id: key, ref: c.ref, num: pin.n, name: pin.name || '', role: pin.role || 'unknown',
        comp: c, kind: c.kind, x: X, y: Y, disconnected: disc.has(key)
      };
      pinNodes.push(node);
      uf.find(key);
      if (!node.disconnected) addAt(X, Y, key);
    }
  }
  const wireMeta = new Map();
  for (const w of p.wires) {
    const vk = [];
    for (let i = 0; i < w.pts.length; i++) {
      const k = 'w:' + w.id + ':' + i; vk.push(k); uf.find(k); addAt(w.pts[i][0], w.pts[i][1], k);
    }
    for (let i = 1; i < vk.length; i++) uf.union(vk[0], vk[i]);
    wireMeta.set(w.id, vk);
  }
  const labelNodes = [];
  for (const lb of (p.labels || [])) {
    const id = 'l:' + lb.id; uf.find(id); addAt(lb.x, lb.y, id);
    labelNodes.push(Object.assign({}, lb, { nid: id }));
  }
  const jset = new Set();
  for (const j of (p.junctions || [])) {
    const k = rk(j.x, j.y); jset.add(k);
    const id = 'j:' + k; uf.find(id); addAt(j.x, j.y, id);
  }
  // 同坐标合并
  for (const [, arr] of coords) for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
  // 线段表
  const segs = [];
  for (const w of p.wires) for (let i = 0; i < w.pts.length - 1; i++) {
    segs.push({ x1: w.pts[i][0], y1: w.pts[i][1], x2: w.pts[i + 1][0], y2: w.pts[i + 1][1], a: 'w:' + w.id + ':' + i, wid: w.id });
  }
  // T 型连接：坐标点落在线段内部 → 连接
  for (const s of segs) {
    for (const [k, ids] of coords) {
      const [xs, ys] = k.split(',').map(Number);
      if (onSegStrict(xs, ys, s)) for (const id of ids) uf.union(id, s.a);
    }
  }
  // 十字交叉：有连接点才连通，否则记录为可疑
  const crossings = [];
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const A = segs[i], B = segs[j];
      if (A.wid === B.wid) continue;
      const ip = segInt(A, B); if (!ip) continue;
      const k = rk(ip[0], ip[1]);
      if (jset.has(k)) { uf.union(A.a, B.a); }
      else crossings.push({ x: r2(ip[0]), y: r2(ip[1]) });
    }
  }
  // 全局电源/地
  const pwr = new Map();
  for (const n of pinNodes) {
    const d = SYM[n.comp.kind]; if (!d || !d.global) continue;
    const nm = String(n.comp.netName || d.defNet || '').trim();
    const key = 'PWR:' + nm;
    if (!pwr.has(key)) pwr.set(key, []);
    pwr.get(key).push(n.id);
  }
  for (const arr of pwr.values()) for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
  // 虚拟连接
  for (const l of (p.links || [])) { uf.union('p:' + l.a, 'p:' + l.b); }

  // 组装
  const groups = new Map();
  const touch = id => {
    const root = uf.find(id);
    if (!groups.has(root)) groups.set(root, { root, pins: [], labels: [], wires: new Set(), hasJunction: false, linked: false });
    return groups.get(root);
  };
  for (const n of pinNodes) touch(n.id).pins.push(n);
  for (const lb of labelNodes) touch(lb.nid).labels.push(lb);
  for (const w of p.wires) touch(wireMeta.get(w.id)[0]).wires.add(w.id);
  for (const l of (p.links || [])) touch('p:' + l.a).linked = true;
  for (const j of (p.junctions || [])) { const g = groups.get(uf.find('j:' + rk(j.x, j.y))); if (g) g.hasJunction = true; }

  const nets = [];
  let autoIdx = 0;
  for (const g of groups.values()) {
    const names = [];
    for (const lb of g.labels) if (lb.text) names.push(String(lb.text).trim());
    const power = [];
    for (const pn of g.pins) {
      const dd = SYM[pn.comp.kind];
      if (dd && dd.global) { const nm = String(pn.comp.netName || dd.defNet || '').trim(); if (nm) { power.push(nm); } }
    }
    for (const nm of power) names.push(nm);
    const uniq = [...new Set(names.filter(Boolean))];
    let name, nameExplicit = true;
    if (uniq.length === 1) name = uniq[0];
    else if (uniq.length > 1) { name = uniq[0]; nameExplicit = true; }
    else {
      nameExplicit = false; autoIdx++;
      const mem = g.pins.slice().sort((a, b) => (a.ref + a.num).localeCompare(b.ref + b.num));
      name = mem.length ? 'N_' + mem[0].ref + '-' + mem[0].num : 'N_导线' + autoIdx;
    }
    const members = g.pins.map(pn => ({
      key: pn.id, ref: pn.ref, num: pn.num, name: pn.name, role: pn.role, x: pn.x, y: pn.y,
      kind: pn.kind, disconnected: pn.disconnected, isPower: !!(SYM[pn.comp.kind] && SYM[pn.comp.kind].global)
    })).sort((a, b) => (a.ref + a.num).localeCompare(b.ref + b.num));
    const checkedCount = g.pins.filter(pn => (p.pinChecked || []).includes(pn.id)).length;
    const net = {
      key: g.root, name, names: uniq, nameExplicit, members,
      labels: g.labels.map(l => ({ id: l.id, text: l.text, x: l.x, y: l.y })),
      wires: [...g.wires], hasJunction: g.hasJunction, linked: g.linked,
      power: [...new Set(power)],
      status: !g.pins.length ? 'empty' : (checkedCount === g.pins.length ? 'checked' : (checkedCount ? 'partial' : 'unknown')),
      checkedCount
    };
    nets.push(net);
  }
  nets.sort((a, b) => {
    const pa = a.power.length ? 0 : 1, pb = b.power.length ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  const pinNet = new Map(), wireNet = new Map();
  for (const net of nets) {
    for (const m of net.members) pinNet.set(m.key, net);
    for (const wid of net.wires) wireNet.set(wid, net);
  }
  return { nets, pinNodes, pinNet, wireNet, crossings };
}

/* ---------- ERC ---------- */
function runERC(p, d) {
  d = d || deriveNets(p);
  const out = [];
  const add = (level, code, msg, focus) => out.push({ level, code, msg, focus: focus || null });
  const refs = new Map();
  for (const c of p.components) refs.set(c.ref, (refs.get(c.ref) || 0) + 1);
  for (const [r, n] of refs) if (n > 1) add('error', 'E4', `位号重复：${r} 出现 ${n} 次`, { type: 'ref', ref: r });

  for (const net of d.nets) {
    const mem = net.members;
    if (!mem.length) {
      if (net.wires.length) add('error', 'E2', `导线未连接任何引脚（${net.wires.length} 段）`, { type: 'net', name: net.name });
      continue;
    }
    if (mem.length === 1) {
      const m = mem[0];
      if (m.disconnected) add('info', 'E1', `${m.ref}.${m.num} 已人工标记为“不连接”`, { type: 'pin', ref: m.ref, num: m.num });
      else if (m.isPower) add('error', 'E8', `电源/地符号 ${m.ref}（${net.name}）孤立，未连接任何其他引脚`, { type: 'pin', ref: m.ref, num: m.num });
      else add('error', 'E1', `悬空引脚：${m.ref}.${m.num}${m.name ? '(' + m.name + ')' : ''} 所在网络仅此一个节点`, { type: 'pin', ref: m.ref, num: m.num });
    }
    if (net.names.length > 1) add('error', 'E7', `命名冲突：同一网络上有多个名称 [${net.names.join(' / ')}]`, { type: 'net', name: net.name });
    if (!net.nameExplicit && mem.length > 1) add('info', 'E3', `网络未命名（自动名 ${net.name}），建议加网络标签`, { type: 'net', name: net.name });
    if (net.power.length > 1) add('error', 'E5', `电源域混接：同一网络出现多个电源名 [${net.power.join(' / ')}]`, { type: 'net', name: net.name });
    const outs = mem.filter(m => m.role === 'out');
    if (outs.length > 1) add('error', 'E6', `驱动冲突：网络 ${net.name} 上有 ${outs.length} 个输出引脚（${outs.map(o => o.ref + '.' + o.num).join(', ')}）`, { type: 'net', name: net.name });
    if (net.linked) add('info', 'E10', `网络 ${net.name} 含虚拟连接（图上无走线，靠逻辑声明连接）`, { type: 'net', name: net.name });
  }
  for (const c of d.crossings) add('warn', 'E11', `十字交叉未加连接点 @(${c.x},${c.y})，已按“不连接”处理——若实际相连请加连接点`, { type: 'xy', x: c.x, y: c.y });
  const unknown = d.pinNodes.filter(n => !(p.pinChecked || []).includes(n.id)).length;
  if (unknown) add('info', 'E0', `还有 ${unknown} 个引脚未人工确认（${d.nets.filter(n => n.status !== 'checked').length} 个网络）`, null);
  return { findings: out, crossings: d.crossings, unknownPins: unknown };
}

function stats(p, d) {
  d = d || deriveNets(p);
  return {
    comps: p.components.length, wires: p.wires.length, nets: d.nets.length,
    pins: d.pinNodes.length,
    checkedPins: d.pinNodes.filter(n => (p.pinChecked || []).includes(n.id)).length,
    checkedNets: d.nets.filter(n => n.status === 'checked').length
  };
}

/* ---------- 导出 ---------- */
function netlistData(p) {
  const d = deriveNets(p);
  const erc = runERC(p, d);
  const st = stats(p, d);
  return {
    meta: {
      name: p.meta.name, created: p.meta.created, source: p.meta.source,
      tool: 'schematic-bench/0.1', status: 'draft（位图识别 + 人工复核）'
    },
    stats: st,
    components: p.components.map(c => ({
      ref: c.ref, kind: c.kind, part: c.part || '', checked: !!p.compStatus[c.ref],
      pins: defPins(c).map(pin => ({ num: pin.n, name: pin.name || '', role: pin.role || 'unknown' }))
    })),
    nets: d.nets.map(n => ({
      name: n.name, names: n.names, status: n.status,
      power: n.power, hasJunction: n.hasJunction, virtualLink: n.linked,
      members: n.members.map(m => m.ref + '.' + m.num),
      labels: n.labels.map(l => l.text)
    })),
    links: (p.links || []).map(l => ({ from: l.a, to: l.b, note: l.note || '' })),
    erc: erc.findings,
    review: {
      pinsTotal: st.pins, pinsChecked: st.checkedPins,
      netsTotal: st.nets, netsChecked: st.checkedNets,
      notConnectedPins: (p.disconnected || []).map(k => k.replace(/^p:/, ''))
    }
  };
}
function netlistMarkdown(p) {
  const nl = netlistData(p);
  let s = `# ${nl.meta.name} — 网表（${nl.meta.status}）\n\n`;
  s += `- 生成：schematic-bench/0.1 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}\n`;
  s += `- 统计：元件 ${nl.stats.comps} / 网络 ${nl.stats.nets} / 引脚 ${nl.stats.pins}（已确认 ${nl.stats.checkedPins}）\n\n`;
  s += `## 元件\n\n| 位号 | 类型 | 型号/值 | 引脚 | 已确认 |\n|---|---|---|---|---|\n`;
  for (const c of nl.components) s += `| ${c.ref} | ${c.kind} | ${c.part} | ${c.pins.map(x => x.num + (x.name ? '(' + x.name + ')' : '')).join(', ')} | ${c.checked ? '✓' : ''} |\n`;
  s += `\n## 网络\n\n| 网络名 | 状态 | 成员 |\n|---|---|---|\n`;
  for (const n of nl.nets) s += `| ${n.name} | ${n.status} | ${n.members.join(', ')} |\n`;
  if (nl.links.length) {
    s += `\n## 虚拟连接（图上无走线）\n\n`;
    for (const l of nl.links) s += `- ${l.from} ↔ ${l.to}${l.note ? '  // ' + l.note : ''}\n`;
  }
  s += `\n## ERC 检查\n\n`;
  if (!nl.erc.length) s += `无问题。\n`;
  for (const f of nl.erc) s += `- [${f.level.toUpperCase()}] ${f.code} ${f.msg}\n`;
  return s;
}
function projectJSON(p) {
  const cp = JSON.parse(JSON.stringify(p));
  cp.image = { src: '', w: cp.image.w, h: cp.image.h, anchors: cp.image.anchors || {} };
  cp.exportedAt = new Date().toISOString();
  return JSON.stringify(cp, null, 1);
}

/* ---------- 演示工程 ---------- */
function demoProject() {
  const p = newProject('Demo — 5V 分压采样 + MOSFET 驱动');
  p.meta.source = '内置示例：演示「待确认 / 交叉未连接 / 虚拟连接」三种复核场景';
  const C = (ref, kind, x, y, o) => { const c = addComp(p, kind, x, y, Object.assign({ ref }, o || {})); return c; };
  // 电源 + 分压
  C('#PWR01', 'vcc', 140, 80, { netName: '5V', part: '5V' });
  C('R1', 'res', 140, 160, { rot: 90, part: '10k' });
  C('C1', 'cap', 240, 260, { rot: 90, part: '100nF' });
  C('R2', 'res', 360, 260, { rot: 90, part: '3k3' });
  C('#PWR02', 'gnd', 240, 340, { netName: 'GND' });
  C('#PWR03', 'gnd', 360, 340, { netName: 'GND' });
  // MCU
  C('U1', 'ic', 600, 300, { pinCount: 8, part: 'MCU-8', pinNames: { 1: 'ADC', 5: 'VSS', 8: 'VDD', 6: 'GPIO', 7: 'IO7', 4: 'IO4', 2: 'IO2', 3: 'IO3' } });
  C('#PWR04', 'vcc', 740, 240, { netName: '5V' });
  C('#PWR05', 'gnd', 740, 380, { netName: 'GND' });
  // 连接器
  C('J1', 'conn', 920, 200, { pinCount: 4, part: 'CN-4' });
  C('#PWR06', 'vcc', 840, 120, { netName: '5V' });
  C('#PWR07', 'gnd', 790, 240, { netName: 'GND' });
  // 测试点（演示「交叉但不连接」）
  C('TP1', 'tp', 300, 120, { part: 'TP' });
  C('#PWR08', 'gnd', 300, 360, { netName: 'GND' });
  // 驱动级
  C('R3', 'res', 800, 420, { part: '100R' });
  C('Q1', 'mos', 1040, 470, { part: 'NMOS' });
  C('R4', 'res', 1060, 310, { rot: 90, part: '1k' });
  C('D1', 'led', 1060, 390, { rot: 90, part: 'LED-R' });
  C('#PWR09', 'vcc', 1060, 230, { netName: '5V' });
  C('#PWR10', 'gnd', 1060, 560, { netName: 'GND' });
  // 下拉电阻（演示虚拟连接）
  C('R5', 'res', 980, 640, { part: '10k' });

  const W = (pts) => p.wires.push({ id: uid('w'), pts });
  // 5V → R1
  W([[140, 80], [140, 120]]);
  // 节点 A：R1 下 → U1.1（ADC）
  W([[140, 200], [460, 200], [460, 270], [520, 270]]);
  // C1 上端 / R2 上端 接入节点 A
  W([[240, 200], [240, 220]]);
  W([[360, 200], [360, 220]]);
  p.junctions.push({ id: uid('j'), x: 240, y: 200 }, { id: uid('j'), x: 360, y: 200 });
  // C1 / R2 下端 → GND
  W([[240, 300], [240, 340]]);
  W([[360, 300], [360, 340]]);
  // U1 电源
  W([[680, 270], [740, 270], [740, 240]]);
  W([[680, 330], [740, 330], [740, 380]]);
  // J1（连接器：1=5V 2=GND 3=SIG_A→U1.7 4=SIG_B→U1.4）
  W([[840, 120], [840, 170]]);
  W([[840, 190], [790, 190], [790, 240]]);
  W([[840, 210], [810, 210], [810, 290], [680, 290]]);
  W([[840, 230], [830, 230], [830, 450], [480, 450], [480, 330], [520, 330]]);
  // 交叉但不连接：TP1 的线垂直穿过节点 A 的线，无连接点
  W([[300, 120], [300, 360]]);
  // 驱动：U1.6 → R3 → Q1.G
  W([[680, 310], [750, 310], [750, 420], [760, 420]]);
  W([[840, 420], [1000, 420], [1000, 470]]);
  // Q1.S → GND
  W([[1060, 510], [1060, 560]]);
  // Q1.D 与 D1.K 同坐标直连；D1.A 与 R4.2 同坐标直连 → 无需走线
  W([[1060, 270], [1060, 230]]);
  // 虚拟连接：R5 下拉到 GND（原图上未画出走线，仅逻辑声明）
  p.links.push({ id: uid('l'), a: 'R5.1', b: 'R3.2', note: '识别缺失：R5 实为栅极下拉' });
  p.links.push({ id: uid('l'), a: 'R5.2', b: '#PWR10.1', note: 'R5 另一端接 GND' });
  // 复核状态示例：只确认了电源与地网络
  const d0 = deriveNets(p);
  for (const n of d0.nets) if (n.power.length) n.members.forEach(m => p.pinChecked.push(m.key));
  return p;
}
