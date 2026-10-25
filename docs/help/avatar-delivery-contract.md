# Avatar & Voice Delivery Contract

**Audience:** the person preparing the Live2D model and voice samples (owner / illustrator / modeler).
**Consumer:** the 元婴 PWA (`AvatarStage` + server-side TTS).
**Status:** normative — if a file or field is missing, the model will not load or will silently fall back to the static image.

> **A PSD is not runnable.** The PWA loads Cubism runtime files, not layered source
> files. The PSD in the reference workflow is the *input* to rigging; the
> deliverable is the **Cubism export** described below.

---

## 1. Deliverable 1 — Live2D model (one zip)

```text
xiaowu.zip
└── xiaowu/                          # folder name == fenshen id
    ├── xiaowu.model3.json            # REQUIRED — entry point
    ├── xiaowu.moc3                   # REQUIRED — deformation data
    ├── xiaowu.physics3.json          # STRONGLY RECOMMENDED — hair/cloth sway
    ├── xiaowu.pose3.json             # optional
    ├── xiaowu.cdi3.json              # optional — parameter display names
    ├── texture_00.png                # REQUIRED
    ├── texture_01.png                # optional (up to 4 textures)
    ├── motions/
    │   ├── idle.motion3.json         # REQUIRED — loopable
    │   ├── talk.motion3.json         # REQUIRED — loopable
    │   └── tap.motion3.json          # optional
    └── expressions/
        ├── neutral.exp3.json         # optional
        └── smile.exp3.json           # optional
```

**Do not include** `.cmo3`, `.psd`, `.clip`, `.can3`, or any layered source file.
Those stay private; only the export goes into the repository.

### 1.1 Path rules

- Every path inside `xiaowu.model3.json` must be **relative** to that file
  (e.g. `texture_00.png`, `motions/idle.motion3.json`).
- Absolute paths (`C:\...`, `/Users/...`) break the loader.
- The top-level folder name is the **fenshen id**; it is copied verbatim to
  `public/avatar/<fenshen_id>/`.

### 1.2 Cubism version (must be stated)

| Item | Requirement |
| --- | --- |
| Authoring tool | Cubism Editor **4.2 or 5** (Cubism 3 projects are acceptable if declared) |
| Core version | State the **Cubism Core / SDK version** used to export |
| Compatibility | `moc3` must match the bundled `live2dcubismcore.min.js`; a Cubism 3 `moc3` will not run on the 5.x Core and vice versa |
| Export format | `.moc3` (not `.moc`), motion v3 (`.motion3.json`), physics v3, expression `.exp3.json` |

The server bundles one Core version per deployment. **Tell us the Core version
before exporting** so the matching runtime is pinned.

### 1.3 Sizing limits (mobile-first)

| Resource | Limit |
| --- | --- |
| Texture | ≤ 2048 × 2048 px each, PNG, **≤ 4 textures**, total ≤ 8 MB |
| Geometry | ≤ 30k vertices total (60 fps target on a phone) |
| Files | ≤ 30 files in the zip |
| Canvas | model height roughly 1500–2000 px; origin at feet or chest — just tell us which |
| Audio (if bundled) | not part of the model zip |

Exceeding the limits is not fatal but the avatar is always-on on the home screen;
oversized assets drain battery. We will downscale textures if needed.

### 1.4 Parameters and motions

Keep the standard parameter IDs so the runtime can drive expressions and lip
sync without a mapping table:

| Purpose | Parameter ID |
| --- | --- |
| Mouth open (0–1 linear) | `ParamMouthOpenY` |
| Eye open L / R | `ParamEyeLOpen`, `ParamEyeROpen` |
| Eyeball X / Y | `ParamEyeBallX`, `ParamEyeBallY` |
| Head angle | `ParamAngleX`, `ParamAngleY`, `ParamAngleZ` |
| Body angle | `ParamBodyAngleX`, `ParamBodyAngleY`, `ParamBodyAngleZ` |
| Breathing | `ParamBreath` |

- Custom parameters are allowed; attach a one-line list (`ID — purpose`), or the
  expression/lip-sync layer cannot find them.
- Motion names are fixed: `idle` (loop), `talk` (loop), `tap` (one-shot).
- `idle` must loop seamlessly; `talk` should be 2–4 s and loop.
- Mouth animation only needs `ParamMouthOpenY`; future lip sync will drive it from
  TTS amplitude.

### 1.5 What the app does with it

1. Copies the folder to `public/avatar/<fenshen_id>/`.
2. Renders with `pixi-live2d-display` + the matching Cubism Core.
3. Plays `idle`; overlay `talk` + `ParamMouthOpenY` while speaking.
4. Falls back to `public/avatar.png` if the model is missing, fails to load, or the
   device is low-end — never a blank screen.
5. Pauses the render loop when the tab is hidden or the stage is collapsed.

---

## 2. Deliverable 2 — Voice samples (one zip)

```text
voice.zip
└── voice/
    ├── 01.wav
    ├── 02.wav
    └── … up to 20 files
```

| Item | Requirement |
| --- | --- |
| Container | WAV (preferred) or FLAC |
| Sample rate | 44.1 kHz or 48 kHz |
| Channels | mono |
| Bit depth | 16-bit |
| Clip length | 15–60 s each |
| Count | 10–20 clips |
| Total duration | **≥ 3 min** (10–30 min is ideal) |
| Content | natural speech: statements, questions, short and long sentences; 2–3 moods (calm / light / serious) |
| Environment | quiet room, no music, no keyboard, no echo |
| Naming | `01.wav`, `02.wav`, … (order matters, content summary optional) |

The samples are used **server-side only** (ElevenLabs / Fish Audio); the API key
never reaches the browser. Cloned voice data is biometric: it is stored privately
and deleted on request.

---

## 3. Where to deliver

| Asset | Destination |
| --- | --- |
| `xiaowu.zip` (model) | private upload, or hand to Dev; the *unpacked* model lands in `public/avatar/xiaowu/` |
| `voice.zip` | private upload only — **never** commit audio to this repository (it is public) |
| PSD / Cubism project | keep locally or in private storage; not consumed at runtime |

Repository is **public**: model + textures are public-safe; photos, PSDs, `.cmo3`
and voice samples are not.

---

## 4. Acceptance checks (performed by Dev on receipt)

- [ ] `xiaowu.model3.json` parses, every referenced path exists, no absolute paths.
- [ ] The model loads in the stage and plays `idle` without console errors.
- [ ] `ParamMouthOpenY` opens the mouth; `ParamEyeLOpen` blinks.
- [ ] Talking overlays `talk` and returns to `idle`.
- [ ] Total textures ≤ 8 MB; first paint < 2 s on a phone; hidden tab pauses.
- [ ] Removing the folder falls back to `avatar.png` with no error UI.
- [ ] `voice.zip` decodes, is mono 44.1/48 kHz, total ≥ 3 min, and clones cleanly.

## 5. Open question blocking the start

**Which Cubism Editor / Core version will be used?** The renderer pins one Core
build; answer this and the integration can start immediately.
