'use client';
import { useEffect, useRef } from 'react';
import { API_BASE } from '@/lib/api';

interface DueReminder {
  id: number;
  name: string;
  message: string;
  voice_text: string;
  scheduled_at: string;
}

function inQuietWindow(cfg: any): boolean {
  const qw = cfg?.quiet_window;
  if (!qw?.start || !qw?.end) return false;
  const tz =
    typeof cfg.timezone === 'string' ? cfg.timezone : 'Asia/Shanghai';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  const now = h * 60 + m;
  const [sh, sm] = String(qw.start).split(':').map(Number);
  const [eh, em] = String(qw.end).split(':').map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  return start <= end ? now >= start && now < end : now >= start || now < end;
}

export function ReminderPoller() {
  const lastCheck = useRef(0);
  const spoken = useRef<Set<number>>(new Set());

  useEffect(() => {
    async function check() {
      if (Date.now() - lastCheck.current < 5 * 60 * 1000) return;
      lastCheck.current = Date.now();

      try {
        const cfgRes = await fetch(`${API_BASE}/api/config`);
        const cfg = await cfgRes.json();
        if (inQuietWindow(cfg)) return; // B-19: suppress during quiet window

        const res = await fetch(`${API_BASE}/api/reminder/due`);
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
  await speak(r.voice_text);

  if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification('元婴', {
      body: r.message,
      icon: '/avatar.png',
      tag: `reminder-${r.id}`,
    });

    notification.onclick = () => {
      fetch(`${API_BASE}/api/reminder/act`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminder_id: r.id, action: 'acted' }),
      });
      notification.close();
    };
  }
}

function speak(text: string, lang = 'zh-CN'): Promise<void> {  return new Promise(resolve => {
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
