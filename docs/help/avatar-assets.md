# 化形素材指南 — Live2D 与声音克隆

给 Owner 的素材清单。按 ES-040（Avatar 是身份锚，Voice 随分身走）与 #72。

> **隐私第一：本仓库是公开仓库，音频与原始照片不要 commit 进 Git。**
> 素材请放到私有位置（Supabase Storage 私有 bucket，或直接发给 Dev 后由 Dev 上传），
> 代码仓库里只放**最终可公开的模型文件**（Live2D 模型、压缩后的贴图）。

---

## 1. 形象（Live2D）

### 1.1 最省事的路径：一张正面照 + 建模委托

- **1–3 张正面清晰照**：光线均匀、无滤镜、不要侧脸、不要遮挡发际线；
  分辨率 ≥ 2000px 长边；纯色或简单背景。
- 建模交给你选定的 Live2D 画师/建模师（Cubism 4）。
- 交付物（缺一不可）：

| 文件 | 说明 |
|---|---|
| `*.model3.json` | 模型入口 |
| `*.moc3` | 变形数据 |
| `*.physics3.json` | 头发/衣物摆动（可选但强烈建议） |
| `*.pose3.json` | 姿势（可选） |
| `*.cdi3.json` | 参数显示名（可选） |
| 贴图 | 通常 2048×2048，多张 |
| `motions/*.motion3.json` | 待机、说话、思考至少各 1 个 |

### 1.2 如果自己做：分层要求

- 头部、眼睛（左右）、眉毛、嘴（开合/笑）、头发前/后、身体、手臂 分开图层；
- 嘴巴建议做 3 个口型（闭/半开/开），方便以后口型同步；
- 眼睛单独图层，方便眨眼与视线跟随。

### 1.3 前端会怎么用

- 路径：`public/avatar/<fenshen_id>/model.model3.json`；
- 切换分身 = 换目录；加载失败或低端设备回退到 `public/avatar.png`（不白屏）；
- 页面不可见或舞台折叠时暂停渲染循环（省电）。

### 1.4 如果不想做 Live2D

VRM 也可以：一个 `.vrm` 文件（`@pixiv/three-vrm` 渲染），但 Live2D 更贴近 2D 形象。

---

## 2. 声音（克隆 TTS）

### 2.1 录音要求

| 项目 | 要求 |
|---|---|
| 时长 | **最少 3 分钟**，推荐 **10–30 分钟**（ElevenLabs 专业克隆建议 30 分钟以上） |
| 格式 | WAV / FLAC，44.1kHz 或 48kHz，单声道 |
| 环境 | 安静房间，无回声、无音乐、无键盘声；手机自带录音也可以，但要贴近 |
| 内容 | 自然朗读：陈述句、疑问句、短句、长句都有；语速平稳；不要念数字列表 |
| 情绪 | 2–3 种：平静叙述、轻松、认真；每种 1–2 分钟 |
| 分段 | 每段 15–60 秒，单独文件；文件数 10–20 个比一个大文件好 |

### 2.2 你不需要做的

- 不需要自己跑克隆模型；服务端会调用 ElevenLabs / Fish Audio；
- API key 只存在服务端，前端永远拿不到；
- 原始音频存私有存储，不会出现在公开仓库或 PWA 静态资源里。

### 2.3 交付后的流程

1. Dev 用你的样本在服务端创建 `voice_id`；
2. `voice_id` 写进 fenshen 配置（每个分身一个声音）；
3. PWA 收到回复时按需合成、缓存，静默模式不播；
4. 你可以在设置页试听、切换声音。

---

## 3. 时间线建议

| 阶段 | 内容 | 依赖 |
|---|---|---|
| P1 | 静态 Live2D 渲染 + 一个固定声音 | 模型文件 + 3 分钟音频 |
| P2 | 多分身多声音切换 + 缓存 | 每个分身各一套素材 |
| P3 | 口型同步 | 模型含口型参数 + TTS 音频时间戳 |

## 4. 隐私与保留

- 克隆声音属于你的生物特征数据；删除时同时删除私有存储中的样本与派生的 `voice_id`；
- 元婴不会把你的声音用于其他用户（单用户产品）；
- 素材的保留期限由你决定，随时可以要求删除。

---

## 5. 交付契约（精确到文件）— 2026-10-25

> English version (normative, for the modeler): [`avatar-delivery-contract.md`](./avatar-delivery-contract.md)

> 关键点：**PSD 本身不能运行**。PWA 只能加载 Cubism 导出的运行时文件。
> PSD 是建模源文件，交付物是下面的导出包。

### 5.1 一个 zip，目录结构必须完全一致

```text
xiaowu.zip
└── xiaowu/
    ├── xiaowu.model3.json        # 必需：入口，内部路径用相对路径
    ├── xiaowu.moc3               # 必需：变形数据（与 Core 版本匹配）
    ├── xiaowu.physics3.json      # 强烈建议：头发/衣物摆动
    ├── xiaowu.pose3.json         # 可选
    ├── xiaowu.cdi3.json          # 可选：参数显示名
    ├── texture_00.png            # 必需：≤2048×2048，PNG
    ├── texture_01.png            # 可选：最多 4 张，合计 ≤8 MB
    ├── motions/
    │   ├── idle.motion3.json     # 必需：待机循环
    │   ├── talk.motion3.json     # 必需：说话（可与口型参数联动）
    │   └── tap.motion3.json      # 可选：点击反应
    └── expressions/
        ├── neutral.exp3.json     # 可选
        └── smile.exp3.json       # 可选
```

- 顶层目录名 = `fenshen_id`（目前 `xiaowu`），我直接放到 `public/avatar/xiaowu/`。
- `.model3.json` 里所有路径必须是相对路径（不能出现 `C:\...` 或绝对路径）。
- 不要包含 `.cmo3`、`.psd`、`.clip`、`.can3` 等源文件（它们是私有素材，不进公开仓库）。

### 5.2 Cubism 版本（已确定目标：Cubism 5.x / Core 5.x）

- **目标：Cubism Editor 5.x 导出，运行时 Core 5.x。**
- 导出前在 Editor 里显式选择**模型目标版本**（SDK 5.0 建议），并记录 **Core 版本**（如 5.0.0 / 5.3.1）。
- **不预先锁定 Core 补丁版本**：第一份 `.moc3` 生成后，用 Live2D 的 moc3 consistency checker 对目标 Core 校验通过，再把运行版本冻结。
- 如果模型用了目标运行时表达不了的功能（如 5.3 混合模式/离屏绘制），我们要求回退到最低可用目标版本重新导出——这是 Editor 里的一次选择，不需要重新绑定。
- 交付时请在 zip 里放 `version.txt`（editor / target / core / exported_at / canvas_origin）。

### 5.3 参数与动作约定（决定能不能"说话/眨眼"）

- 保留标准参数 ID：`ParamMouthOpenY`、`ParamEyeLOpen`、`ParamEyeROpen`、`ParamAngleX/Y/Z`、`ParamBodyAngleX`、`ParamBreath`。
- 自定义参数可以加，但请附一行说明（ID + 用途），否则表情驱动会失效。
- `idle` 必须是可循环动作；`talk` 建议 2–4 秒、可循环；动作名就用 `idle` / `talk` / `tap`。
- 口型：仅需要 `ParamMouthOpenY`（0–1 线性）；以后做 lip sync 时我按 TTS 音量驱动它。

### 5.4 技术上限（移动端）

| 项目 | 上限 |
|---|---|
| 贴图 | 每张 ≤2048×2048，最多 4 张，合计 ≤8 MB |
| 网格 | 总顶点数 ≤30k（手机 60fps 目标） |
| 文件数 | ≤30 个 |
| 模型尺寸 | 画布高度约 1500–2000 px，原点在脚底/胸口（告诉我即可） |

超限不是不能跑，但首页常驻会掉帧/耗电；超了我会先压贴图。

### 5.5 声音（同一批交付）

```text
voice.zip
└── voice/
    ├── 01.wav … 10.wav           # 44.1kHz / 48kHz，单声道，16-bit
```

- 每段 15–60 秒，10–20 段，总时长 ≥3 分钟（10–30 分钟最佳）。
- 文件名不必有意义；我会按顺序拼接做克隆，并记录每段内容摘要。
- **不要**放进 Git：音频是生物特征数据，走私有存储或直接发我。

### 5.6 我拿到之后的动作

1. 解压到 `public/avatar/xiaowu/`，校验 JSON 路径与贴图完整性；
2. 接入 `pixi-live2d-display`（Cubism 4/5 用 `live2dcubismcore.min.js`），失败回退 `avatar.png`；
3. 默认动作 `idle`，说话时叠加 `talk` + `ParamMouthOpenY`；
4. 页面不可见/舞台折叠时暂停渲染；
5. 手机上验收：首屏 <2 秒、静止时不掉帧、切后台回来能恢复。

### 5.7 我现在的阻塞

只需要两样：**① 上面的 `xiaowu.zip`（Cubism 导出）**、**② `voice.zip`（≥3 分钟录音）**。
PSD 请留在你那边（或私有存储），它不参与运行。
