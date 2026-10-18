/* app.js — 交互、表格联动、导入导出、自检 */
'use strict';

const $ = s => document.querySelector(s);
const LSKEY = 'schematic-bench/project/v1';

const S = {
  project: null, d: null, erc: null,
  selection: {}, tool: 'select', tab: 'nets',
  view: { tx: 90, ty: 70, k: 1 },
  showGrid: true, preview: null, drawPts: [],
  hoverNet: null, spaceDown: false, drag: null, imgZoom: 1, imgMode: false
};

/* ================= 通用 ================= */
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms || 2200);
}
function download(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}
function autosave() {
  try { localStorage.setItem(LSKEY, JSON.stringify(S.project)); } catch (e) { }
}

/* ================= 渲染 ================= */
function renderAll() {
  const p = S.project;
  const d = S.d = deriveNets(p);
  const erc = S.erc = runERC(p, d);
  $('#canvasHost').innerHTML = renderSVG(p, d, erc, {
    selection: S.selection, hoverNet: S.hoverNet, showGrid: S.showGrid, preview: S.preview
  });
  applyView();
  renderPanel();
  renderStatus();
  autosave();
}
function applyView() {
  const w = document.getElementById('world');
  if (w) w.setAttribute('transform', `translate(${S.view.tx},${S.view.ty}) scale(${S.view.k})`);
}
function renderPanel() {
  const pc = $('#panelContent'); if (!pc) return;
  const p = S.project, d = S.d, erc = S.erc;
  if (S.tab === 'props') pc.innerHTML = renderProps(p, d, S);
  else if (S.tab === 'nets') pc.innerHTML = renderNetTable(p, d, erc, S);
  else if (S.tab === 'comps') pc.innerHTML = renderCompTable(p);
  else pc.innerHTML = renderERCPanel(erc);
  document.querySelectorAll('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
}
function renderStatus() {
  const st = stats(S.project, S.d);
  const errs = S.erc.findings.filter(f => f.level === 'error').length;
  const warns = S.erc.findings.filter(f => f.level === 'warn').length;
  $('#status').innerHTML = `
    <span>元件 <b>${st.comps}</b></span><span>导线 <b>${st.wires}</b></span>
    <span>网络 <b>${st.nets}</b></span>
    <span>引脚确认 <b>${st.checkedPins}/${st.pins}</b></span>
    <span class="${errs ? 'bad' : 'good'}">ERC 错误 <b>${errs}</b></span>
    <span class="${warns ? 'warn' : ''}">警告 <b>${warns}</b></span>
    <span class="right">缩放 <b>${Math.round(S.view.k * 100)}%</b> · 工具 <b>${toolName(S.tool)}</b></span>`;
  document.querySelectorAll('.tabbtn').forEach(b => {
    if (b.dataset.tab === 'erc') b.textContent = `检查 ${errs + warns ? '(' + (errs + warns) + ')' : ''}`;
    if (b.dataset.tab === 'nets') b.textContent = `网络 ${stats(S.project, S.d).nets}`;
  });
}
function toolName(t) { return ({ select: '选择', wire: '连线', junction: '连接点', label: '网络标签', pan: '平移', markup: '标原图' })[t] || t; }

/* ================= 坐标 ================= */
function toWorld(e) {
  const svg = document.getElementById('svg');
  if (!svg) return [0, 0];
  const r = svg.getBoundingClientRect();
  return [(e.clientX - r.left - S.view.tx) / S.view.k, (e.clientY - r.top - S.view.ty) / S.view.k];
}
function contentBBox() {
  const p = S.project;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const c of p.components) { const b = compBBox(c); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  for (const w of p.wires) for (const pt of w.pts) { x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]); x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]); }
  if (x0 > x1) return { x: 0, y: 0, w: 800, h: 600 };
  const pad = 50;
  return { x: Math.round(x0 - pad), y: Math.round(y0 - pad), w: Math.round(x1 - x0 + pad * 2), h: Math.round(y1 - y0 + pad * 2) };
}
function fitView() {
  const b = contentBBox();
  const host = $('#canvasHost');
  const W = host.clientWidth || 900, H = host.clientHeight || 600;
  const k = Math.min(W / b.w, H / b.h, 1.4);
  S.view.k = Math.max(0.2, k);
  S.view.tx = (W - b.w * S.view.k) / 2 - b.x * S.view.k;
  S.view.ty = (H - b.h * S.view.k) / 2 - b.y * S.view.k;
  applyView();
}
function centerOn(x, y) {
  const host = $('#canvasHost');
  const W = host.clientWidth || 900, H = host.clientHeight || 600;
  S.view.tx = W / 2 - x * S.view.k;
  S.view.ty = H / 2 - y * S.view.k;
  applyView();
}
function nearestPin(x, y, max) {
  let best = null, bd = max || 14;
  for (const n of S.d.pinNodes) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < bd) { bd = dd; best = n; } }
  return best ? [best.x, best.y] : null;
}
function snapPt(x, y) {
  const hit = nearestPin(x, y, 14);
  if (hit) return hit;
  return [snapv(x), snapv(y)];
}

/* ================= 画布交互 ================= */
function bindCanvas() {
  const host = $('#canvasHost');
  host.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('dblclick', onDbl);
  host.addEventListener('contextmenu', e => e.preventDefault());
}

function onDown(e) {
  if (e.button === 2) return;
  const svg = document.getElementById('svg'); if (!svg) return;
  const wp = toWorld(e);
  if (e.button === 1 || S.spaceDown || S.tool === 'pan') {
    S.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: S.view.tx, ty: S.view.ty };
    e.preventDefault(); return;
  }
  const hit = e.target.closest('[data-type]');
  const type = hit ? hit.dataset.type : null;

  if (S.tool === 'wire') { wireClick(wp); return; }
  if (S.tool === 'junction') { toggleJunction(wp); return; }
  if (S.tool === 'label') { addLabelAt(wp); return; }
  if (!type) { S.selection = {}; renderAll(); return; }

  if (type === 'comp') {
    const c = S.project.components.find(x => x.id === hit.dataset.id); if (!c) return;
    S.selection = { type: 'comp', id: c.id };
    S.drag = { mode: 'move', kind: 'comp', id: c.id, sx: wp[0], sy: wp[1], ox: c.x, oy: c.y, moved: false };
    renderAll(); return;
  }
  if (type === 'pin') {
    S.selection = { type: 'pin', ref: hit.dataset.ref, num: hit.dataset.num };
    renderAll(); return;
  }
  if (type === 'wire') {
    const w = S.project.wires.find(x => x.id === hit.dataset.id); if (!w) return;
    S.selection = { type: 'wire', id: w.id };
    S.drag = { mode: 'movewire', id: w.id, sx: wp[0], sy: wp[1], pts: w.pts.map(p => [p[0], p[1]]), moved: false };
    renderAll(); return;
  }
  if (type === 'vhandle') {
    S.drag = { mode: 'vertex', id: hit.dataset.id, idx: +hit.dataset.idx, moved: false };
    return;
  }
  if (type === 'junction') {
    const j = S.project.junctions.find(x => x.id === hit.dataset.id); if (!j) return;
    S.selection = { type: 'junction', id: j.id };
    S.drag = { mode: 'move', kind: 'junction', id: j.id, sx: wp[0], sy: wp[1], ox: j.x, oy: j.y };
    renderAll(); return;
  }
  if (type === 'label') {
    const lb = S.project.labels.find(x => x.id === hit.dataset.id); if (!lb) return;
    S.selection = { type: 'label', id: lb.id };
    S.drag = { mode: 'move', kind: 'label', id: lb.id, sx: wp[0], sy: wp[1], ox: lb.x, oy: lb.y };
    renderAll(); return;
  }
  if (type === 'link') { S.selection = { type: 'link', id: hit.dataset.id }; renderAll(); return; }
  if (type === 'errmark') { centerOn(+hit.dataset.x, +hit.dataset.y); return; }
}

function onMove(e) {
  const d = S.drag;
  if (S.tool === 'wire' && S.drawPts.length && !d) {
    const wp = snapPt.apply(null, toWorld(e));
    S.preview = S.drawPts.concat(orthoTo(S.drawPts[S.drawPts.length - 1], wp, nextFirstHoriz()));
    renderAll(); return;
  }
  if (!d) return;
  if (d.mode === 'pan') {
    S.view.tx = d.tx + (e.clientX - d.sx); S.view.ty = d.ty + (e.clientY - d.sy); applyView(); return;
  }
  const wp = toWorld(e);
  const dx = wp[0] - d.sx, dy = wp[1] - d.sy;
  if (d.mode === 'move' && d.kind === 'comp') {
    const c = S.project.components.find(x => x.id === d.id); if (!c) return;
    let nx = d.ox + dx, ny = d.oy + dy;
    const pin = nearestPin(nx, ny, 10);
    if (pin) { nx = pin[0]; ny = pin[1]; } else { nx = snapv(nx); ny = snapv(ny); }
    if (nx !== c.x || ny !== c.y) { c.x = nx; c.y = ny; d.moved = true; renderAll(); }
    return;
  }
  if (d.mode === 'move' && (d.kind === 'junction' || d.kind === 'label')) {
    const arr = d.kind === 'junction' ? S.project.junctions : S.project.labels;
    const it = arr.find(x => x.id === d.id); if (!it) return;
    it.x = snapv(d.ox + dx); it.y = snapv(d.oy + dy); renderAll(); return;
  }
  if (d.mode === 'movewire') {
    const w = S.project.wires.find(x => x.id === d.id); if (!w) return;
    const gx = snapv(dx), gy = snapv(dy);
    if (gx || gy) { w.pts = d.pts.map(pt => [pt[0] + gx, pt[1] + gy]); d.moved = true; renderAll(); }
    return;
  }
  if (d.mode === 'vertex') {
    const w = S.project.wires.find(x => x.id === d.id); if (!w) return;
    const sp = snapPt(wp[0], wp[1]);
    w.pts[d.idx] = sp; d.moved = true; renderAll(); return;
  }
}
function onUp() { if (S.drag) { S.drag = null; } }

function onWheel(e) {
  e.preventDefault();
  const r = document.getElementById('svg').getBoundingClientRect();
  const mx = e.clientX - r.left, my = e.clientY - r.top;
  const old = S.view.k;
  const k = Math.min(3, Math.max(0.2, old * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
  S.view.tx = mx - (mx - S.view.tx) * k / old;
  S.view.ty = my - (my - S.view.ty) * k / old;
  S.view.k = k; applyView(); renderStatus();
}

function onDbl(e) {
  const hit = e.target.closest('[data-type="wire"]');
  if (hit) { splitWire(hit.dataset.id, null); return; }
  if (S.tool === 'wire') finishWire();
}

/* ---------- 连线 ---------- */
function nextFirstHoriz() {
  const n = S.drawPts.length;
  if (n < 2) return true;
  const a = S.drawPts[n - 2], b = S.drawPts[n - 1];
  return !(a[1] === b[1]); // 上一段水平 → 本段先竖
}
function orthoTo(last, cur, firstHoriz) {
  if (last[0] === cur[0] || last[1] === cur[1]) return [cur];
  return firstHoriz ? [[cur[0], last[1]], cur] : [[last[0], cur[1]], cur];
}
function wireClick(wp) {
  let pt = snapPt(wp[0], wp[1]);
  if (!S.drawPts.length) { S.drawPts.push(pt); S.preview = [pt, pt]; renderAll(); return; }
  const last = S.drawPts[S.drawPts.length - 1];
  const firstHoriz = (last[0] === pt[0] || last[1] === pt[1]) ? null : nextFirstHoriz();
  const add = firstHoriz === null ? [pt] : orthoTo(last, pt, firstHoriz);
  for (const q of add) { const l = S.drawPts[S.drawPts.length - 1]; if (l[0] !== q[0] || l[1] !== q[1]) S.drawPts.push(q); }
  S.preview = S.drawPts.slice(); renderAll();
}
function finishWire() {
  const pts = S.drawPts.filter((pt, i, arr) => i === 0 || pt[0] !== arr[i - 1][0] || pt[1] !== arr[i - 1][1]);
  S.drawPts = []; S.preview = null;
  if (pts.length < 2) { renderAll(); return; }
  const w = { id: uid('w'), pts };
  S.project.wires.push(w);
  autoJunctions(pts);
  S.selection = { type: 'wire', id: w.id };
  renderAll();
}
function autoJunctions(pts) {
  for (const pt of pts) {
    for (const s of allSegs()) {
      if (s.wid === undefined) continue;
      if (onSegStrict(pt[0], pt[1], s) && !hasJunction(pt[0], pt[1])) {
        S.project.junctions.push({ id: uid('j'), x: pt[0], y: pt[1] });
      }
    }
  }
}
function allSegs() {
  const out = [];
  for (const w of S.project.wires) for (let i = 0; i < w.pts.length - 1; i++) {
    out.push({ x1: w.pts[i][0], y1: w.pts[i][1], x2: w.pts[i + 1][0], y2: w.pts[i + 1][1], wid: w.id });
  }
  return out;
}
function hasJunction(x, y) { return S.project.junctions.some(j => Math.abs(j.x - x) < 1 && Math.abs(j.y - y) < 1); }
function toggleJunction(wp) {
  const pt = [snapv(wp[0]), snapv(wp[1])];
  const i = S.project.junctions.findIndex(j => Math.abs(j.x - pt[0]) < 6 && Math.abs(j.y - pt[1]) < 6);
  if (i >= 0) S.project.junctions.splice(i, 1);
  else S.project.junctions.push({ id: uid('j'), x: pt[0], y: pt[1] });
  renderAll();
}
function addLabelAt(wp) {
  const pt = [snapv(wp[0]), snapv(wp[1])];
  const txt = prompt('网络标签名称（例如 KL30 / CAN_H / N_ADC）：', '');
  if (!txt) return;
  S.project.labels.push({ id: uid('l'), x: pt[0], y: pt[1], text: txt.trim() });
  renderAll();
}
function splitWire(id, atPoint) {
  const w = S.project.wires.find(x => x.id === id); if (!w) return;
  if (w.pts.length < 2) return;
  let mid = atPoint;
  if (!mid) {
    // 取最长段中点
    let best = 0, bi = 0;
    for (let i = 0; i < w.pts.length - 1; i++) {
      const len = Math.hypot(w.pts[i + 1][0] - w.pts[i][0], w.pts[i + 1][1] - w.pts[i][1]);
      if (len > best) { best = len; bi = i; }
    }
    const a = w.pts[bi], b = w.pts[bi + 1];
    mid = [snapv((a[0] + b[0]) / 2), snapv((a[1] + b[1]) / 2)];
    if (mid[0] === a[0] && mid[1] === a[1]) mid = [a[0] + Math.sign(b[0] - a[0]) * 10, a[1] + Math.sign(b[1] - a[1]) * 10];
    const left = w.pts.slice(0, bi + 1).concat([mid]);
    const right = [mid].concat(w.pts.slice(bi + 1));
    w.pts = left;
    S.project.wires.push({ id: uid('w'), pts: right });
  } else {
    const i = w.pts.findIndex(pt => pt[0] === mid[0] && pt[1] === mid[1]);
    const idx = i >= 0 ? i : 1;
    const left = w.pts.slice(0, idx + 1), right = w.pts.slice(idx);
    w.pts = left; S.project.wires.push({ id: uid('w'), pts: right });
  }
  if (!hasJunction(mid[0], mid[1])) S.project.junctions.push({ id: uid('j'), x: mid[0], y: mid[1] });
  toast('已在该处断开成两段（连接点已加，若不应连接请删除连接点）');
  renderAll();
}

/* ---------- 键盘 ---------- */
function onKeyDown(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (e.code === 'Space') { S.spaceDown = true; e.preventDefault(); return; }
  if (e.key === 'Escape') {
    S.drawPts = []; S.preview = null; S.selection = {}; setTool('select'); renderAll(); return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelection(); e.preventDefault(); return; }
  if (e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'r') { rotateSel(); }
  else if (k === 'm') { mirrorSel(); }
  else if (k === 'w') { setTool('wire'); }
  else if (k === 'j') { setTool('junction'); }
  else if (k === 'l') { setTool('label'); }
  else if (k === 'v') { setTool('select'); }
  else if (k === 'g') { S.showGrid = !S.showGrid; renderAll(); }
  else if (k === '+' || k === '=') { S.view.k = Math.min(3, S.view.k * 1.15); applyView(); renderStatus(); }
  else if (k === '-') { S.view.k = Math.max(0.2, S.view.k / 1.15); applyView(); renderStatus(); }
  else if (k === 'f') { fitView(); }
  else if (e.key === 'Enter') { if (S.tool === 'wire') finishWire(); }
}
function setTool(t) {
  S.tool = t;
  document.querySelectorAll('.toolbtn').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  if (t !== 'wire') { S.drawPts = []; S.preview = null; }
  renderAll();
}
function rotateSel() {
  const s = S.selection;
  if (s.type === 'comp') { const c = S.project.components.find(x => x.id === s.id); if (c) { c.rot = ((c.rot || 0) + 90) % 360; renderAll(); } }
}
function mirrorSel() {
  const s = S.selection;
  if (s.type === 'comp') { const c = S.project.components.find(x => x.id === s.id); if (c) { c.mirror = !c.mirror; renderAll(); } }
}
function deleteSelection() {
  const s = S.selection; const p = S.project;
  if (s.type === 'comp') { delComp(p, s.id); }
  else if (s.type === 'wire') { p.wires = p.wires.filter(w => w.id !== s.id); }
  else if (s.type === 'junction') { p.junctions = p.junctions.filter(j => j.id !== s.id); }
  else if (s.type === 'label') { p.labels = p.labels.filter(l => l.id !== s.id); }
  else if (s.type === 'link') { p.links = p.links.filter(l => l.id !== s.id); }
  else return;
  S.selection = {}; renderAll();
}

/* ================= 面板动作 ================= */
function handleAct(act, el, isChange) {
  const p = S.project;
  switch (act) {
    case 'focuscomp': { const c = p.components.find(x => x.id === el.dataset.id); if (c) { S.selection = { type: 'comp', id: c.id }; centerOn(c.x, c.y); renderAll(); } break; }
    case 'focuspin': {
      const ref = el.dataset.ref, num = el.dataset.num;
      S.selection = { type: 'pin', ref, num };
      const n = S.d.pinNodes.find(x => x.ref === ref && x.num === num);
      if (n) centerOn(n.x, n.y);
      renderAll(); break;
    }
    case 'disconnect': {
      const key = 'p:' + el.dataset.ref + '.' + el.dataset.num;
      const i = p.disconnected.indexOf(key);
      if (i >= 0) p.disconnected.splice(i, 1); else p.disconnected.push(key);
      renderAll(); break;
    }
    case 'checknet': {
      const net = S.d.nets.find(n => n.key === el.dataset.key); if (!net) break;
      for (const m of net.members) if (!p.pinChecked.includes(m.key)) p.pinChecked.push(m.key);
      renderAll(); break;
    }
    case 'checkpin': {
      const key = 'p:' + el.dataset.ref + '.' + el.dataset.num;
      if (!p.pinChecked.includes(key)) p.pinChecked.push(key); else p.pinChecked = p.pinChecked.filter(k => k !== key);
      renderAll(); break;
    }
    case 'focusnet': {
      const net = S.d.nets.find(n => n.key === el.dataset.key); if (!net) break;
      S.hoverNet = (S.hoverNet === net.key ? null : net.key);
      const m = net.members[0]; if (m) centerOn(m.x, m.y);
      renderAll(); break;
    }
    case 'focuserc': {
      let f = null; try { f = JSON.parse(el.dataset.f); } catch (e) { }
      if (!f) break;
      if (f.type === 'pin') { const n = S.d.pinNodes.find(x => x.ref === f.ref && x.num === f.num); if (n) { S.selection = { type: 'pin', ref: f.ref, num: f.num }; centerOn(n.x, n.y); } }
      if (f.type === 'xy') centerOn(f.x, f.y);
      if (f.type === 'net') { const net = S.d.nets.find(n => n.name === f.name); if (net && net.members[0]) { S.hoverNet = net.key; centerOn(net.members[0].x, net.members[0].y); } }
      renderAll(); break;
    }
    case 'rename': {
      if (!isChange) break;
      const net = S.d.nets.find(n => n.key === el.dataset.key); if (!net) break;
      const v = el.value.trim(); if (!v || v === net.name) { el.value = net.name; break; }
      const existing = (p.labels || []).find(l => l.id === (net.labels[0] || {}).id);
      if (existing) existing.text = v;
      else { const m = net.members[0]; if (m) p.labels.push({ id: uid('l'), x: m.x, y: m.y, text: v }); }
      renderAll(); break;
    }
    case 'editpart': {
      if (!isChange) break;
      const c = p.components.find(x => x.id === el.dataset.id); if (!c) break;
      c.part = el.value; renderAll(); break;
    }
    case 'editref': {
      if (!isChange) break;
      const c = p.components.find(x => x.id === el.dataset.id); if (!c) break;
      const nv = el.value.trim();
      if (!nv || !/^[A-Za-z#][A-Za-z0-9#_]*$/.test(nv)) { toast('位号格式非法'); el.value = c.ref; break; }
      if (p.components.some(x => x !== c && x.ref === nv)) { toast('位号已存在'); el.value = c.ref; break; }
      renameRef(c, nv); renderAll(); break;
    }
    case 'setnetname': {
      if (!isChange) break;
      const c = p.components.find(x => x.id === el.dataset.id); if (!c) break;
      c.netName = el.value.trim() || 'GND'; renderAll(); break;
    }
    case 'setpincount': {
      if (!isChange) break;
      const c = p.components.find(x => x.id === el.dataset.id); if (!c) break;
      c.pinCount = Math.max(2, Math.min(40, +el.value || 8));
      p.pinChecked = p.pinChecked.filter(k => { const [, ref, num] = /^p:(.+)\.([^.]+)$/.exec(k) || []; return ref !== c.ref || +num <= c.pinCount; });
      renderAll(); break;
    }
    case 'setpinnames': {
      if (!isChange) break;
      const c = p.components.find(x => x.id === el.dataset.id); if (!c) break;
      const map = {};
      el.value.split(/[,，;]/).forEach(s => { const m = /^\s*(\d+)\s*[:：=]\s*(.+?)\s*$/.exec(s); if (m) map[m[1]] = m[2]; });
      c.pinNames = map; renderAll(); break;
    }
    case 'editlabel': {
      if (!isChange) break;
      const lb = p.labels.find(x => x.id === el.dataset.id); if (!lb) break;
      lb.text = el.value.trim(); renderAll(); break;
    }
    case 'rot': rotateSel(); break;
    case 'mirror': mirrorSel(); break;
    case 'delcomp': delComp(p, el.dataset.id); S.selection = {}; renderAll(); break;
    case 'delwire': p.wires = p.wires.filter(w => w.id !== el.dataset.id); S.selection = {}; renderAll(); break;
    case 'deljunction': p.junctions = p.junctions.filter(j => j.id !== el.dataset.id); S.selection = {}; renderAll(); break;
    case 'dellabel': p.labels = p.labels.filter(l => l.id !== el.dataset.id); S.selection = {}; renderAll(); break;
    case 'splitwire': splitWire(el.dataset.id, null); break;
    case 'confirmcomp': { const c = p.components.find(x => x.id === el.dataset.id); if (!c) break; p.compStatus[c.ref] = !p.compStatus[c.ref]; renderAll(); break; }
  }
}
function renameRef(c, nv) {
  const old = c.ref, pre = 'p:' + old + '.';
  const map = k => k.startsWith(pre) ? 'p:' + nv + '.' + k.slice(pre.length) : k;
  S.project.pinChecked = S.project.pinChecked.map(map);
  S.project.disconnected = S.project.disconnected.map(map);
  for (const l of S.project.links) {
    if (l.a.startsWith(old + '.')) l.a = nv + l.a.slice(old.length);
    if (l.b.startsWith(old + '.')) l.b = nv + l.b.slice(old.length);
  }
  if (S.project.compStatus[old]) { S.project.compStatus[nv] = true; delete S.project.compStatus[old]; }
  c.ref = nv;
}
function bindPanel() {
  const pc = $('#panelContent');
  pc.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'rename' || act === 'editpart') return;
    e.stopPropagation();
    handleAct(act, el, false);
  });
  pc.addEventListener('change', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    handleAct(el.dataset.act, el, true);
  });
}

/* ================= 工具栏 ================= */
function buildPalette() {
  const box = $('#palette');
  box.innerHTML = PALETTE.map(k => `<button class="pal" data-kind="${k}" title="放置${SYM[k].label}">${SYM[k].label}</button>`).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('.pal'); if (!b) return;
    const kind = b.dataset.kind;
    const host = $('#canvasHost');
    const cx = host.clientWidth / 2, cy = host.clientHeight / 2;
    const w = [(cx - S.view.tx) / S.view.k, (cy - S.view.ty) / S.view.k];
    const c = addComp(S.project, kind, w[0], w[1]);
    S.selection = { type: 'comp', id: c.id };
    setTool('select');
  });
}
function syncName() {
  const pn = $('#projName');
  if (!pn) return;
  pn.value = S.project.meta.name || '';
  pn.onchange = () => {
    S.project.meta.name = pn.value.trim() || '未命名工程';
    pn.value = S.project.meta.name;
    autosave();
  };
}
function bindTop() {
  $('#btnSave').onclick = () => { autosave(); toast('已保存到本地浏览器（localStorage）'); };
  $('#btnLoad').onclick = () => {
    try {
      const s = localStorage.getItem(LSKEY);
      if (!s) { toast('本地没有保存的工程'); return; }
      S.project = JSON.parse(s); S.selection = {}; S.d = null;
      syncName(); fitView(); renderAll(); toast('已从本地恢复');
    } catch (e) { toast('恢复失败：' + e.message); }
  };
  $('#btnImport').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        if (!j.components || !j.wires) throw new Error('缺少 components / wires 字段');
        S.project = Object.assign(newProject('导入工程'), j);
        S.project.image = S.project.image || { src: '', anchors: {} };
        syncName(); S.selection = {}; fitView(); renderAll(); toast('已导入工程：' + S.project.meta.name);
      } catch (err) { toast('导入失败：' + err.message); }
    };
    r.readAsText(f); e.target.value = '';
  };
  $('#btnExportProj').onclick = () => download(safeName() + '.schematic.json', projectJSON(S.project));
  $('#btnExportNet').onclick = () => download(safeName() + '.netlist.json', JSON.stringify(netlistData(S.project), null, 2));
  $('#btnExportMd').onclick = () => download(safeName() + '.netlist.md', netlistMarkdown(S.project), 'text/markdown;charset=utf-8');
  $('#btnExportSvg').onclick = exportSVG;
  $('#btnExportPng').onclick = exportPNG;
  $('#btnFit').onclick = fitView;
  $('#btnCheckAll').onclick = () => {
    for (const n of S.d.pinNodes) if (!S.project.pinChecked.includes(n.id)) S.project.pinChecked.push(n.id);
    for (const c of S.project.components) S.project.compStatus[c.ref] = true;
    renderAll(); toast('已全部标记为已确认');
  };
  $('#btnClearCheck').onclick = () => {
    S.project.pinChecked = []; S.project.compStatus = {}; renderAll(); toast('已清除确认状态');
  };
  $('#btnDemo').onclick = () => { S.project = demoProject(); S.selection = {}; syncName(); fitView(); renderAll(); toast('已载入演示工程'); };
  document.querySelectorAll('.toolbtn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('.tabbtn').forEach(b => b.onclick = () => { S.tab = b.dataset.tab; renderPanel(); });
}
function safeName() {
  const n = (S.project.meta.name || 'schematic').replace(/[\\/:*?"<>|\s]+/g, '_');
  return n.slice(0, 60);
}
function svgString(opts) {
  const bb = contentBBox();
  const svg = renderSVG(S.project, S.d, S.erc, { selection: {}, showGrid: false, preview: null });
  const m = /id="world">([\s\S]*)<\/g>\s*<\/svg>\s*$/.exec(svg);
  const inner = m ? m[1] : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${bb.w}" height="${bb.h}" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}">
<style>${SVG_CSS}</style>
<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" fill="#ffffff"/>
<g>${inner}</g></svg>`;
}
function exportSVG() {
  download(safeName() + '.svg', svgString(), 'image/svg+xml;charset=utf-8');
  toast('已导出 SVG（可直接给他人查看）');
}
function exportPNG() {
  const s = svgString();
  const bb = contentBBox();
  const img = new Image();
  img.onload = () => {
    const cv = document.createElement('canvas');
    const scale = 2;
    cv.width = bb.w * scale; cv.height = bb.h * scale;
    const cx = cv.getContext('2d');
    cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    cv.toBlob(b => downloadBlob(safeName() + '.png', b));
  };
  img.onerror = () => toast('PNG 导出失败，请改用「导出 SVG」');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
}

/* ================= 原图参考面板 ================= */
function bindImagePanel() {
  const fi = $('#fileImg');
  $('#btnPickImg').onclick = () => fi.click();
  fi.onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      const im = new Image();
      im.onload = () => {
        S.project.image = S.project.image || { anchors: {} };
        S.project.image.src = r.result;
        S.project.image.w = im.naturalWidth; S.project.image.h = im.naturalHeight;
        S.imgZoom = 1; renderImage();
        toast(`原图已载入 ${im.naturalWidth}×${im.naturalHeight}，用「标原图」工具把元件钉到图上`);
      };
      im.src = r.result;
    };
    r.readAsDataURL(f); e.target.value = '';
  };
  $('#btnImgZoomIn').onclick = () => { S.imgZoom = Math.min(6, S.imgZoom * 1.25); renderImage(); };
  $('#btnImgZoomOut').onclick = () => { S.imgZoom = Math.max(0.1, S.imgZoom / 1.25); renderImage(); };
  $('#imgWrap').addEventListener('wheel', e => {
    if (!S.project.image || !S.project.image.src) return;
    e.preventDefault(); S.imgZoom = Math.min(6, Math.max(0.1, S.imgZoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    renderImage();
  }, { passive: false });
  $('#imgWrap').addEventListener('click', e => {
    if (S.tool !== 'markup') return;
    const c = S.project.components.find(x => x.id === S.selection.id);
    if (!c) { toast('请先在画布中选中一个元件，再到原图上点位置'); return; }
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left + e.currentTarget.scrollLeft) / S.imgZoom;
    const y = (e.clientY - r.top + e.currentTarget.scrollTop) / S.imgZoom;
    S.project.image.anchors[c.ref] = { x: Math.round(x), y: Math.round(y) };
    renderImage(); toast(`${c.ref} 已钉到原图 (${Math.round(x)},${Math.round(y)})`);
  });
}
function renderImage() {
  const w = $('#imgWrap');
  const im = S.project.image;
  if (!im || !im.src) {
    w.innerHTML = '<div class="img-empty">尚未载入原图。<br>点「载入原图」选择截图 / PDF 导出页；<br>也可以直接把图片拖到这里。</div>';
    return;
  }
  const anchors = Object.entries(im.anchors || {}).map(([ref, a]) =>
    `<div class="anchor" style="left:${a.x * S.imgZoom}px;top:${a.y * S.imgZoom}px">${esc(ref)}</div>`).join('');
  w.innerHTML = `<div class="img-inner" style="width:${im.w * S.imgZoom}px;height:${im.h * S.imgZoom}px">
      <img src="${im.src}" style="width:${im.w * S.imgZoom}px;height:${im.h * S.imgZoom}px">
      ${anchors}</div>`;
}
function bindImageDrop() {
  const w = $('#imgWrap');
  ['dragenter', 'dragover'].forEach(t => w.addEventListener(t, e => { e.preventDefault(); w.classList.add('hover'); }));
  ['dragleave', 'drop'].forEach(t => w.addEventListener(t, e => { e.preventDefault(); w.classList.remove('hover'); }));
  w.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const im = new Image(); im.onload = () => { S.project.image = { src: r.result, w: im.naturalWidth, h: im.naturalHeight, anchors: {} }; renderImage(); }; im.src = r.result; };
    r.readAsDataURL(f);
  });
}

/* ================= 自检 ================= */
function runSelfTest() {
  const L = []; const ok = (c, m) => L.push((c ? 'PASS' : 'FAIL') + ' | ' + m);
  const p = demoProject();
  const d = deriveNets(p);
  ok(p.components.length > 10, 'demo components=' + p.components.length);
  const netOf = (ref, num) => d.pinNet.get('p:' + ref + '.' + num) || null;
  const nm = (ref, num) => (netOf(ref, num) || {}).name || '-';
  ok(!!netOf('R1', 2) && netOf('R1', 2) === netOf('U1', 1), 'node A: R1.2 == U1.1 (' + nm('R1', 2) + ')');
  ok(netOf('R1', 2) === netOf('R2', 1), 'node A: R1.2 == R2.1');
  ok(netOf('R1', 2) === netOf('C1', 1), 'node A: R1.2 == C1.1');
  ok(netOf('R1', 1) === netOf('#PWR01', 1), 'R1.1 == VCC');
  ok(netOf('R1', 1) !== netOf('R1', 2), 'divider not shorted');
  ok(netOf('R2', 2) === netOf('#PWR02', 1), 'R2.2 == GND');
  ok(netOf('#PWR02', 1) === netOf('#PWR10', 1), 'global GND merge across symbols');
  ok(netOf('TP1', 1) === netOf('#PWR08', 1), 'TP1 wired to its GND');
  ok(netOf('TP1', 1) !== netOf('R1', 2), 'crossing WITHOUT junction does NOT connect');
  ok(d.crossings.length >= 1, 'crossing detected: ' + JSON.stringify(d.crossings));
  const erc = runERC(p, d);
  ok(erc.findings.some(f => f.code === 'E11'), 'ERC E11 (crossing w/o junction)');
  ok(erc.findings.some(f => f.code === 'E1'), 'ERC E1 (floating pin)');
  ok(netOf('R5', 2) === netOf('#PWR10', 1), 'virtual link R5.2 == GND');
  ok(netOf('R5', 1) === netOf('R3', 2), 'virtual link R5.1 == gate net');
  ok(netOf('Q1', 2) === netOf('D1', 2), 'coincident pins connect (D1.K == Q1.D)');
  ok(netOf('D1', 1) === netOf('R4', 2), 'D1.A == R4.2');
  ok(netOf('R4', 1) === netOf('#PWR09', 1), 'R4.1 == 5V');
  // 编辑后重算
  const c = addComp(p, 'res', 1000, 700);
  const nl1 = netlistData(p);
  p.wires.push({ id: uid('w'), pts: [[1000 - 40, 700], [1000 - 40, 760]] });
  addComp(p, 'gnd', 1000 - 40, 760);
  const d2 = deriveNets(p);
  ok(d2.nets.length >= d.nets.length, 're-derive after edit ok (nets ' + d.nets.length + '→' + d2.nets.length + ')');
  ok(JSON.stringify(nl1).length > 500, 'netlist JSON size ' + JSON.stringify(nl1).length);
  ok(JSON.parse(JSON.stringify(nl1)).nets.length === nl1.nets.length, 'netlist JSON roundtrip');
  const md = netlistMarkdown(p);
  ok(md.includes('## 网络') && md.includes('## ERC'), 'markdown sections');
  const pj = JSON.parse(projectJSON(p));
  ok(!pj.image.src, 'project JSON excludes embedded image');
  ok(pj.components.length === p.components.length, 'project JSON component count');
  ok(SVG_CSS.includes('.wire'), 'SVG_CSS present');
  return L;
}

/* ================= 启动 ================= */
function boot() {
  document.head.insertAdjacentHTML('beforeend', '<style>' + SVG_CSS + '</style>');
  let p = null;
  try { const s = localStorage.getItem(LSKEY); if (s) p = JSON.parse(s); } catch (e) { }
  if (!p || !p.components || !p.components.length) p = demoProject();
  if (!p.image) p.image = { src: '', w: 0, h: 0, anchors: {} };
  S.project = p;
  S.d = deriveNets(p); S.erc = runERC(p, S.d);
  syncName(); buildPalette(); bindTop(); bindCanvas(); bindPanel(); bindImagePanel(); bindImageDrop();
  document.querySelectorAll('.tabbtn').forEach(b => { if (b.dataset.tab === S.tab) b.classList.add('on'); });
  renderImage(); renderAll();
  setTimeout(() => { fitView(); renderStatus(); }, 30);
  if (location.search.includes('selftest')) {
    const res = runSelfTest();
    const bad = res.filter(x => x.startsWith('FAIL')).length;
    const pre = document.createElement('pre'); pre.id = 'selftest'; pre.textContent = res.join('\n');
    document.body.appendChild(pre);
    document.title = (bad ? 'SELFTEST-FAIL' : 'SELFTEST-PASS') + ' ' + (res.length - bad) + '/' + res.length;
    window.__SELFTEST__ = { pass: res.length - bad, fail: bad, lines: res };
  }
}
window.addEventListener('DOMContentLoaded', boot);
