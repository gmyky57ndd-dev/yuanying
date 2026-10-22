'use client';

import { useState, useEffect, useRef } from 'react';
import { HabitGrid } from '@/components/HabitGrid';
import { postChat, fetchWithTimeout, API_BASE } from '@/lib/api';
import {
  buildActivityStream,
  formatDuration,
  StreamEntry,
} from '@/lib/activity-stream';
import { formatForAI, formatForDev, feedbackTitle } from '@/lib/feedback-format';
import { FeedbackStatusBadge } from '@/components/FeedbackStatusBadge';
import { AvatarStage } from '@/components/AvatarStage';

type Message = {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  github_issue_url?: string | null;
  github_issue_number?: number | null;
  inbox_path?: string | null;
};

type FenshenInfo = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};
type Signal = {
  id: number;
  name: string;
  type: string;
  value: any;
  created_at: string;
  context: Record<string, any>;
};

type StepSource = {
  package: string;
  steps: number;
  count: number;
};

type StepsInfo = {
  value: number;
  goal: number;
  sources: StepSource[];
  source?: string | null;
  aggregation?: string | null;
  raw_value?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  timezone?: string | null;
  updated_at?: string | null;
  last_sync_at?: string | null;
};

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EVENT_LABEL: Record<string, string> = {
  wake: '起床',
  sleep: '入睡',
  water: '喝水',
  standup: '起身',
  vitamin: '维生素',
  brief_wake: '短暂唤醒',
  reminder_acted: '提醒响应',
  manual_work: '动手',
  body_flag: '身体/情绪',
};

// B-19: timezone offset helper for the PWA exception writer.
function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const p = dtf.formatToParts(at);
  const get = (t: string) => p.find(x => x.type === t)?.value ?? '0';
  let h = parseInt(get('hour'), 10);
  if (h === 24) h = 0;
  const asUtc = Date.UTC(
    +get('year'),
    +get('month') - 1,
    +get('day'),
    h,
    +get('minute'),
    +get('second')
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgMenu, setMsgMenu] = useState<number | null>(null);
  const longPressRef = useRef<any>(null);
  const [input, setInput] = useState('');
  const composingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [pushingMsg, setPushingMsg] = useState<number | null>(null);
  const [inboxingMsg, setInboxingMsg] = useState<number | null>(null);
  const [fenshen, setFenshen] = useState<FenshenInfo | null>(null);
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [stageCollapsed, setStageCollapsed] = useState(false);
  const [steps, setSteps] = useState<StepsInfo | null>(null);
  const [stepsAgeMin, setStepsAgeMin] = useState<number | null>(null);
  const [stepsDetailOpen, setStepsDetailOpen] = useState(false);
  const [notes, setNotes] = useState<Array<{ id: number; text: string }>>([]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteListening, setNoteListening] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [workCategory, setWorkCategory] = useState('园艺');
  const [workNote, setWorkNote] = useState('');
  const [workSaving, setWorkSaving] = useState(false);
  const [bodyOpen, setBodyOpen] = useState(false);
  const [bodyDomain, setBodyDomain] = useState('身体');
  const [bodyPolarity, setBodyPolarity] = useState('不适');
  const [bodyDescription, setBodyDescription] = useState('');
  const [bodySaving, setBodySaving] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedMsgs, setExpandedMsgs] = useState<Record<string, boolean>>({});
  const noteRecRef = useRef<any>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const sessionIdRef = useRef<string>('');
  if (!sessionIdRef.current) {
    const c = typeof crypto !== 'undefined' ? (crypto as any) : undefined;
    sessionIdRef.current = c?.randomUUID?.() ?? `s-${Date.now()}`;
  }

  useEffect(() => {
    // ES-009 §1: chat is scoped to today (never scrolls before 00:00 local).
    loadMessages();
    loadSignals();
    loadSteps();
    loadNotes();
    loadFenshen();
  }, []);

  useEffect(() => {
    setVoiceSupported(
      !!(
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition
      )
    );
  }, []);

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'v') {
        return;
      }
      e.preventDefault();
      try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) {
          alert('剪贴板是空的');
          return;
        }
        const r = await fetchWithTimeout(`${API_BASE}/api/external-chats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'clipboard', content: text }),
        });
        if (r.ok) alert('已吸收剪贴板到外部记忆');
        else alert('吸收失败');
      } catch {
        alert('无法读取剪贴板');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ES-056: Chrome Android does not always re-attach the IME after the PWA is
  // backgrounded. Drop focus on resume so the next tap is a fresh focus event.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') inputRef.current?.blur();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () =>
      document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ES-037: the 21:30 notification can deep-link to the note or work panel.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const panel = params.get('panel');
    if (params.get('note') === '1' || panel === 'note') setNoteOpen(true);
    if (panel === 'work') setWorkOpen(true);
    if (params.get('note') || panel) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  // Refresh today's steps when the app returns to the foreground, and poll
  // once a minute so a collector upload shows up without a manual reload.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSteps();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadSteps();
    }, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  // B-19: exception timezone writer — the collector is the primary writer;
  // the PWA updates config.timezone only on a >1h mismatch with the device.
  useEffect(() => {
    (async () => {
      try {
        const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (!deviceTz) return;
        const r = await fetchWithTimeout(`${API_BASE}/api/config`, {});
        const cfg = await r.json();
        const cfgTz =
          typeof cfg.timezone === 'string' ? cfg.timezone : 'Asia/Shanghai';
        if (
          deviceTz !== cfgTz &&
          Math.abs(tzOffsetMinutes(deviceTz) - tzOffsetMinutes(cfgTz)) > 60
        ) {
          await fetchWithTimeout(`${API_BASE}/api/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timezone: deviceTz }),
          });
        }
      } catch {}
    })();
  }, []);

  async function loadSignals() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/signal`, {});
      const d = await r.json();
      setTodaySignals(d.signals ?? []);
    } catch {}
  }

  async function loadMessages() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/history?today=1`, {});
      // Never wipe the visible chat on a server error (issue #11).
      if (!r.ok) return;
      const d = await r.json();
      if (Array.isArray(d.messages)) setMessages(d.messages);
    } catch {}
  }

  // ES-019: per-message feedback actions (assistant messages only).
  function openMsgMenu(id?: number) {
    if (!id) return;
    setMsgMenu(m => (m === id ? null : id));
  }
  function startLongPress(id?: number) {
    if (!id) return;
    cancelLongPress();
    longPressRef.current = setTimeout(() => setMsgMenu(id), 500);
  }
  function cancelLongPress() {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }
  async function pushMessage(m: Message) {
    if (!m.id || m.github_issue_url || pushingMsg) return;
    const first =
      m.content.split('\n').find(l => l.trim())?.trim().slice(0, 80) ?? '';
    setPushingMsg(m.id);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/github`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message_id: m.id,
          title: `[元婴 feedback] ${first}`,
          body: m.content,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`GitHub: ${d.error ?? r.status}`);
        return;
      }
      alert(
        `${d.already ? 'Already sent!' : 'Issue created!'}${
          d.issue_url ? `\n${d.issue_url}` : ''
        }`
      );
      setMsgMenu(null);
      loadMessages();
    } catch {
      alert('GitHub 失败');
    } finally {
      setPushingMsg(null);
    }
  }
  async function inboxMessage(m: Message) {
    if (!m.id || inboxingMsg) return;
    setInboxingMsg(m.id);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: m.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Inbox: ${d.error ?? r.status}`);
        return;
      }
      alert(`已提交到 inbox\n${d.path ?? ''}`);
      setMsgMenu(null);
      loadMessages();
    } catch {
      alert('Inbox 提交失败');
    } finally {
      setInboxingMsg(null);
    }
  }
  function copyMessage(m: Message) {
    navigator.clipboard
      .writeText(m.content)
      .then(() => alert('已复制'))
      .catch(() => alert('复制失败'));
    setMsgMenu(null);
  }

  async function loadSteps() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/steps`, {});
      const d = await r.json();
      setSteps({
        value: d.steps ?? 0,
        goal: d.goal ?? 5000,
        sources: Array.isArray(d.sources) ? d.sources : [],
        source: d.source ?? null,
        aggregation: d.aggregation ?? null,
        raw_value: d.raw_value ?? null,
        window_start: d.window_start ?? null,
        window_end: d.window_end ?? null,
        timezone: d.timezone ?? null,
        updated_at: d.updated_at ?? null,
        last_sync_at: d.last_sync_at ?? null,
      });
      const lastIso = d.last_sync_at ?? d.updated_at ?? null;
      setStepsAgeMin(
        lastIso
          ? Math.max(0, Math.round((Date.now() - new Date(lastIso).getTime()) / 60000))
          : null
      );
    } catch {}
  }

  async function loadFenshen() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/fenshen`, {});
      const d = await r.json();
      const active = (d.fenshen ?? []).find(
        (f: FenshenInfo) => f.id === d.active
      );
      setFenshen(active ?? (d.fenshen?.[0] ?? null));
    } catch {}
  }

  async function loadNotes() {
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/note`, {});
      const d = await r.json();
      setNotes(d.notes ?? []);
    } catch {}
  }

  async function saveNote() {
    const text = noteText.trim();
    if (!text || noteSaving) return;
    setNoteSaving(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        alert('保存失败');
        return;
      }
      setNoteText('');
      setNoteOpen(false);
      loadNotes();
      loadSignals();
    } catch {
      alert('保存失败');
    } finally {
      setNoteSaving(false);
    }
  }

  async function saveManualWork() {
    if (workSaving) return;
    setWorkSaving(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'manual_work',
          value: 1,
          context: {
            category: workCategory,
            ...(workNote.trim() ? { note: workNote.trim() } : {}),
          },
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(`动手打卡失败：${d.error ?? r.status}`);
        return;
      }
      setWorkOpen(false);
      setWorkNote('');
      await loadSignals();
    } catch {
      alert('动手打卡失败');
    } finally {
      setWorkSaving(false);
    }
  }

  async function saveBodyFlag() {
    const description = bodyDescription.trim();
    if (!description || bodySaving) return;
    setBodySaving(true);
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'body_flag',
          value: { domain: bodyDomain, polarity: bodyPolarity, description },
        }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(`状态记录失败：${d.error ?? r.status}`);
        return;
      }
      setBodyOpen(false);
      setBodyDescription('');
      await loadSignals();
    } catch {
      alert('状态记录失败');
    } finally {
      setBodySaving(false);
    }
  }

  function startNoteVoice() {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setNoteText(prev => (prev ? prev + ' ' : '') + t);
    };
    rec.onend = () => setNoteListening(false);
    rec.onerror = () => setNoteListening(false);
    noteRecRef.current = rec;
    rec.start();
    setNoteListening(true);
  }

  function toolStatusFor(message: string): string {
    if (/笔记|note|昨天|写了什么|记了/.test(message)) {
      return '正在翻笔记…';
    }
    if (/架构|决定|之前|Fenshen|ES-\d|设计/.test(message)) {
      return '正在翻过去的对话…';
    }
    if (/步数|喝水|起身|维生素|简报|数据|今天/.test(message)) {
      return '正在读取今天的数据…';
    }
    if (/发给.*dev|发.*issue|push.*github|github.*issue|反馈.*dev|提交.*dev/i.test(message)) {
      return '⚙️ 正在发送到 GitHub…';
    }
    return '正在想…';
  }

  async function resetChat() {
    if (resetting) return;
    if (!window.confirm('清空当前对话上下文？')) return;
    setResetting(true);
    try {
      await fetchWithTimeout(`${API_BASE}/api/chat/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      setMessages([]);
      sessionIdRef.current =
        crypto.randomUUID?.() ?? `s-${Date.now()}`;
      setError(null);
      setMsgMenu(null);
      await loadMessages();
    } catch {
      alert('重置失败');
    } finally {
      setResetting(false);
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setError(null);
    setToolStatus(toolStatusFor(content));
    setMessages(m => [...m, { role: 'user', content }]);
    setSending(true);

    try {
      const d = await postChat(content, sessionIdRef.current, event => {
        if (event?.type === 'push_to_dev') {
          if (event.status === 'sending') {
            setToolStatus('⚙️ 正在发送到 GitHub…');
          } else if (event.status === 'done' && event.queued) {
            setToolStatus('已提交，后台处理中…');
          } else if (event.status === 'done' && event.success) {
            setToolStatus('已发送，正在整理…');
          }
        }
      });
      if (d.reply) {
        setMessages(m => [...m, { role: 'assistant', content: d.reply }]);
        void speakReply(d.reply);
      } else {
        setError('没有收到回复，请重试');
        setMessages(m => [
          ...m,
          { role: 'assistant', content: '…（没有收到回复，请重试）' },
        ]);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : '连接失败';
      setError(reason);
      if (/GitHub Issue/i.test(reason)) alert(reason);
      else if (/network|fetch|failed|abort|timeout|超时|断开/i.test(reason)) {
        alert('网络断开，发送失败。');
      }
      setMessages(m => [
        ...m,
        { role: 'assistant', content: `…（${reason}）` },
      ]);
    } finally {
      setSending(false);
      setToolStatus(null);
      loadSignals();
      loadMessages();
    }
  }

  async function logSignal(name: string) {
    // 1. 乐观更新：立即反馈，不等服务器
    const optimistic: Signal = {
      id: -Date.now(),
      name,
      type: name === 'water' || name === 'standup' ? 'count' : 'event',
      value: name === 'water' || name === 'standup' ? 1 : true,
      created_at: new Date().toISOString(),
      context: {},
    };
    setTodaySignals(prev => [...prev, optimistic]);
    setError(null);

    // 2. 发送请求（绝对路径，避免 standalone 模式解析错误）
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as any);
        console.error('signal failed:', res.status, err);
        alert(`信号记录失败：${res.status}\n${err.error ?? '未知错误'}`);
        setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
        return;
      }

      await loadSignals();
    } catch (err) {
      console.error('signal network error:', err);
      alert('网络错误，信号未记录');
      setTodaySignals(prev => prev.filter(s => s.id !== optimistic.id));
    }
  }

  const stream: StreamEntry[] = buildActivityStream(todaySignals);

  function toggle(id: string) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  // ES-012 §2/§3: edit a note's tags / feedback flag (optional, never required).
  async function patchNote(id: number, body: Record<string, unknown>) {
    try {
      await fetchWithTimeout(`${API_BASE}/api/note/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      loadSignals();
    } catch {}
  }
  function addTag(id: number, tags: string[]) {
    const t = (window.prompt('标签') ?? '').trim();
    if (!t) return;
    patchNote(id, { tags: [...tags, t] });
  }
  function removeTag(id: number, tags: string[], t: string) {
    patchNote(id, { tags: tags.filter(x => x !== t) });
  }

  // ES-014 / ES-018: feedback forwarding.
  type NoteEntry = { text: string; tags: string[]; at: string; ref?: number };
  async function copyText(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(msg);
    } catch {
      alert('复制失败');
    }
  }
  function copyForAIEntry(n: NoteEntry) {
    copyText(formatForAI(n), '已复制（Copy as Text）');
  }
  async function pushToDevEntry(n: NoteEntry) {
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/integrations/github`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `[元婴 feedback] ${feedbackTitle(n)}`,
            body: formatForDev(n),
            note_id: n.ref,
          }),
        }
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        // ES-017: fallback to clipboard when GitHub is not configured.
        try {
          await navigator.clipboard.writeText(formatForDev(n));
          alert('GitHub token missing, copied to clipboard instead.');
        } catch {
          alert(`GitHub: ${d.error ?? r.status}`);
        }
        return;
      }
      const url: string | undefined = d.issue_url;
      try {
        if (url) await navigator.clipboard.writeText(url);
      } catch {}
      alert(
        `${d.already ? 'Already sent!' : 'Issue created!'}${url ? `\n${url}` : ''}`
      );
      loadSignals();
    } catch {
      alert('GitHub 失败');
    }
  }
  async function saveToInbox(id: number) {
    // ES-018: commit the file to docs/pm/inbox/ via the GitHub Contents API.
    try {
      const r = await fetchWithTimeout(`${API_BASE}/api/integrations/inbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(`Inbox: ${d.error ?? r.status}`);
        return;
      }
      alert(`已提交到 inbox\n${d.path ?? ''}`);
      loadSignals();
    } catch {
      alert('Inbox 提交失败');
    }
  }

  function stopVoice() {
    try {
      recognitionRef.current?.stop();
    } catch {}
    setListening(false);
  }

  function toggleTts() {
    setTtsEnabled(current => {
      if (current && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return !current;
    });
  }

  function speakableText(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_#`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
  }

  async function speakReply(text: string) {
    if (!ttsEnabled || !('speechSynthesis' in window)) return;
    const clean = speakableText(text);
    if (!clean) return;
    setSpeaking(true);
    try {
      await new Promise<void>(resolve => {
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.95;
        utterance.volume = 0.9;
        const voices = window.speechSynthesis.getVoices();
        const zhVoice = voices.find(v => v.lang.startsWith('zh'));
        if (zhVoice) utterance.voice = zhVoice;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      });
    } finally {
      setSpeaking(false);
    }
  }

  function startVoice() {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input not supported in this browser.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  const stageState = listening
    ? 'listening'
    : sending
      ? 'thinking'
      : speaking
        ? 'speaking'
        : 'idle';

  return (
    <div className="flex flex-col h-[100dvh] bg-stone-950 text-stone-100">
      <div className="md:hidden">
        <AvatarStage
          name={fenshen?.display_name || '元婴'}
          avatarUrl={fenshen?.avatar_url || '/avatar.png'}
          state={stageState}
          listening={listening}
          ttsEnabled={ttsEnabled}
          collapsed={stageCollapsed}
          onToggleCollapse={() => setStageCollapsed(v => !v)}
          onMicStart={startVoice}
          onMicEnd={stopVoice}
          onToggleTts={toggleTts}
        />
      </div>

      <div className="flex flex-1 min-h-0 flex-col md:grid md:grid-cols-[280px_minmax(0,1fr)] md:gap-8 md:max-w-6xl md:mx-auto md:w-full md:px-6">
        <aside className="flex shrink-0 flex-col min-h-0 md:shrink md:overflow-y-auto md:py-4">
          <div className="hidden md:flex items-center gap-3 px-3 pb-3 shrink-0">
            <a href="/settings" title="设置">
              <img
                src={fenshen?.avatar_url || '/avatar.png'}
                alt={fenshen?.display_name || '元婴'}
                className="h-12 w-12 rounded-full bg-stone-800 object-cover"
                onError={e => {
                  if (e.currentTarget.src.endsWith('/avatar.png')) return;
                  e.currentTarget.src = '/avatar.png';
                }}
              />
            </a>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-stone-200">
                {fenshen?.display_name || '元婴'}
              </div>
              <div className="text-[11px] text-stone-500">
                {stageState === 'listening'
                  ? '在听…'
                  : stageState === 'thinking'
                    ? '在想…'
                    : stageState === 'speaking'
                      ? '在说…'
                      : '在。'}
              </div>
            </div>
            <button
              onPointerDown={e => {
                e.preventDefault();
                startVoice();
              }}
              onPointerUp={stopVoice}
              onPointerLeave={stopVoice}
              className={`h-9 w-9 rounded-full ${
                listening ? 'bg-red-900 text-red-100' : 'bg-stone-800 text-stone-300'
              }`}
              aria-label="hold to talk"
            >
              ◉
            </button>
            <button
              onClick={toggleTts}
              className={`text-[11px] px-2 py-1 rounded-full border ${
                ttsEnabled
                  ? 'border-emerald-800 text-emerald-300'
                  : 'border-stone-700 text-stone-500'
              }`}
            >
              {ttsEnabled ? '声' : '静'}
            </button>
          </div>
          <div className="hidden md:flex gap-3 px-3 pb-3 text-[11px] text-stone-500">
            <a href="/history">历史</a>
            <a href="/feedback">反馈</a>
            <a href="/settings">设置</a>
          </div>


      <HabitGrid signals={todaySignals} onLog={logSignal} />

      {/* Steps */}
      {steps && (
        <button
          type="button"
          onClick={() => setStepsDetailOpen(true)}
          onContextMenu={e => {
            e.preventDefault();
            setStepsDetailOpen(true);
          }}
          className="text-center text-[11px] text-stone-500 pb-2 shrink-0 hover:text-stone-300"
          title="查看步数来源明细"
        >
          步数 {steps.value} / {steps.goal}
          {steps.last_sync_at && (
            <span
              className={`ml-1 ${
                stepsAgeMin !== null && stepsAgeMin > 20
                  ? 'text-amber-500'
                  : 'text-stone-600'
              }`}
            >
              · 最后同步 {hm(steps.last_sync_at)}
              {stepsAgeMin !== null && stepsAgeMin > 20
                ? `（${stepsAgeMin} 分钟前）`
                : ''}
            </span>
          )}
          {steps.sources.length > 0 && (
            <span className="ml-1 text-stone-600">
              · 来源 {steps.sources.length}
            </span>
          )}
        </button>
      )}

      {/* Notes — capture rides on the existing 记一笔 button (no new surface) */}
      <div className="px-4 pb-2 shrink-0">
        <div className="flex items-center gap-3 text-[11px] text-stone-500">
          <button
            onClick={() => {
              setNoteOpen(o => !o);
              setWorkOpen(false);
              setBodyOpen(false);
            }}
            className="text-stone-400"
          >
            记一笔
          </button>
          <button
            onClick={() => {
              setWorkOpen(o => !o);
              setNoteOpen(false);
              setBodyOpen(false);
            }}
            className={workOpen ? 'text-emerald-400' : 'text-stone-400'}
          >
            动手
          </button>
          <button
            onClick={() => {
              setBodyOpen(o => !o);
              setNoteOpen(false);
              setWorkOpen(false);
            }}
            className={bodyOpen ? 'text-emerald-400' : 'text-stone-400'}
          >
            状态
          </button>
          <span className="ml-auto">笔记 {notes.length}</span>
          <button
            onClick={resetChat}
            disabled={resetting}
            className="text-stone-600 disabled:opacity-40"
            title="清空当前对话上下文"
          >
            {resetting ? '重置中…' : '重置'}
          </button>
        </div>
        {noteOpen && (
          <div className="mt-2 space-y-2">
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onCompositionEnd={e => setNoteText((e.target as HTMLTextAreaElement).value)}
              rows={3}
              placeholder="记点什么…"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
            <div className="flex gap-2 justify-end items-center">
              {voiceSupported && (
                <button
                  onClick={startNoteVoice}
                  aria-label="note-voice"
                  className={`w-9 h-9 rounded-full text-sm ${
                    noteListening
                      ? 'bg-red-900 text-red-200'
                      : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  ◉
                </button>
              )}
              <button
                onClick={() => {
                  setNoteOpen(false);
                  setNoteText('');
                }}
                className="text-xs text-stone-500 px-2"
              >
                取消
              </button>
              <button
                onClick={saveNote}
                disabled={!noteText.trim() || noteSaving}
                className="bg-stone-700 disabled:opacity-40 rounded-full px-4 py-1.5 text-xs"
              >
                {noteSaving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}

        {workOpen && (
          <div className="mt-2 space-y-2 rounded-xl border border-stone-800 bg-stone-900/40 p-3">
            <div className="flex flex-wrap gap-2">
              {['园艺', '做饭', '家务', '修理'].map(category => (
                <button
                  key={category}
                  onClick={() => setWorkCategory(category)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    workCategory === category
                      ? 'bg-emerald-800 border-emerald-700 text-white'
                      : 'bg-stone-900 border-stone-700 text-stone-400'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
            <input
              value={workNote}
              onChange={e => setWorkNote(e.target.value)}
              placeholder="备注（可选）"
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setWorkOpen(false);
                  setWorkNote('');
                }}
                className="text-xs text-stone-500 px-2"
              >
                取消
              </button>
              <button
                onClick={saveManualWork}
                disabled={workSaving}
                className="bg-stone-700 disabled:opacity-40 rounded-full px-4 py-1.5 text-xs"
              >
                {workSaving ? '保存中…' : '打卡'}
              </button>
            </div>
          </div>
        )}

        {bodyOpen && (
          <div className="mt-2 space-y-2 rounded-xl border border-stone-800 bg-stone-900/40 p-3">
            <div className="flex items-center gap-2">
              <select
                value={bodyDomain}
                onChange={e => setBodyDomain(e.target.value)}
                className="bg-stone-900 border border-stone-800 rounded-xl px-2 py-1.5 text-xs"
              >
                {['身体', '情绪', '睡眠'].map(domain => (
                  <option key={domain} value={domain}>
                    {domain}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                {['不适', '良好'].map(polarity => (
                  <button
                    key={polarity}
                    onClick={() => setBodyPolarity(polarity)}
                    className={`text-xs px-2.5 py-1 rounded-full border ${
                      bodyPolarity === polarity
                        ? polarity === '不适'
                          ? 'bg-amber-900 border-amber-700 text-amber-100'
                          : 'bg-emerald-800 border-emerald-700 text-white'
                        : 'bg-stone-900 border-stone-700 text-stone-400'
                    }`}
                  >
                    {polarity}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              value={bodyDescription}
              onChange={e => setBodyDescription(e.target.value)}
              rows={2}
              placeholder="一句话描述…"
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-stone-600"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setBodyOpen(false);
                  setBodyDescription('');
                }}
                className="text-xs text-stone-500 px-2"
              >
                取消
              </button>
              <button
                onClick={saveBodyFlag}
                disabled={bodySaving || !bodyDescription.trim()}
                className="bg-stone-700 disabled:opacity-40 rounded-full px-4 py-1.5 text-xs"
              >
                {bodySaving ? '保存中…' : '记录'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Today — raw activity stream (ES-009 §1) */}
      <div className="px-4 pb-2 shrink-0 max-h-28 md:max-h-64 overflow-y-auto text-[12px]">
        <div className="text-[11px] text-stone-600 mb-1">今天</div>
        {stream.length === 0 ? (
          <div className="text-stone-600">今天还没有记录。</div>
        ) : (
          <ul className="space-y-0.5 text-stone-300">
            {stream.map(e => {
              if (e.kind === 'note') {
                const open = !!expanded[e.id];
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => toggle(e.id)}
                      className="w-full text-left flex gap-2"
                    >
                      <span className="text-stone-600 w-11 shrink-0">
                        {hm(e.at)}
                      </span>
                      <span className="shrink-0">笔记</span>
                      <span
                        className={
                          open
                            ? 'text-stone-300 whitespace-pre-wrap break-words'
                            : 'text-stone-500 truncate'
                        }
                      >
                        {open ? e.text : `“${e.text}”`}
                      </span>
                    </button>
                    {open && (
                      <div className="ml-[52px] mt-1 flex flex-wrap gap-1 items-center">
                        {e.tags.map(t => (
                          <span
                            key={t}
                            className="text-[10px] bg-stone-800 text-stone-400 rounded-full px-2 py-0.5"
                          >
                            #{t}
                            <button
                              onClick={() => removeTag(e.ref, e.tags, t)}
                              className="ml-1 text-stone-500"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          onClick={() => addTag(e.ref, e.tags)}
                          className="text-[10px] text-stone-500 border border-stone-800 rounded-full px-2 py-0.5"
                        >
                          ＋标签
                        </button>
                        {/* ES-015: explicit Mark-as-Feedback toggle */}
                        <button
                          onClick={() =>
                            patchNote(e.ref, { feedback: !e.feedback })
                          }
                          className={`text-[10px] rounded-full px-2 py-0.5 border ${
                            e.feedback
                              ? 'bg-emerald-900 border-emerald-800 text-emerald-200'
                              : 'border-stone-800 text-stone-400'
                          }`}
                        >
                          {e.feedback
                            ? '✓ 已标记反馈（取消）'
                            : e.feedbackSuggested
                              ? '标记为反馈 · 建议'
                              : '标记为反馈'}
                        </button>
                      </div>
                    )}
                    {open && e.feedback && (
                      <div className="ml-[52px] mt-1 flex flex-wrap items-center gap-1">
                        <FeedbackStatusBadge status={e.status} />
                        {e.issueUrl ? (
                          <a
                            href={e.issueUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5"
                          >
                            Issue ↗
                          </a>
                        ) : e.status !== 'resolved' ? (
                          <button
                            onClick={() => pushToDevEntry(e)}
                            className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5"
                          >
                            Push to GitHub
                          </button>
                        ) : null}
                        {(!e.status || e.status === 'new') && (
                          <button
                            onClick={() => saveToInbox(e.ref)}
                            className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5"
                          >
                            Save to Inbox
                          </button>
                        )}
                        <span
                          className="mx-0.5 h-3 w-px bg-stone-800"
                          aria-hidden
                        />
                        <button
                          onClick={() => copyForAIEntry(e)}
                          className="text-[10px] border border-stone-800 text-stone-400 rounded-full px-2 py-0.5"
                          title="仅复制到剪贴板，不改变状态，也不通知 Dev"
                        >
                          Copy as Text
                        </button>
                      </div>
                    )}
                  </li>
                );
              }
              if (e.kind === 'apps') {
                const open = !!expanded[e.id];
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => toggle(e.id)}
                      className="w-full text-left flex gap-2"
                    >
                      <span className="text-stone-600 w-11 shrink-0">
                        {hm(e.start)}
                      </span>
                      <span>
                        应用会话 (约 {formatDuration(e.minutes)},{' '}
                        {e.apps.length} 应用)
                        {open ? ' ▾' : ' ▸'}
                      </span>
                    </button>
                    {open && (
                      <ul className="ml-[52px] mt-0.5 text-stone-500 space-y-0.5">
                        {e.apps.map(a => (
                          <li key={a.package} className="flex gap-2">
                            <span className="flex-1 truncate">{a.name}</span>
                            <span>{a.minutes}m</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              }
              if (e.kind === 'steps') {
                return (
                  <li key={e.id} className="flex gap-2">
                    <span className="text-stone-600 w-11 shrink-0">
                      {hm(e.at)}
                    </span>
                    <span>步数 {e.value}</span>
                  </li>
                );
              }
              return (
                <li key={e.id} className="flex gap-2">
                  <span className="text-stone-600 w-11 shrink-0">{hm(e.at)}</span>
                  <span>
                    {EVENT_LABEL[e.name] ?? e.name}
                    {e.detail && (
                      <span className="text-stone-600"> · {e.detail}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
        </aside>

        <main className="flex flex-col min-h-0 md:max-w-[700px] md:w-full md:mx-auto md:py-4">
      {/* Error */}
      {error && (
        <div className="text-center text-xs text-red-400 pb-2 shrink-0">
          {error}
        </div>
      )}

      {/* Chat (today only) */}
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2 border-t border-stone-900 pt-2">
        {messages.length === 0 && (
          <div className="text-center text-stone-600 text-xs pt-8">
            说点什么。
          </div>
        )}
        {messages.map((m, i) => {
          const isAssistant = m.role === 'assistant';
          const msgKey = String(m.id ?? `i${i}`);
          const isLong =
            isAssistant &&
            (m.content.length > 150 || m.content.split('\n').length > 4);
          const showFull = !isLong || !!expandedMsgs[msgKey];
          const displayContent = showFull
            ? m.content
            : `${m.content.slice(0, 150).replace(/\s+$/, '')}…`;
          return (
            <div
              key={m.id ?? i}
              className={`${isAssistant ? 'mr-auto max-w-[85%] group' : 'ml-auto max-w-[80%]'} fade-in`}
            >
              <div
                className={`px-3.5 py-2 rounded-2xl text-[15px] md:text-base md:leading-relaxed whitespace-pre-wrap break-words ${
                  isAssistant
                    ? 'mr-auto bg-stone-800 text-stone-100'
                    : 'ml-auto bg-stone-700 text-stone-50'
                }`}
                onContextMenu={
                  isAssistant
                    ? e => {
                        e.preventDefault();
                        openMsgMenu(m.id);
                      }
                    : undefined
                }
                onTouchStart={isAssistant ? () => startLongPress(m.id) : undefined}
                onTouchEnd={isAssistant ? cancelLongPress : undefined}
                onTouchMove={isAssistant ? cancelLongPress : undefined}
              >
                {displayContent}
              </div>
              {isLong && (
                <button
                  onClick={() =>
                    setExpandedMsgs(prev => ({
                      ...prev,
                      [msgKey]: !prev[msgKey],
                    }))
                  }
                  className="text-[10px] text-stone-500 mt-1"
                >
                  {showFull ? '收起' : '展开全文'}
                </button>
              )}
              {isAssistant && (
                <div className="flex items-center gap-2 mt-1">
                  {m.id && (
                    <button
                      onClick={() => openMsgMenu(m.id)}
                      className="text-stone-600 text-xs md:opacity-0 md:group-hover:opacity-100"
                      aria-label="message actions"
                    >
                      ⋮
                    </button>
                  )}
                  {m.github_issue_url && (
                    <a
                      href={m.github_issue_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-stone-500 underline"
                    >
                      Issue #{m.github_issue_number ?? ''}
                    </a>
                  )}
                  {m.inbox_path && (
                    <span className="text-[10px] text-stone-500">
                      Saved to Inbox
                    </span>
                  )}
                </div>
              )}
              {isAssistant && m.id && msgMenu === m.id && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {!m.github_issue_url && (
                    <button
                      onClick={() => pushMessage(m)}
                      disabled={pushingMsg === m.id}
                      className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5 disabled:opacity-50"
                    >
                      {pushingMsg === m.id ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-2 w-2 animate-spin rounded-full border border-stone-500 border-t-transparent" />
                          Pushing…
                        </span>
                      ) : (
                        'Push to GitHub'
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => inboxMessage(m)}
                    disabled={inboxingMsg === m.id || !!m.inbox_path}
                    className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5 disabled:opacity-50"
                  >
                    {m.inbox_path ? (
                      'Saved to Inbox'
                    ) : inboxingMsg === m.id ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block h-2 w-2 animate-spin rounded-full border border-stone-500 border-t-transparent" />
                        Saving…
                      </span>
                    ) : (
                      'Save to Inbox'
                    )}
                  </button>
                  <button
                    onClick={() => copyMessage(m)}
                    className="text-[10px] bg-stone-800 text-stone-300 rounded-full px-2 py-0.5"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {sending && (
          <div className="mr-auto bg-stone-800 px-3.5 py-2 rounded-2xl text-stone-400 text-[13px] flex items-center gap-2 fade-in">
            <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-stone-500 border-t-transparent" />
            <span>
              {fenshen?.display_name || '元婴'} · {toolStatus ?? '正在想…'}
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input. z-20 + opaque background: nothing can sit above the field and
          eat the tap (a covered input focuses nothing and the IME never opens). */}
      <div
        className="relative z-20 bg-stone-950 flex gap-2 p-3 border-t border-stone-800 shrink-0"
        onPointerUp={e => {
          const el = inputRef.current;
          if (!el) return;
          const target = e.target as HTMLElement;
          if (target.closest('button')) return;
          if (target !== e.currentTarget) return;
          // Tapping the padding around the composer focuses the field. If it
          // was already focused but the IME never opened (Chrome Android after
          // a resume), blur first so the focus event is fresh.
          if (document.activeElement === el) el.blur();
          el.focus();
        }}
      >
        <button
          onClick={startVoice}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
            listening
              ? 'bg-red-900 text-red-200'
              : 'bg-stone-800 text-stone-300'
          }`}
          aria-label="voice"
        >
          ◉
        </button>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          onChange={e => {
            setInput(e.target.value);
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 120) + 'px';
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={e => {
            composingRef.current = false;
            setInput((e.target as HTMLTextAreaElement).value);
          }}
          onKeyDown={e => {
            // Enter sends; Shift+Enter is a newline. Never intercept while the
            // IME is composing (keyCode 229 / isComposing) or it eats Chinese
            // candidate selection.
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !composingRef.current &&
              !e.nativeEvent.isComposing &&
              e.keyCode !== 229
            ) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="…"
          enterKeyHint="send"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 resize-none bg-stone-900 border border-stone-800 rounded-2xl px-4 py-2 text-[15px] md:text-base outline-none focus:border-stone-600 max-h-[120px] leading-6"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="bg-stone-700 disabled:opacity-40 rounded-full px-4 text-sm"
        >
          →
        </button>
      </div>
        </main>
      </div>

      {/* ES-025: steps source debug */}
      {stepsDetailOpen && steps && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4"
          onClick={() => setStepsDetailOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-stone-800 bg-stone-900 p-4 text-stone-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-stone-200">步数明细</div>
              <button
                onClick={() => setStepsDetailOpen(false)}
                className="text-stone-500 text-lg leading-none"
                aria-label="close"
              >
                ×
              </button>
            </div>
            <div className="text-[11px] text-stone-500 space-y-1">
              <div>
                今日 {steps.value} / {steps.goal}
                {steps.updated_at ? ` · ${hm(steps.updated_at)}` : ''}
              </div>
              <div>
                聚合 {steps.aggregation ?? '—'}
                {typeof steps.raw_value === 'number'
                  ? ` · 原始合计 ${steps.raw_value}`
                  : ''}
              </div>
              {steps.window_start && steps.window_end && (
                <div>
                  窗口 {hm(steps.window_start)} → {hm(steps.window_end)}
                  {steps.timezone ? ` (${steps.timezone})` : ''}
                </div>
              )}
            </div>
            <div className="mt-3 border-t border-stone-800 pt-3">
              <div className="text-[11px] text-stone-500 mb-2">
                数据来源（{steps.sources.length}）
              </div>
              {steps.sources.length === 0 ? (
                <div className="text-[11px] text-stone-600">
                  这次上报没有 source 明细（旧版 collector）。
                </div>
              ) : (
                <ul className="space-y-2">
                  {steps.sources.map(s => (
                    <li
                      key={s.package}
                      className="flex items-start justify-between gap-3 text-[11px]"
                    >
                      <span className="text-stone-400 break-all">
                        {s.package}
                      </span>
                      <span className="text-stone-200 shrink-0">
                        {s.steps}
                        <span className="text-stone-600"> · {s.count} 条</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-[10px] text-stone-600 mt-3">
              显示值取各来源最大值（max per origin），不是相加。不同来源是独立采样，
              差值通常是同步延迟，不是重复计数。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
