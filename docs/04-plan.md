# 04 · 下一步方案

## 1. 三套可选组合

### 方案 A · 最省力（前提：能拿到源文件或矢量 PDF）

```
EDA 源文件 ──altium2kicad──▶ KiCad ──kicad-cli──▶ 网表 ──circuitgraph/KiCad ERC──▶ 结论
矢量 PDF ──pdfplumber/PyMuPDF──▶ 文字层 + 线段 ──▶ 初稿网表 ──▶ 人工复核 ──▶ 结论
```
- **识别环节直接消失**，准确率上限最高
- 前提：图纸来源可控（供应商/设计方愿意提供）
- 风险：CAD 版本、符号库差异；文字层缺失的 PDF 退化为位图

### 方案 B · 推荐（位图场景的默认路径）

```
位图 ──[识别/人工录入]──▶ 草稿网表（带置信度）
      ──▶ app/ 复核工作台（逐条确认 + 纠错 + 留痕）
      ──▶ 网表 JSON ──▶ KiCad / circuitgraph / 下游验证
```
- 核心不是“识别多准”，而是**纠错成本与可审计性**
- 已实现 v0.1；下一步是把“种子生成”自动化（先矢量 PDF，再位图）

### 方案 C · 零研发

人工在 KiCad 重画 → `kicad-cli` 出网表 → ERC。
- 零研发成本，但**每页重画数小时**，量大不划算
- 适合作为**校验基线**：抽样用 C 复核 B 的产出

## 2. 里程碑

### v0.2 · 导出 KiCad（1～2 天）
- [ ] `netlistJSON → .kicad_sch` 生成器（S-expression 手写模板即可）
- [ ] 符号映射表：本仓库 15 种符号 → KiCad 标准库符号
- [ ] `kicad-cli sch export svg/netlist` 回归，验证往返一致
- [ ] 同时产出 SPICE `.cir`（用于 circuitgraph）

**验收**：导出的 `.kicad_sch` 能被 KiCad 打开、ERC 结果与本地一致。

### v0.3 · 矢量 PDF 自动抽取（3～5 天）
- [ ] `pdfplumber` 抽 words（含坐标）+ `lines/rects/curves`
- [ ] 文字分类：refdes / value / netlabel / pinname（正则 + 位置启发）
- [ ] 线段重建：正交化、端点聚类、T 型与交叉判定（复用本仓库算法）
- [ ] 输出「初稿网表 + 低置信清单」直接喂 `app/`
- [ ] 与人工重画结果对比，量化召回率/准确率

**验收**：在 3 页真实图纸上，refdes 与网络名抽取召回 ≥ 90%，人工纠错时间 < 手工录入的 1/3。

### v0.4 · 深度分析（2～3 天）
- [ ] 网表 → `circuitgraph` 图结构
- [ ] 规则对齐 KiCad ERC；补充项目自定义规则（电源域、上下拉、隔离、冗余）
- [ ] 输出可评审的「可疑点报告」（按严重度排序 + 定位坐标）

### v0.5 · 位图初稿（探索，可选）
- [ ] 符号检测（可迁移 SPICEnet / CircuitVision 的思路或权重）
- [ ] OCR 取文字（PaddleOCR / Tesseract），只作 seed
- [ ] **强制**：所有低置信项进 `03_uncertain` 清单，未确认前不参与结论

## 3. 接口契约（给下游的稳定边界）

### 3.1 网表 JSON（已实现）
关键字段：
- `components[]`：`ref / kind / part / pins[]{num,name,role}`
- `nets[]`：`name / status(checked|partial|unknown) / members[]("R1.2") / power[] / virtualLink`
- `links[]`：虚拟连接（图上无走线）
- `erc[]`：`level / code / msg`
- `review`：确认统计与 `notConnectedPins`

> 稳定性承诺：`components` / `nets` / `links` 三个字段是下游依赖面，其余可加不可删。

### 3.2 JSON → KiCad（v0.2 目标）
| 本仓库 | KiCad |
|---|---|
| `components[].kind` + `part` | `lib_id`（经映射表） |
| `components[].x/y/rot/mirror` | `at` / `mirror` |
| `wires[].pts` | `wire (pts ...)` |
| `junctions[]` | `junction (at ...)` |
| `labels[].text` | `label` / `global_label` |
| `nets[].name` | 由 `label` 与电源符号承载（KiCad 不存 netlist 名） |

注意：KiCad 的连通性由几何 + junction 推导，**与本仓库模型天然同构**，映射无需引入新概念。

### 3.3 JSON → SPICE（v0.2）
- `res/cap/ind` → `R/C/L`，值取 `part`
- `diode/led` → `D`（LED 加 `.model`）
- `mos/bjt` → `M/Q`
- `vcc/gnd` → `.global` / `0` 节点
- 仅做结构检查用途，不做仿真精度承诺

## 4. 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 位图质量差（摩尔纹、低分辨率） | 识别基本不可用 | 要求分块 200%+ 截图；优先 PDF |
| 大图（>300 元件/页）编辑疲劳 | 复核成本高 | 按页/按功能块拆分；批量确认工具 |
| 网络名/位号命名不规范 | 自动命名可读性差 | 支持网络标签；导出前跑命名检查 |
| 人工确认被“跳过”（全部确认） | 可审计性归零 | 导出 `review` 统计；按块抽检；保留 `E0` 提示 |
| 图纸含内部信息 | 合规风险 | 工具纯本地离线；仓库只放通用方案 |

## 5. 当前缺口（下一步最该补的）

1. **种子生成**：现在从零画（或从演示改），缺“从位图/PDF 生成初稿”的能力 → v0.3
2. **KiCad 导出**：成果目前只能以私有 JSON 交付，进不了 EDA 生态 → v0.2
3. **规则可配置**：ERC 规则硬编码，不同项目口径不同 → v0.4
4. **大图性能**：当前全量重渲染，>500 元件会卡 → 按需优化（增量渲染）

## 6. 使用建议（给使用者）

1. 先给**矢量 PDF**；没有的话按 [位图读图协议](05-image-reading-protocol.md) 分块给图
2. 在 `app/` 里先确认**电源/地**（最快形成锚点），再逐块向外扩
3. 每确认一块就 `导出工程` 存档一次，避免丢失
4. 完成后 `导出网表`，交给后续分析链路（KiCad / circuitgraph / 验证用例生成）
