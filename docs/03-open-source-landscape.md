# 03 · 开源生态调研

> 结论先行：**「编辑/格式」与「网表分析」两层已有成熟开源可直接用；「位图 → 工程级网表」只有学术原型，不能工程用。**

## 1. 分层判断

| 层 | 问题 | 开源现状 | 能否直接用 |
|---|---|---|---|
| ① 位图 → 结构 | 从截图/照片认出符号、线、文字 | 学术原型，需 GPU + 训练数据 | ❌ |
| ② 结构 → 可编辑可保存 | 可改、可存、可渲染 | 很成熟 | ✅ |
| ③ 结构 → 电气分析 | 悬空、短路、驱动冲突 | 成熟 | ✅ |

本项目（`app/`）只做**第②层里被忽略的那一半**：*复核状态、纠错、可审计*。识别与几何渲染都不重造。

## 2. ① 识别层（不可直接依赖）

| 项目 | 做法 | 现实评价 |
|---|---|---|
| [SPICEnet](https://github.com/jake-is-ESD-protected/SPICEnet) | CNN 检测原理图元件符号 | 只解决“元件在哪”，不解决连线与网表 |
| [CircuitVision](https://github.com/JKc66/CircuitVision) | YOLOv11 检测 + SAM 2.1 分割 + Gemini 提参数 → SPICE 网表 | 流程最完整，但依赖大模型、结果不稳，必须人工校验 |
| [SINA](https://ar5iv.labs.arxiv.org/html/2607.01609) | 全自动 image→netlist（论文 + 代码） | 学术基准尚可，工程图（跨页、总线、标号）易失效 |
| [IEEE: Fully Automated SPICE-Compatible Netlist Extraction](https://ieeexplore.ieee.org/stamp/stamp.jsp?arnumber=11359167) | 深度学习 + 图像预处理 | 同上，偏单页整洁图 |

**共同问题**：
1. 只在“干净印刷、单页、无总线”的图上有效；
2. 输出**没有置信度、没有可复核性** —— 错一个引脚号，全盘皆错；
3. 需要自建数据集与训练，工程化成本高于收益。

→ 本项目的处理：识别只作 **seed（草稿）**，且必须进人工复核闭环。

## 3. ② 编辑 / 格式层（成熟，可直接站上去）

| 项目 | 是什么 | 对本项目的定位 |
|---|---|---|
| **KiCad** + [`kicad-cli`](https://www.kicad.org/) | 开源 EDA；`.kicad_sch` 是**纯文本 S-expression** | **首选交换格式**：可脚本生成/解析，可导 PDF/SVG/网表/ERC |
| [KiCanvas](https://github.com/theacodes/kicanvas) | 纯前端 KiCad 原理图/PCB 查看器 | **网页渲染层几乎现成**（只读） |
| [QElectroTech](https://manpages.debian.org/trixie/qelectrotech/qelectrotech.1.en.html) | 开源电气图编辑器，XML 存储 + 符号库 | 电气/线束图更贴汽车场景（桌面端） |
| [tscircuit](https://github.com/tscircuit/docs/blob/main/docs/intro/what-is-tscircuit.mdx) | TS/React 声明式电路 + 原理图渲染 | “用代码描述电路”的首选 |
| [netlistsvg](https://www.npmjs.com/package/@silimate/netlistsvg) | 网表 JSON → 自动布线 SVG | 复核视图可复用其渲染 |
| [draw.io / maxgraph](https://github.com/jgraph/mxgraph)（Apache-2.0） | 通用图编辑器内核，可嵌入 | 图形编辑内核可复用，但**无电路语义**（无网表推导） |
| [Fritzing](https://www.electronicsforu.com/technology-trends/fritzing-a-practical-eda-tool-for-rapid-pcb-prototyping)（GPL） | 面包板→原理图，自带 netlist 模型 | 数据模型设计值得借鉴 |
| [schemdraw](https://schemdraw.readthedocs.io/) | Python 代码画原理图 → SVG | 批量出图/报告配图 |
| [kiutils](https://github.com/mvnmgrx/kiutils) / [kicad-skip](https://pypi.org/project/kicad-skip/) | Python 读写 `.kicad_sch` | v0.2 导出 KiCad 的实现路径 |

**关键空白**：这些工具**都假设你已经有一份正确的结构**。没有一个是围绕“这份结构是 AI 猜的、需要人工复核与留痕”设计的 —— 这正是本仓库的落点。

## 4. ③ 分析 / ERC 层（成熟，直接可用）

| 项目 | 提供什么 |
|---|---|
| [circuitgraph](https://circuitgraph.github.io/circuitgraph/index.html)（JOSS 论文） | 把 SPICE 网表读成图，做器件/网络查找、子电路、电气一致性检查 |
| KiCad ERC | 内置规则集，可作规则对齐基准 |
| SKiDL | Python 描述电路直接出网表 |
| PySpice / lcapy | 网表仿真（本阶段不需要） |

## 5. 跳过识别的捷径：源文件 / 矢量 PDF

- **EDA 转 KiCad**：[altium2kicad](https://github.com/thesourcerer8/altium2kicad)（原理图 + PCB）
- **矢量 PDF 抽取**：`pdfplumber` / `PyMuPDF`（开源）+ `pdftocairo` / `mutool draw -F svg`
  - 文字层给出 refdes / 网络名 / 参数值的**精确文本与坐标**
  - 线段矢量按端点聚类重建连通性
  - **准确率比像素 OCR 高一个数量级**，是行业里图纸数字化的通用做法

## 6. 落地结论

| 环节 | 采用 |
|---|---|
| 输入 | 优先源文件 / 矢量 PDF；位图仅作退化方案 |
| 交换格式 | JSON（当前中间态）→ **KiCad `.kicad_sch`**（v0.2） |
| 渲染 | 自研（当前，满足编辑与状态可视化）；只读展示可换 KiCanvas |
| 连通性 | 自研几何推导 + 显式 junction（本项目核心差异点） |
| ERC | 自研 8 类 + 逐步对齐 KiCad ERC / circuitgraph |
| 识别 | 不投入；只接“草稿生成”，且必须人工复核 |
