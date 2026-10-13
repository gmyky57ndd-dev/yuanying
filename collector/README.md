# 元婴采集器（Android）

P2 的 Android 活动采集器。独立 App，只负责采集手机 App 使用数据并上报到元婴后端，
不含 UI 业务逻辑。详见《元婴 — 工程交付规格 v1》第 6 节与附录 C。

## 前置

- Node.js 18+
- Android Studio（含 Android SDK / JDK 17）

## 构建

`android/` 平台工程已生成并提交到本仓库，直接构建即可：

```bash
cd collector
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

产物：`collector/android/app/build/outputs/apk/debug/app-debug.apk`

或推送到 GitHub 后在 Actions → **Android Collector** 下载 APK artifact。

从零重建平台（如需）：

```bash
cd collector
npx cap add android
```

之后用本仓库版本覆盖 `android/app/src/main/` 下的 Java / Manifest / layout 文件。

## 配置后端地址

编辑 `android/app/src/main/java/com/yourorg/yuanying/collector/ApiClient.java`
与 `ConfigClient.java` 中的 `API_BASE`，改为你的 Vercel 生产域名
（默认 `https://yuanying-rust.vercel.app`）。

## 构建 APK

```bash
npx cap sync android
npx cap open android   # 在 Android Studio 中 Build > Build APK
```

或命令行（需已安装 Android SDK）：

```bash
cd android && ./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

## 依赖

- `androidx.work:work-runtime` — 每小时后台调度
- `com.squareup.okhttp3:okhttp` — HTTP 上报
- `androidx.appcompat:appcompat` — 配置页

## 权限

- `PACKAGE_USAGE_STATS`（特殊权限，需引导用户到系统设置手动授予）
- `INTERNET` / `ACCESS_NETWORK_STATE`
- `RECEIVE_BOOT_COMPLETED`

## 切换开关

PWA 的 `/settings` 页面切换 `activity_collection_enabled`；
采集器每次 Worker 执行前会读取 `/api/config`，关闭后停止上报。
