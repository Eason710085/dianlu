/* render.js — SVG 画布 + 表格 + 检查面板的渲染 */
'use strict';

function statusClass(st) { return st === 'checked' ? 'ok' : (st === 'partial' ? 'part' : 'todo'); }

function renderSVG(p, d, erc, ctx) {
  const sel = ctx.selection || {};
  const hoverNet = ctx.hoverNet || null;
  const showGrid = ctx.showGrid !== false;
  const layers = { wires: [], hits: [], junc: [], comps: [], labels: [], links: [], marks: [], texts: [] };

  // ---- 导线
  for (const w of p.wires) {
    const net = d.wireNet.get(w.id);
    const st = net ? net.status : 'unknown';
    let cls = 'wire ' + statusClass(st);
    if (sel.type === 'wire' && sel.id === w.id) cls += ' sel';
    if (hoverNet && net && net.key === hoverNet) cls += ' hl';
    const pts = w.pts.map(pt => pt[0] + ',' + pt[1]).join(' ');
    layers.hits.push(`<polyline class="wire-hit" points="${pts}" data-type="wire" data-id="${w.id}"/>`);
    layers.wires.push(`<polyline class="${cls}" points="${pts}" data-type="wire" data-id="${w.id}"/>`);
    // 顶点手柄（选中时）
    if (sel.type === 'wire' && sel.id === w.id) {
      w.pts.forEach((pt, i) => {
        layers.marks.push(`<circle class="vhandle" cx="${pt[0]}" cy="${pt[1]}" r="4" data-type="vhandle" data-id="${w.id}" data-idx="${i}"/>`);
      });
    }
  }

  // ---- 连接点
  for (const j of (p.junctions || [])) {
    const net = d.wireNet.get((p.wires.find(w => w.pts.some(pt => Math.abs(pt[0] - j.x) < 1 && Math.abs(pt[1] - j.y) < 1)) || {}).id);
    const st = net ? net.status : 'unknown';
    layers.junc.push(`<circle class="junc ${statusClass(st)}" cx="${j.x}" cy="${j.y}" r="3.6" data-type="junction" data-id="${j.id}"/>`);
  }

  // ---- 虚拟连接
  for (const l of (p.links || [])) {
    const a = pinByKey(d, l.a), b = pinByKey(d, l.b);
    if (!a || !b) continue;
    const on = (sel.type === 'link' && sel.id === l.id);
    layers.links.push(`<line class="vlink${on ? ' sel' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" data-type="link" data-id="${l.id}"><title>虚拟连接 ${l.a} ↔ ${l.b}</title></line>`);
  }

  // ---- 元件
  for (const c of p.components) {
    const sym = SYM[c.kind]; if (!sym) continue;
    const bb = compBBox(c);
    const checked = !!p.compStatus[c.ref];
    let cls = 'comp' + (checked ? ' okc' : ' todoc');
    if (sel.type === 'comp' && sel.id === c.id) cls += ' sel';
    const mx = c.mirror ? -1 : 1;
    const body = sym.body(c);
    let inner = `<g transform="translate(${c.x},${c.y}) rotate(${c.rot || 0})"><g transform="scale(${mx},1)">${body}</g></g>`;
    // 引脚焊点
    for (const pin of defPins(c)) {
      const [X, Y] = pinAbs(c, pin);
      const isSel = sel.type === 'pin' && sel.ref === c.ref && sel.num === pin.n;
      inner += `<circle class="pin${isSel ? ' sel' : ''}" cx="${X}" cy="${Y}" r="2.6" data-type="pin" data-ref="${esc(c.ref)}" data-num="${esc(pin.n)}"/>`;
    }
    // 位号 / 值（保持水平）
    const refY = bb.y0 - 6, valY = bb.y1 + 15;
    const isPwr = !!sym.global;
    let txt = '';
    if (isPwr) {
      const nm = String(c.netName || sym.defNet || '');
      const ny = c.kind === 'gnd' ? bb.y1 + 16 : bb.y0 - 22;
      txt += `<text class="pwrname" x="${c.x}" y="${ny}" text-anchor="middle">${esc(nm)}</text>`;
    } else if (((c.rot || 0) % 180) !== 0) {
      const lx = bb.x0 - 8, cy = (bb.y0 + bb.y1) / 2;
      txt += `<text class="ref" x="${lx}" y="${cy + 1}" text-anchor="end">${esc(c.ref)}</text>`;
      if (c.part) txt += `<text class="val" x="${lx}" y="${cy + 14}" text-anchor="end">${esc(c.part)}</text>`;
    } else {
      txt += `<text class="ref" x="${c.x}" y="${refY}" text-anchor="middle">${esc(c.ref)}</text>`;
      if (c.part) txt += `<text class="val" x="${c.x}" y="${valY}" text-anchor="middle">${esc(c.part)}</text>`;
    }
    if (!checked && !isPwr) txt += `<circle class="todoc-dot" cx="${bb.x0}" cy="${bb.y0}" r="3.2"/>`;
    layers.comps.push(`<g class="${cls}" data-type="comp" data-id="${c.id}">${inner}${txt}</g>`);
  }

  // ---- 网络标签
  for (const lb of (p.labels || [])) {
    const on = (sel.type === 'label' && sel.id === lb.id);
    layers.labels.push(`<g class="netlabel${on ? ' sel' : ''}" data-type="label" data-id="${lb.id}"><circle cx="${lb.x}" cy="${lb.y}" r="3"/><text x="${lb.x + 7}" y="${lb.y - 6}">${esc(lb.text)}</text></g>`);
  }

  // ---- ERC 标记
  for (const f of (erc.findings || [])) {
    if (f.focus && f.focus.type === 'xy') {
      layers.marks.push(`<g class="mk ${f.level}" data-type="errmark" data-x="${f.focus.x}" data-y="${f.focus.y}"><circle cx="${f.focus.x}" cy="${f.focus.y}" r="9"/><text x="${f.focus.x}" y="${f.focus.y + 4}" text-anchor="middle">!</text></g>`);
    }
    if (f.focus && f.focus.type === 'pin' && (f.level === 'error' || f.level === 'warn')) {
      const pn = d.pinNodes.find(n => n.ref === f.focus.ref && n.num === f.focus.num);
      if (pn) layers.marks.push(`<circle class="mkring ${f.level}" cx="${pn.x}" cy="${pn.y}" r="7" data-type="errmark" data-x="${pn.x}" data-y="${pn.y}"/>`);
    }
  }

  // ---- 预览（画线中）
  if (ctx.preview && ctx.preview.length > 1) {
    const pts = ctx.preview.map(pt => pt[0] + ',' + pt[1]).join(' ');
    layers.marks.push(`<polyline class="preview" points="${pts}"/>`);
    ctx.preview.forEach(pt => { layers.marks.push(`<circle class="pv-dot" cx="${pt[0]}" cy="${pt[1]}" r="3"/>`); });
  }

  return `<svg id="svg" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <pattern id="gridpat" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0 H0 V20" fill="none" stroke="#e8edf3" stroke-width="1"/>
      </pattern>
      <pattern id="gridpat2" width="100" height="100" patternUnits="userSpaceOnUse">
        <rect width="100" height="100" fill="url(#gridpat)"/>
        <path d="M100 0 H0 V100" fill="none" stroke="#dbe3ec" stroke-width="1"/>
      </pattern>
    </defs>
    <g id="world">
      ${showGrid ? '<rect class="gridbg" x="-40000" y="-40000" width="80000" height="80000" fill="url(#gridpat2)"/>' : ''}
      <g>${layers.wires.join('')}</g>
      <g>${layers.hits.join('')}</g>
      <g>${layers.junc.join('')}</g>
      <g>${layers.comps.join('')}</g>
      <g>${layers.labels.join('')}</g>
      <g>${layers.links.join('')}</g>
      <g>${layers.marks.join('')}</g>
    </g>
  </svg>`;
}

function pinByKey(d, key) {
  const [ref, num] = String(key).split('.');
  return d.pinNodes.find(n => n.ref === ref && n.num === num);
}
function netOfPin(d, ref, num) { return d.pinNet.get('p:' + ref + '.' + num) || null; }

/* ---------- 右侧面板 ---------- */
function renderNetTable(p, d, erc, ctx) {
  const rows = d.nets.map(net => {
    const st = net.status;
    const chips = net.members.map(m => {
      const disc = m.disconnected;
      return `<span class="chip ${disc ? 'disc' : ''}" data-act="focuspin" data-ref="${esc(m.ref)}" data-num="${esc(m.num)}" title="${esc(m.role)}${disc ? ' · 已标记不连接' : ''}">${esc(m.ref)}.${esc(m.num)}${m.name ? '<i>' + esc(m.name) + '</i>' : ''}<b data-act="disconnect" data-ref="${esc(m.ref)}" data-num="${esc(m.num)}" title="标记为不连接">×</b></span>`;
    }).join('') || '<span class="muted">（无引脚）</span>';
    const flags = [];
    if (net.power.length) flags.push('<i class="tag pwr">PWR</i>');
    if (net.linked) flags.push('<i class="tag vir">虚拟</i>');
    if (!net.nameExplicit && net.members.length > 1) flags.push('<i class="tag warn">未命名</i>');
    return `<tr data-act="focusnet" data-key="${net.key}" class="st-${st}">
      <td class="netname"><input class="nname" data-act="rename" data-key="${net.key}" value="${esc(net.name)}" spellcheck="false"></td>
      <td><span class="badge ${statusClass(st)}">${st === 'checked' ? '✓ 已确认' : (st === 'partial' ? '部分' : '待确认')}</span></td>
      <td class="chips">${chips}</td>
      <td class="flags">${flags.join('')}<button class="mini" data-act="checknet" data-key="${net.key}" title="确认该网络全部引脚">✓</button></td>
    </tr>`;
  }).join('');
  return `<table class="tbl nets"><thead><tr><th style="width:26%">网络名</th><th style="width:12%">状态</th><th>连接成员（点引脚定位 / × 标记不连接）</th><th style="width:12%"></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">暂无网络</td></tr>'}</tbody></table>`;
}

function renderCompTable(p) {
  const rows = p.components.map(c => {
    const pins = defPins(c).map(x => x.n + (x.name ? '(' + x.name + ')' : '')).join(' ');
    return `<tr data-act="focuscomp" data-id="${c.id}">
      <td><b>${esc(c.ref)}</b></td>
      <td><input class="cpart" data-act="editpart" data-id="${c.id}" value="${esc(c.part || '')}" spellcheck="false"></td>
      <td class="muted">${esc(c.kind)}</td>
      <td class="muted small">${esc(pins)}</td>
      <td><span class="badge ${p.compStatus[c.ref] ? 'ok' : 'todo'}">${p.compStatus[c.ref] ? '✓' : '待确认'}</span></td>
      <td><button class="mini danger" data-act="delcomp" data-id="${c.id}" title="删除">✕</button></td>
    </tr>`;
  }).join('');
  return `<table class="tbl comps"><thead><tr><th style="width:16%">位号</th><th style="width:26%">型号/值</th><th style="width:12%">类型</th><th>引脚</th><th style="width:14%">状态</th><th style="width:8%"></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">暂无元件</td></tr>'}</tbody></table>`;
}

function renderERCPanel(erc) {
  const order = { error: 0, warn: 1, info: 2 };
  const fs = erc.findings.slice().sort((a, b) => order[a.level] - order[b.level]);
  const cnt = { error: 0, warn: 0, info: 0 };
  fs.forEach(f => cnt[f.level]++);
  const head = `<div class="erc-sum"><span class="badge err">错误 ${cnt.error}</span><span class="badge wrn">警告 ${cnt.warn}</span><span class="badge inf">提示 ${cnt.info}</span></div>`;
  const rows = fs.map(f => `<div class="erc-item ${f.level}" data-act="focuserc" data-f='${esc(JSON.stringify(f.focus || null))}'>
      <span class="code">${f.code}</span><span class="lvl">${f.level === 'error' ? '错误' : f.level === 'warn' ? '警告' : '提示'}</span>
      <span class="msg">${esc(f.msg)}</span></div>`).join('');
  return head + (rows || '<div class="muted">无问题</div>');
}

function renderProps(p, d, ctx) {
  const sel = ctx.selection || {};
  if (sel.type === 'comp') {
    const c = p.components.find(x => x.id === sel.id);
    if (!c) return '<div class="muted">未选中</div>';
    const sym = SYM[c.kind];
    let extra = '';
    if (c.kind === 'gnd' || c.kind === 'vcc') extra += `<label>网络名<input data-act="setnetname" data-id="${c.id}" value="${esc(c.netName || '')}"></label>`;
    if (c.kind === 'ic' || c.kind === 'conn') extra += `<label>引脚数<input type="number" min="2" max="40" data-act="setpincount" data-id="${c.id}" value="${c.pinCount || 8}"></label>`;
    if (c.kind === 'ic' || c.kind === 'conn') extra += `<label>引脚名<input data-act="setpinnames" data-id="${c.id}" value="${esc(Object.entries(c.pinNames || {}).map(([k, v]) => k + ':' + v).join(','))}" placeholder="1:VDD,2:GND"></label>`;
    return `<div class="props">
      <div class="ptitle">元件 <b>${esc(c.ref)}</b> <span class="muted">${esc(sym.label)}</span></div>
      <label>位号<input data-act="editref" data-id="${c.id}" value="${esc(c.ref)}"></label>
      <label>型号/值<input data-act="editpart" data-id="${c.id}" value="${esc(c.part || '')}"></label>
      ${extra}
      <div class="prow">
        <button data-act="rot" data-id="${c.id}">旋转 90°</button>
        <button data-act="mirror" data-id="${c.id}">镜像</button>
        <button data-act="confirmcomp" data-id="${c.id}">确认已核对</button>
      </div>
      <div class="prow"><button class="danger" data-act="delcomp" data-id="${c.id}">删除元件</button></div>
      <div class="phint">位置 (${c.x}, ${c.y}) · 已连网络：${defPins(c).map(pin => esc(pin.n) + '→' + esc((netOfPin(d, c.ref, pin.n) || {}).name || '-')).join(' · ')}</div>
    </div>`;
  }
  if (sel.type === 'wire') {
    const w = p.wires.find(x => x.id === sel.id);
    if (!w) return '<div class="muted">未选中</div>';
    const net = d.wireNet.get(w.id);
    return `<div class="props"><div class="ptitle">导线</div>
      <div class="phint">顶点 ${w.pts.length} 个，所属网络 <b>${esc(net ? net.name : '-')}</b></div>
      <div class="prow"><button data-act="splitwire" data-id="${w.id}">从中间断开成两段</button><button class="danger" data-act="delwire" data-id="${w.id}">删除导线</button></div>
      <div class="phint">提示：双击导线也可在其位置插入顶点并断开。</div></div>`;
  }
  if (sel.type === 'junction') {
    const j = p.junctions.find(x => x.id === sel.id);
    return `<div class="props"><div class="ptitle">连接点</div><div class="phint">坐标 (${j ? j.x : '?'}, ${j ? j.y : '?'})</div>
      <div class="prow"><button class="danger" data-act="deljunction" data-id="${sel.id}">删除连接点</button></div></div>`;
  }
  if (sel.type === 'label') {
    const lb = p.labels.find(x => x.id === sel.id);
    return `<div class="props"><div class="ptitle">网络标签</div>
      <label>名称<input data-act="editlabel" data-id="${sel.id}" value="${esc(lb ? lb.text : '')}"></label>
      <div class="prow"><button class="danger" data-act="dellabel" data-id="${sel.id}">删除标签</button></div></div>`;
  }
  if (sel.type === 'pin') {
    const net = netOfPin(d, sel.ref, sel.num);
    return `<div class="props"><div class="ptitle">引脚 ${esc(sel.ref)}.${esc(sel.num)}</div>
      <div class="phint">所属网络：<b>${esc(net ? net.name : '-')}</b>${net ? '，' + (net.members.length === 1 ? '仅此一点' : net.members.length + ' 个成员') : ''}</div>
      <div class="prow"><button data-act="checkpin" data-ref="${esc(sel.ref)}" data-num="${esc(sel.num)}">确认此引脚</button></div></div>`;
  }
  return `<div class="props"><div class="muted">点击画布中的元件 / 导线 / 引脚进行编辑。</div>
    <div class="phint" style="margin-top:10px">快捷键：<kbd>R</kbd> 旋转 <kbd>M</kbd> 镜像 <kbd>Del</kbd> 删除 <kbd>W</kbd> 连线 <kbd>J</kbd> 连接点 <kbd>L</kbd> 标签 <kbd>空格</kbd>拖动画布 <kbd>+/-</kbd>缩放</div></div>`;
}

/* ---------- SVG 内联样式（同时用于页面与导出文件，单一来源） ---------- */
const SVG_CSS = `
svg text { font-family: -apple-system, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif; user-select:none; }
.sym { fill: none; stroke: #334155; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.sym.box { fill: #fbfdff; }
.symfill { fill: #334155; stroke: #334155; stroke-width: 1.2; }
.pnum { font-size: 9px; fill: #7b8a9e; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
.pname { font-size: 9.5px; fill: #475569; }
.symtxt { font-size: 10px; fill: #475569; text-anchor: middle; }

.wire { fill: none; stroke: #1e293b; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.wire.todo { stroke: #b45309; }
.wire.part { stroke: #d97706; }
.wire.ok { stroke: #1e293b; }
.wire.hl { stroke: #2563eb; stroke-width: 3.4; }
.wire.sel { stroke: #dc2626; stroke-width: 3; }
.wire-hit { fill: none; stroke: transparent; stroke-width: 12; cursor: pointer; }

.junc { fill: #1e293b; stroke: none; cursor: pointer; }
.junc.todo { fill: #b45309; }
.junc.part { fill: #d97706; }

.pin { fill: #ffffff; stroke: #334155; stroke-width: 1.2; cursor: crosshair; }
.pin.sel { fill: #dc2626; stroke: #dc2626; }

.ref { font-size: 12px; font-weight: 700; fill: #0f172a; }
.val { font-size: 11px; fill: #64748b; }
.pwrname { font-size: 11.5px; font-weight: 600; fill: #1d4ed8; }
.todoc-dot { fill: #f59e0b; }
.comp { cursor: move; }
.comp.sel .sym { stroke: #dc2626; stroke-width: 2.6; }
.comp.sel .symfill { fill: #dc2626; }

.netlabel { cursor: move; }
.netlabel circle { fill: #1d4ed8; }
.netlabel text { font-size: 11.5px; fill: #1d4ed8; font-weight: 600; }
.netlabel.sel circle { fill: #dc2626; }
.netlabel.sel text { fill: #dc2626; }

.vlink { stroke: #9333ea; stroke-width: 1.8; stroke-dasharray: 6 4; fill: none; pointer-events: stroke; cursor: pointer; }
.vlink.sel { stroke: #dc2626; stroke-width: 2.6; }

.mk circle { fill: rgba(220,38,38,.10); stroke: #dc2626; stroke-width: 1.6; stroke-dasharray: 3 3; }
.mk text { fill: #dc2626; font-size: 11px; font-weight: 700; }
.mk.warn circle { stroke: #d97706; fill: rgba(217,119,6,.10); }
.mk.warn text { fill: #b45309; }
.mkring { fill: none; stroke: #dc2626; stroke-width: 1.6; stroke-dasharray: 3 3; }
.mkring.warn { stroke: #d97706; }
.vhandle { fill: #dc2626; stroke: #fff; stroke-width: 1.4; cursor: move; }
.preview { fill: none; stroke: #2563eb; stroke-width: 2; stroke-dasharray: 6 4; }
.pv-dot { fill: #2563eb; }
.gridbg { opacity: 0.9; }
`;
