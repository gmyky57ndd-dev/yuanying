# 文件二：yuanying-engineering-spec-v2.md  
```
markdown
# 元婴 — 工程交付规格 v2

**版本**：v2.0
**日期**：2026-03-17
**范围**：P0 + P1
**预计工期**：14 天
**读者**：工程团队

---

## 目录

1. [v2 相对 v1 的变更](#1-v2-相对-v1-的变更)
2. [系统架构](#2-系统架构)
3. [数据 Schema](#3-数据-schema)
4. [API 端点](#4-api-端点)
5. [P0：移除 sit，修复按钮](#5-p0移除-sit修复按钮)
6. [P1：主动语音提醒](#6-p1主动语音提醒)
7. [P1：被动步数采集](#7-p1被动步数采集)
8. [Stelio 迁移清单](#8-stelio-迁移清单)
9. [每日验收检查点](#9-每日验收检查点)
10. [明确不做](#10-明确不做)
11. [交付定义](#11-交付定义)
12. [附录 A：提醒调度器（可运行代码）](#附录-a提醒调度器可运行代码)
13. [附录 B：HealthConnect 采集（可运行代码）](#附录-bhealthconnect-采集可运行代码)
14. [附录 C：调试与故障排查](#附录-c调试与故障排查)

---

## 1. v2 相对 v1 的变更

| 变更 | 说明 |
|---|---|
| **移除 `sit` 按钮** | 替换为每小时语音提醒 + 被动步数采集 |
| **保留 `wake` / `sleep` / `water`** | 界面简化为 3 个按钮 |
| **新增主动语音提醒** | 水、起身、维生素 |
| **新增被动步数采集** | Android HealthConnect |
| **数据 schema 扩展** | `reminders` 表；signals 允许 `steps`/`reminder_*` |
| **去除的数据项** | `sit`（不迁移）；`write a note`（Blink 覆盖）；`digest`（暂不） |
| **保留的 v1 特性** | PWA、DeepSeek、Supabase、4 层架构、SW、错误处理、乐观更新、system prompt 加载 core 文件、元婴对不确定说"我不知道" |

---

## 2. 系统架构

```
┌───────────────────────────────────────────────────────┐ │ 客户端层 │ │ │ │ ┌────────────────┐ ┌──────────────────────┐ │ │ │ PWA (手机) │ │ Android 采集器 │ │ │ │ Next.js 14 │ │ Capacitor + Java │ │ │ │ - Chat │ │ - UsageStats │ │ │ │ - 3 buttons │ │ - HealthConnect │ │ │ │ - SW │ │ - WorkManager │ │ │ │ - TTS │ │ - Notification │ │ │ └────────┬───────┘ └──────────┬───────────┘ │ └───────────┼────────────────────────────┼─────────────┘ │ HTTPS │ HTTPS ┌───────────▼────────────────────────────▼─────────────┐ │ 应用层 — Vercel Serverless │ │ /api/chat /api/signal /api/activity /api/history │ │ /api/summary /api/config │ │ /api/reminder/schedule /api/reminder/due │ │ /api/reminder/act │ │ /api/steps /api/steps/today │ │ /api/cron/water /api/cron/standup /api/cron/vitamin│ └─────────────────────────┬─────────────────────────────┘ │ ┌─────────────────────────▼─────────────────────────────┐ │ 数据层 — Supabase Postgres │ │ messages | signals | reminders | config | activity_logs│ └───────────────────────────────────────────────────────┘ │ ┌─────────────────────────▼─────────────────────────────┐ │ 模型层 — DeepSeek API │ │ 语音层 — Web Speech API / Android TTS │ └───────────────────────────────────────────────────────┘  
```
text
**技术栈固定，不得替换**：

| 层 | 选型 |
|---|---|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind |
| 部署 | Vercel |
| 数据库 | Supabase (Postgres, service role) |
| 模型 | DeepSeek `deepseek-chat` |
| 移动桥接 | Capacitor 6（Android 采集器） |
| 语音（PWA） | Web Speech API |
| 语音（Android） | Android TextToSpeech |
| 步数 | Android HealthConnect 1.1.0 |

---

## 3. 数据 Schema

### 3.1 完整迁移脚本

```sql
-- =============================================
-- 元婴 v2 Schema 迁移
-- 从 v1 升级到 v2，执行方式：Supabase SQL Editor
-- =============================================

-- 1. 移除 v1 信号约束
alter table signals drop constraint if exists v1_signal_name;

-- 2. 添加 v2 信号约束
alter table signals add constraint v2_signal_name check (
  name in (
    'wake', 'sleep', 'water',
    'app_usage', 'phone_unlock',
    'steps',
    'reminder_shown', 'reminder_acted'
  )
);

-- 3. 新增 reminders 表
create table if not exists reminders (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  name          text not null check (name in ('water', 'standup', 'vitamin')),
  scheduled_at  timestamptz not null,
  shown_at      timestamptz,
  acted_at      timestamptz,
  dismissed_at  timestamptz,
  context       jsonb default '{}'::jsonb
);

create index if not exists idx_reminders_scheduled 
  on reminders (scheduled_at desc);
create index if not exists idx_reminders_name_scheduled 
  on reminders (name, scheduled_at desc);
create index if not exists idx_reminders_unshown 
  on reminders (scheduled_at)
  where shown_at is null;

-- 4. 扩展 config 表默认值
insert into config (key, value) values
  ('reminders_enabled', '{"water":true,"standup":true,"vitamin":true}'::jsonb),
  ('steps_goal', '5000'::jsonb)
on conflict (key) do nothing;

```
**3.2 信号 JSON 格式**  
**steps**  
```
json
{
  "name": "steps",
  "type": "count",
  "value": 2340,
  "source": "passive",
  "context": {
    "window_start": "2026-03-17T00:00:00Z",
    "window_end": "2026-03-17T15:00:00Z",
    "platform": "android"
  }
}

```
**reminder_shown / reminder_acted**  
```
json
{
  "name": "reminder_acted",
  "type": "event",
  "value": true,
  "source": "manual",
  "context": {
    "reminder_name": "water",
    "reminder_id": 42
  }
}

```
  
**4. API 端点**  
**4.1 保留端点**  
  
  

| 端点                 | 变更                   |
| ------------------ | -------------------- |
| POST /api/chat     | 无变更                  |
| POST /api/signal   | 只接受 wake/sleep/water |
| GET /api/signal    | 无变更                  |
| GET /api/history   | 无变更                  |
| GET /api/summary   | 无变更                  |
| POST /api/activity | 无变更                  |
| GET /api/config    | 无变更                  |
  
****4.2 新增端点（P1）****  
```
GET /api/reminder/due

```
获取当前到期的提醒（客户端每 5 分钟轮询）。  
**响应**：  
```
typescript
interface DueReminder {
  id: number;
  name: 'water' | 'standup' | 'vitamin';
  message: string;
  voice_text: string;
  scheduled_at: string;
}

interface DueResponse {
  reminders: DueReminder[];
}
POST /api/reminder/act

```
记录用户响应。  
**请求**：  
```
typescript
interface ActRequest {
  reminder_id: number;
  action: 'acted' | 'dismissed' | 'snoozed';
}
POST /api/steps

```
上报步数。  
**请求**：  
```
typescript
interface StepsRequest {
  window_start: string;
  window_end: string;
  steps: number;
  platform: 'android';
}
GET /api/steps/today

```
**响应**：  
```
typescript
interface StepsTodayResponse {
  steps: number;
  goal: number;
  updated_at: string;
}

```
**4.3 Cron 端点（Vercel Cron）**  
* GET /api/cron/water —— 每日 10:30 / 15:30 / 20:00  
* GET /api/cron/standup —— 每小时 09:00–18:00  
* GET /api/cron/vitamin —— 每日 08:30  
全部需要 Authorization: Bearer ${CRON_SECRET} 验证。  
vercel.json：  
```
json
{
  "crons": [
    { "path": "/api/cron/standup", "schedule": "0 9-18 * * *" },
    { "path": "/api/cron/water", "schedule": "30 10,15,20 * * *" },
    { "path": "/api/cron/vitamin", "schedule": "30 8 * * *" }
  ]
}

```
  
**5. P0：移除 sit，修复按钮**  
**5.1 前端变更**  
app/page.tsx：  
```
typescript
const SIGNALS = ['wake', 'sleep', 'water'] as const;

```
app/api/signal/route.ts：  
```
typescript
const VALID_NAMES = ['wake', 'sleep', 'water'] as const;
const IDEMPOTENT = ['wake', 'sleep'];  // water 允许累加

```
**5.2 验收标准**  
* □ 界面只剩 3 个按钮  
* □ wake/sleep 点击后变绿，刷新保持，重复点击不新建  
* □ water 点击后显示 ×N，刷新保持  
* □ 无 sit 相关的任何 UI 或逻辑  
  
**6. P1：主动语音提醒**  
**6.1 三项提醒规则**  
  
  

| 提醒      | 时间                    | 条件            | 消息     | 语音        |
| ------- | --------------------- | ------------- | ------ | --------- |
| water   | 10:30 / 15:30 / 20:00 | 今日 water < 6  | "水。"   | "该喝水了。"   |
| standup | 每小时（09–18）            | 距上次活动 > 50 分钟 | "站。"   | "站起来走走。"  |
| vitamin | 08:30                 | 当日未标记         | "维生素。" | "吃维生素了吗？" |
  
完整实现见 附录 A。  
**6.2 客户端 TTS**  
components/ReminderPoller.tsx：见附录 A.4。  
**6.3 提醒与对话联动**  
System prompt 中附加最近 2 小时的提醒记录，使元婴可引用。  
**6.4 用户控制**  
设置页新增开关（默认全开）：  
```
yaml
reminders:
  water: { enabled: true, times: ["10:30", "15:30", "20:00"] }
  standup: { enabled: true, hours: [9, 18] }
  vitamin: { enabled: true, time: "08:30" }

```
**6.5 验收标准**  
* □ water 提醒在设定时间触发（测试时改为 2 分钟后）  
* □ 语音清晰，中文播报  
* □ 通知出现在锁屏 / 通知中心  
* □ 用户点击，标记 acted  
* □ 同一时段不重复提醒  
* □ 关闭开关后不再触发  
* □ standup 在 50 分钟无活动后触发  
  
**7. P1：被动步数采集**  
**7.1 Android HealthConnect 接入**  
完整实现见 附录 B。  
**7.2 iOS 降级方案**  
**v2 决策**：iOS 不实现被动步数。仅 Android 支持。  
**7.3 服务端处理**  
POST /api/steps：校验 steps 为非负数字，写入 signals 表。  
**7.4 验收标准**  
* □ Android 采集器请求 HealthConnect 权限  
* □ 用户授予后，每小时上报步数  
* □ Supabase 出现 name='steps' 记录  
* □ 对话中可引用步数  
  
**8. Stelio 迁移清单**  
  
  

| Stelio 习惯      | 元婴承接        | 数据来源     | 触发    |
| -------------- | ----------- | -------- | ----- |
| Vitamins       | 主动语音提醒      | 用户响应     | 08:30 |
| Step outside   | 被动采集        | 步数 + 定位  | 自动    |
| Walk 5000      | 被动采集        | 步数       | 自动    |
| Eat vegetables | 主动语音提醒      | 用户响应     | 晚餐    |
| Sleep before   | 被动采集（P2）    | 锁屏时间     | 自动    |
| Drink water    | 主动语音提醒      | 用户响应     | 定时    |
| Write a note   | 不承接         | Blink 覆盖 | —     |
| Digest         | 不承接         | 暂不需要     | —     |
| wake-up Time   | 被动采集（P2）或手动 | 首次解锁     | 自动    |
  
**v2 实际迁移**：vitamins / water / step outside / walk 5000。  
  
**9. 每日验收检查点**  
  
  

| Day | 验收项                | 判定方法             | 负责         |
| --- | ------------------ | ---------------- | ---------- |
| 1   | 移除 sit，3 按钮工作      | 手机实操             | 前端         |
| 2   | 数据 schema 迁移完成     | Supabase 查询      | 后端         |
| 3   | Cron 配置部署          | Vercel Dashboard | 后端         |
| 4   | water 提醒触发（测试模式）   | 手动触发             | 前端         |
| 5   | TTS 播报正常           | 手机实操             | 前端         |
| 6   | standup 提醒触发       | 模拟无活动            | 后端 + 前端    |
| 7   | vitamin 提醒触发       | 手动触发             | 后端 + 前端    |
| 8   | HealthConnect 权限流程 | 授予权限             | Android    |
| 9   | 步数上报成功             | Supabase 查询      | Android    |
| 10  | 对话引用步数             | 手机实操             | 前端         |
| 11  | 提醒开关有效             | 设置页测试            | 前端         |
| 12  | 提醒与对话联动            | 手机实操             | 前端         |
| 13  | 端到端回归              | 全流程              | 全体         |
| 14  | 交付评审               | 对照"做对了"          | You + Tech |
  
**10. 明确不做**  
* 动画头像  
* 晨晚简报  
* 学习模型 / 模式引擎  
* 元婴人格定制 UI  
* 锁屏集成  
* 桌面伴侣  
* 模型路由  
* 多用户 / 认证  
* iOS 被动步数  
* iOS wake/sleep 被动采集  
* 数据分析可视化  
* 社交 / 分享  
* Stelio 的 9 个习惯全部迁移  
  
**11. 交付定义**  
v2 完成后验收：  
1. PWA 有 3 个按钮（wake/sleep/water），工作正常  
2. water 提醒在 10:30 / 15:30 / 20:00 语音播报  
3. standup 提醒在久坐后语音播报  
4. vitamin 提醒在 08:30 语音播报  
5. Android 采集器每小时上报步数  
6. 对话中可引用信号和提醒  
7. 连续使用 7 天，无重大 bug  
8. 用户体验符合《产品意图简报 v1.1》  
  
**附录 A：提醒调度器（可运行代码）**  
**A.1 类型定义**  
lib/reminder-types.ts：  
```
typescript
export type ReminderName = 'water' | 'standup' | 'vitamin';

export interface ReminderConfig {
  name: ReminderName;
  shouldFire: (ctx: UserContext) => boolean | Promise<boolean>;
  buildMessage: (ctx: UserContext) => { message: string; voice_text: string };
}

export interface UserContext {
  now: Date;
  todaySignals: Array<{ name: string; created_at: string; context?: any }>;
  recentSignals: Array<{ name: string; created_at: string }>;
  config: Record<string, any>;
}

```
**A.2 核心调度器**  
lib/reminder-scheduler.ts：  
```
typescript
import { supabase } from './db';
import { ReminderConfig, ReminderName, UserContext } from './reminder-types';

const WATER_TARGET = 6;
const STANDUP_IDLE_MINUTES = 50;

async function loadUserContext(): Promise<UserContext> {
  const now = new Date();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const fiftyMinAgo = new Date(now.getTime() - STANDUP_IDLE_MINUTES * 60 * 1000);
  
  const [todayRes, recentRes, configRes] = await Promise.all([
    supabase
      .from('signals')
      .select('name, created_at, context')
      .gte('created_at', startOfDay.toISOString()),
    supabase
      .from('signals')
      .select('name, created_at')
      .gte('created_at', fiftyMinAgo.toISOString())
      .in('name', ['steps', 'app_usage']),
    supabase.from('config').select('*'),
  ]);
  
  const config = Object.fromEntries(
    (configRes.data ?? []).map(r => [r.key, r.value])
  );
  
  return {
    now,
    todaySignals: todayRes.data ?? [],
    recentSignals: recentRes.data ?? [],
    config,
  };
}

function isInScheduleWindow(name: ReminderName, now: Date): boolean {
  const h = now.getHours();
  const m = now.getMinutes();
  
  switch (name) {
    case 'water':
      return (h === 10 && m >= 30) ||
             (h === 15 && m >= 30) ||
             (h === 20 && m >= 0);
    case 'standup':
      return h >= 9 && h < 18;
    case 'vitamin':
      return h === 8 && m >= 30;
  }
}

async function hasRecentReminder(
  name: ReminderName,
  withinMinutes: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000);
  const { data } = await supabase
    .from('reminders')
    .select('id')
    .eq('name', name)
    .gte('scheduled_at', cutoff.toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

const REMINDERS: ReminderConfig[] = [
  {
    name: 'water',
    shouldFire: ctx => {
      const count = ctx.todaySignals.filter(s => s.name === 'water').length;
      return count < WATER_TARGET;
    },
    buildMessage: () => ({
      message: '水。',
      voice_text: '该喝水了。',
    }),
  },
  {
    name: 'standup',
    shouldFire: ctx => ctx.recentSignals.length === 0,
    buildMessage: () => ({
      message: '站。',
      voice_text: '站起来走走。',
    }),
  },
  {
    name: 'vitamin',
    shouldFire: ctx => {
      return !ctx.todaySignals.some(
        s =>
          s.name === 'reminder_acted' &&
          s.context?.reminder_name === 'vitamin'
      );
    },
    buildMessage: () => ({
      message: '维生素。',
      voice_text: '吃维生素了吗？',
    }),
  },
];

export async function fireDueReminders(
  filterName?: ReminderName
): Promise<{ fired: ReminderName[] }> {
  const ctx = await loadUserContext();
  const fired: ReminderName[] = [];
  
  // 检查全局开关
  const enabled = ctx.config.reminders_enabled ?? {};
  
  for (const config of REMINDERS) {
    if (filterName && config.name !== filterName) continue;
    if (enabled[config.name] === false) continue;
    if (!isInScheduleWindow(config.name, ctx.now)) continue;
    
    const should = await config.shouldFire(ctx);
    if (!should) continue;
    
    const alreadyShown = await hasRecentReminder(config.name, 30);
    if (alreadyShown) continue;
    
    const { message, voice_text } = config.buildMessage(ctx);
    
    const { error } = await supabase.from('reminders').insert({
      name: config.name,
      scheduled_at: ctx.now.toISOString(),
      context: { message, voice_text },
    });
    
    if (!error) fired.push(config.name);
  }
  
  return { fired };
}

```
**A.3 Cron 端点**  
app/api/cron/water/route.ts：  
```
typescript
import { NextResponse } from 'next/server';
import { fireDueReminders } from '@/lib/reminder-scheduler';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  
  const { fired } = await fireDueReminders('water');
  return NextResponse.json({ ok: true, fired });
}

```
app/api/cron/standup/route.ts：同理，fireDueReminders('standup')  
app/api/cron/vitamin/route.ts：同理，fireDueReminders('vitamin')  
**A.4 客户端轮询与 TTS**  
components/ReminderPoller.tsx：  
```
typescript
'use client';
import { useEffect, useRef } from 'react';

interface DueReminder {
  id: number;
  name: string;
  message: string;
  voice_text: string;
  scheduled_at: string;
}

export function ReminderPoller() {
  const lastCheck = useRef(0);
  const spoken = useRef<Set<number>>(new Set());
  
  useEffect(() => {
    async function check() {
      // 节流：5 分钟内只检查一次
      if (Date.now() - lastCheck.current < 5 * 60 * 1000) return;
      lastCheck.current = Date.now();
      
      try {
        const res = await fetch('/api/reminder/due');
        const data: { reminders: DueReminder[] } = await res.json();
        
        if (!data.reminders || data.reminders.length === 0) return;
        
        for (const r of data.reminders) {
          if (spoken.current.has(r.id)) continue;
          spoken.current.add(r.id);
          await playReminder(r);
        }
      } catch (err) {
        console.error('reminder poll failed:', err);
      }
    }
    
    check();
    const interval = setInterval(check, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  return null;
}

async function playReminder(r: DueReminder): Promise<void> {
  // 1. TTS 播报
  await speak(r.voice_text);
  
  // 2. 通知
  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('元婴', {
      body: r.message,
      icon: '/avatar.png',
      tag: `reminder-${r.id}`,
    });
    
    notification.onclick = () => {
      fetch('/api/reminder/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_id: r.id, action: 'acted' }),
      });
      notification.close();
    };
  }
}

function speak(text: string, lang = 'zh-CN'): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      resolve();
      return;
    }
    
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.volume = 0.8;
    
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith('zh'));
    if (zhVoice) utterance.voice = zhVoice;
    
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    
    window.speechSynthesis.speak(utterance);
  });
}

```
**A.5 挂载到 layout**  
app/layout.tsx：  
```
tsx
import { SWRegister } from '@/components/SWRegister';
import { ReminderPoller } from '@/components/ReminderPoller';

// ...
<body>
  <SWRegister />
  <ReminderPoller />
  {children}
</body>

```
  
**附录 B：HealthConnect 采集（可运行代码）**  
**B.1 Gradle 依赖**  
android/app/build.gradle：  
```
gradle
dependencies {
    implementation "androidx.health.connect:connect-client:1.1.0-alpha10"
    implementation "androidx.work:work-runtime:2.9.0"
    implementation "com.squareup.okhttp3:okhttp:4.12.0"
    implementation "org.json:json:20240303"
    implementation project(':capacitor-android')
}

```
**B.2 AndroidManifest.xml**  
```
xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
        tools:ignore="ProtectedPermissions" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- HealthConnect -->
    <uses-permission android:name="android.permission.health.READ_STEPS" />

    <application>
        <!-- HealthConnect 权限 rationale -->
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".MainActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
        
        <activity android:name=".MainActivity" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>

```
**B.3 StepsCollector.java**  
```
java
package com.yourorg.yuanying.collector;

import android.content.Context;
import android.util.Log;

import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.permission.HealthPermission;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.response.ReadRecordsResponse;
import androidx.health.connect.client.time.TimeRangeFilter;

import org.json.JSONObject;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;

public class StepsCollector {
    
    private static final String TAG = "StepsCollector";
    
    public static final Set<String> PERMISSIONS = Set.of(
        HealthPermission.getReadPermission(StepsRecord.class)
    );
    
    private final Context ctx;
    private final HealthConnectClient client;
    
    public StepsCollector(Context ctx) {
        this.ctx = ctx;
        this.client = HealthConnectClient.getOrCreate(ctx);
    }
    
    public boolean hasPermission() {
        try {
            Set<String> granted = kotlinx.coroutines.BuildersKt.runBlocking(
                kotlin.coroutines.EmptyCoroutineContext.INSTANCE,
                (scope, continuation) -> client.getPermissionController()
                    .getGrantedPermissions(continuation)
            );
            return granted.containsAll(PERMISSIONS);
        } catch (Exception e) {
            Log.e(TAG, "permission check failed", e);
            return false;
        }
    }
    
    public JSONObject collectToday() throws Exception {
        Instant now = Instant.now();
        Instant startOfDay = now.truncatedTo(ChronoUnit.DAYS);
        
        ReadRecordsRequest<StepsRecord> request = new ReadRecordsRequest<>(
            StepsRecord.class,
            TimeRangeFilter.between(startOfDay, now)
        );
        
        ReadRecordsResponse<StepsRecord> response = 
            kotlinx.coroutines.BuildersKt.runBlocking(
                kotlin.coroutines.EmptyCoroutineContext.INSTANCE,
                (scope, continuation) -> client.readRecords(request, continuation)
            );
        
        long totalSteps = 0;
        for (StepsRecord record : response.getRecords()) {
            totalSteps += record.getCount();
        }
        
        JSONObject payload = new JSONObject();
        payload.put("window_start", startOfDay.toString());
        payload.put("window_end", now.toString());
        payload.put("steps", totalSteps);
        payload.put("platform", "android");
        
        Log.i(TAG, "collected steps: " + totalSteps);
        return payload;
    }
}

```
**注意**：HealthConnect 的 Kotlin suspend 函数需要从 Java 调用时使用 BuildersKt.runBlocking。若团队更熟悉 Kotlin，建议将 StepsCollector 改写为 Kotlin，可避免此样板。  
**B.4 StepsCollector.kt（推荐版本）**  
若团队使用 Kotlin，用以下实现替代 B.3：  
```
kotlin
package com.yourorg.yuanying.collector

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit

class StepsCollector(private val ctx: Context) {
    
    companion object {
        private const val TAG = "StepsCollector"
        val PERMISSIONS = setOf(
            HealthPermission.getReadPermission(StepsRecord::class)
        )
    }
    
    private val client = HealthConnectClient.getOrCreate(ctx)
    
    suspend fun hasPermission(): Boolean {
        val granted = client.permissionController.getGrantedPermissions()
        return granted.containsAll(PERMISSIONS)
    }
    
    suspend fun collectToday(): JSONObject {
        val now = Instant.now()
        val startOfDay = now.truncatedTo(ChronoUnit.DAYS)
        
        val request = ReadRecordsRequest(
            recordType = StepsRecord::class,
            timeRangeFilter = TimeRangeFilter.between(startOfDay, now)
        )
        
        val response = client.readRecords(request)
        val totalSteps = response.records.sumOf { it.count }
        
        Log.i(TAG, "collected steps: $totalSteps")
        
        return JSONObject().apply {
            put("window_start", startOfDay.toString())
            put("window_end", now.toString())
            put("steps", totalSteps)
            put("platform", "android")
        }
    }
}

```
**B.5 合并到 Worker**  
CollectorWorker.kt（更新版）：  
```
kotlin
package com.yourorg.yuanying.collector

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CollectorWorker(
    ctx: Context,
    params: WorkerParameters
) : CoroutineWorker(ctx, params) {
    
    companion object {
        private const val TAG = "CollectorWorker"
        private const val API_URL = "https://YOUR-VERCEL-URL.vercel.app"
    }
    
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val config = ConfigClient()
            if (!config.isCollectionEnabled()) {
                Log.i(TAG, "collection disabled")
                return@withContext Result.success()
            }
            
            // 1. App usage
            val usagePayload = UsageStatsCollector(applicationContext)
                .collectLastHour()
            
            if (usagePayload.getJSONArray("apps").length() > 0) {
                val ok = ApiClient().post("$API_URL/api/activity", usagePayload)
                Log.i(TAG, "usage posted: $ok")
            }
            
            // 2. Steps
            val stepsCollector = StepsCollector(applicationContext)
            if (stepsCollector.hasPermission()) {
                val stepsPayload = stepsCollector.collectToday()
                val ok = ApiClient().post("$API_URL/api/steps", stepsPayload)
                Log.i(TAG, "steps posted: $ok")
            } else {
                Log.w(TAG, "steps permission not granted")
            }
            
            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "collect failed", e)
            Result.retry()
        }
    }
}

```
**B.6 权限请求（MainActivity.kt）**  
```
kotlin
package com.yourorg.yuanying.collector

import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.health.connect.client.PermissionController
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

class MainActivity : AppCompatActivity() {
    
    private lateinit var stepsCollector: StepsCollector
    
    private val requestPermissions = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        if (granted.containsAll(StepsCollector.PERMISSIONS)) {
            updateStatus("✓ 步数权限已授予")
        } else {
            updateStatus("✗ 步数权限被拒绝")
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        
        stepsCollector = StepsCollector(this)
        
        findViewById<android.widget.Button>(R.id.grant_steps_button)
            .setOnClickListener {
                requestPermissions.launch(StepsCollector.PERMISSIONS)
            }
        
        lifecycleScope.launch {
            refreshStatus()
        }
    }
    
    private suspend fun refreshStatus() {
        val hasSteps = stepsCollector.hasPermission()
        updateStatus(
            if (hasSteps) "✓ 步数采集已启用"
            else "✗ 步数采集未授权"
        )
    }
    
    private fun updateStatus(text: String) {
        findViewById<android.widget.TextView>(R.id.steps_status)
            .text = text
    }
}

```
**B.7 activity_main.xml（新增步数区域）**  
```
xml
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="24dp">

    <!-- 已有的 usage stats 区域 -->

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="步数采集"
        android:textSize="18sp"
        android:layout_marginTop="32dp" />

    <TextView
        android:id="@+id/steps_status"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="检查中…"
        android:layout_marginTop="8dp" />

    <Button
        android:id="@+id/grant_steps_button"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="授予步数权限"
        android:layout_marginTop="12dp" />

</LinearLayout>

```
## B.8 服务端 /api/steps  
app/api/steps/route.ts：  
```
typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { window_start, window_end, steps, platform } = body ?? {};
  
  if (typeof steps !== 'number' || steps < 0 || steps > 200000) {
    return NextResponse.json({ error: 'invalid steps' }, { status: 400 });
  }
  
  const { error } = await supabase.from('signals').insert({
    name: 'steps',
    type: 'count',
    value: steps,
    source: 'passive',
    context: { window_start, window_end, platform },
  });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  const { data } = await supabase
    .from('signals')
    .select('value, created_at')
    .eq('name', 'steps')
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1);
  
  const latest = data?.[0];
  const { data: goalConfig } = await supabase
    .from('config')
    .select('value')
    .eq('key', 'steps_goal')
    .single();
  
  return NextResponse.json({
    steps: latest?.value ?? 0,
    goal: goalConfig?.value ?? 5000,
    updated_at: latest?.created_at ?? null,
  });
}

```
  
**附录 C：调试与故障排查**  
**C.1 提醒不触发**  
**排查步骤**：  
1. select * from reminders order by scheduled_at desc limit 5 —— 检查是否有记录  
2. Vercel Dashboard → Cron Jobs → 看执行日志  
3. CRON_SECRET 是否设置  
4. vercel.json 是否包含 cron 配置  
5. 本地手动触发：curl -H "Authorization: Bearer $CRON_SECRET" <url>/api/cron/water  
**C.2 TTS 不播报**  
**排查步骤**：  
1. 手机系统是否静音  
2. Web Speech API 是否在 iOS Safari 上受限  
3. Console 是否有 speechSynthesis not supported  
4. 检查语音列表：speechSynthesis.getVoices() 是否有中文  
**C.3 HealthConnect 权限被拒**  
**排查步骤**：  
1. 手机系统是否 Android 9+（HealthConnect 要求 Android 9+）  
2. HealthConnect App 是否安装（Android 13 以下需单独安装）  
3. adb logcat | grep StepsCollector  
4. 检查 HealthConnectClient.getSdkStatus() 返回值  
**C.4 步数为 0**  
**排查步骤**：  
1. 手机是否真的记录步数（系统健康 App 查看）  
2. HealthConnect 中是否有步数数据源  
3. PermissionController 是否返回完整权限  
4. 时区问题：Instant.now().truncatedTo(DAYS) 使用 UTC  
  
**文档结束。**  
**核心原则重申**：  
1. **帮助优先于记录** —— 追踪的目的是帮用户做到该做的事，不是攒数据  
2. **被动优先于主动** —— 能自动采集的，不要让用户点  
3. **主动提醒是元婴的灵魂** —— 它主动出现，而不是等你打开  
4. **界面越简单，元婴越聪明** —— 3 个按钮比 9 个按钮更接近"真正的伴侣"  
**如有疑问**：停下来问，不要自行扩展范围。  
  
  
  
```
