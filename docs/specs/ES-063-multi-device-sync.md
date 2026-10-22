# ES-063 — Formalize Multi-Device Sync & Presence Architecture

- **Status:** Approved (2026-10-22). **Tracking:** P2-40. Refs: ES-062, AGENTS §13.
- **Category:** Architecture (Multi-Device Foundation).

## 1. 背景

跨端聊天不同步的排查（ES-062）证明了一个事实：数据层一直是全局的，缺的是
**标准化的同步通道**。随着 Mac、iOS、iPad、Win/Linux 陆续接入，必须把机制固定
下来，避免未来出现数据孤岛。

## 2. 核心架构

### 2.1 聊天状态全局化 (Global State)
- 所有读取 `messages` 的代码不得按 `client_id` / `session_id` / `device_id` 过滤。
- `/api/history` 与 `get_conversation_records` 返回全局时间线。
- `session_id` 只用于调试分组，`device_id` 只用于实时去重与存在感知。

### 2.2 实时广播与去重 (Realtime Deduplication)
- 订阅 `messages` 的 INSERT；`sender_device_id === my_device_id` 时忽略。
- 客户端按 `id` 去重，再按 `created_at` 插入到正确位置。

### 2.3 存在心跳 (Presence Heartbeat)
- 客户端每 60 秒、以及 `visibilitychange` 时更新 `device_presence`
  (`device_id`, `device`, `status` active/idle, `last_seen`)。
- 通知路由：提醒触发时查询过去 5 分钟内 `active` 的设备，只推送到该设备。
  现阶段投递仍由采集器/PWA 本地完成；路由表先建好，接入 Push 时直接使用。

## 3. 实现说明（与原始条文的差异）

原始条文要求「必须使用 Supabase Realtime（WebSocket）」。当前环境**没有
`NEXT_PUBLIC_SUPABASE_ANON_KEY`**（只有 service-role key，绝不可下发到浏览器），
因此客户端无法安全地建立 Supabase Realtime 连接。

本期实现了一条**语义等价的 SSE 通道**：

| 需求 | 实现 |
|---|---|
| INSERT 广播 | `GET /api/messages/stream?after=<id>`，服务端每 1.5 s 查询新行并通过 SSE 推送 |
| 去重 | 客户端按 `id` 去重；`device_id === mine` 忽略 |
| 断线重连 | EventSource 自动重连，带最后一条 id |
| 鉴权 | 复用 PWA 的 session cookie / bearer，不新增密钥 |

一旦提供 anon key，可把同一订阅切换到 `supabase.channel('public:messages')`，
客户端与去重逻辑不变（见 §2.2）。这是**传输层替换**，不是架构变更。

## 4. 验收

- [ ] Chrome 普通窗口（A）与无痕窗口（B）同时打开：A 发消息，B 秒级追加且不重复。
- [ ] A 与 B 互相能看到对方的历史。
- [ ] 元婴的上下文同时包含 A 和 B 的消息。
- [ ] `device_presence` 在 60 秒内更新；超过 5 分钟自动视为离线。
- [ ] 任何读取路径都不按 session/device 过滤（代码审查 + 验收脚本）。
