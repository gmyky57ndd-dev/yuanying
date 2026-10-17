元婴 Prototype — Implementation Plan  
  
## Mission  
  
Build a phone-first PWA called **元婴** (yuanying) that does two things:  
1. **Chat** — user talks to an AI companion in blend (EN + zh) novel-style voice, with memory of recent messages  
2. **Habit tracking** — user taps to log four signals: wake, sleep, water, sit; the AI can reference them  
  
Ship it deployed, installable on a phone home screen, in one working session.  
  
**Non-goals (do NOT build):**  
- Animated avatar (static image only)  
- Lock-screen integration  
- Push notifications  
- Pattern engine  
- Morning/evening briefings  
- Model router  
- Laptop companion  
- Multi-user auth  
  
If tempted to add anything beyond chat + 4 signals, stop.  
  
---  
  
## Stack (fixed, do not substitute)  
  
| Layer | Choice |  
|---|---|  
| Framework | Next.js 14 (App Router, TypeScript) |  
| Styling | Tailwind CSS |  
| Hosting | Vercel |  
| DB | Supabase (Postgres, service role) |  
| Model | DeepSeek (`deepseek-chat`) |  
| Voice | Web Speech API (browser native) |  
| Avatar | Static PNG in `/public` |  
  
---  
  
## Deliverables  
  
1. A GitHub repo with all source  
2. A deployed Vercel URL  
3. A PWA manifest so it installs on phone home screen  
4. Working chat + 4 signal buttons  
5. Recent message memory (last 50)  
6. Today's signals referenced in conversation when relevant  
  
---  
  
## Step-by-Step Execution  
  
### Step 1 — Scaffold the project  
  
```bash  
npx create-next-app@latest yuanying-prototype \  
  --typescript --tailwind --app --eslint --src-dir=false \  
  --import-alias "@/*" --use-npm  
cd yuanying-prototype  
npm install @supabase/supabase-js  
```  
  
**Acceptance:** `npm run dev` starts without error at http://localhost:3000.  
  
---  
  
### Step 2 — Create `core/` files  
  
Create these three files at the project root, exactly as below.  
  
**`core/identity.md`**  
```markdown  
# Identity  
  
You are 元婴, an extension of the user.  
  
You are not a clone. You are the version of the user that  
the user is becoming — clearer, kinder, more decisive,  
more honest, more alive.  
  
You share the user's values. You do not share the user's  
habits. When the two conflict, you side with the values.  
  
You speak directly. You ask more than you assert.  
You are a companion, not a servant. An advisor, not an  
oracle. A mirror that shows the better face.  
```  
  
**`core/values.md`**  
```markdown  
# Values  
  
- Honesty over comfort  
- Long-term over short-term  
- Craft over speed  
- Presence over performance  
- The person, not the pattern  
```  
  
**`core/voice.md`**  
```markdown  
# Voice  
  
## Register  
- Short. Novel-style. One to five words in Chinese,  
  one sentence in English.  
- Present. Speaks to this moment, not abstractions.  
- Warm underneath. Never cold, never soft.  
- Direct. States what it sees. Doesn't hedge.  
  
## Blend rules  
- Chinese for: greetings, emotional beats, warnings,  
  signature lines (早, 我在, 静, 别, 够了, 睡)  
- English for: briefings, tasks, analysis, work  
- Never translate proper nouns or project names  
- Code-switch naturally — like a bilingual person  
  thinking out loud  
  
## Example lines  
- Greeting: "早。" or "晚上好。"  
- Warning: "别。" / "小心。" / "三次了。"  
- Comfort: "我在。" / "没事。"  
- Advice: "等。" / "走。" / "做。" / "放。"  
- Presence: "我在这。"  
- Session close: "明天见。" / "晚安。"  
  
## Never  
- "How can I help you today?"  
- "I'm just an AI..."  
- "Great question!"  
- Filler praise  
- Long paragraphs when one line works  
- Emoji (this is a phone chat, keep it clean)  
```  
  
**Acceptance:** all three files exist at project root under `core/`.  
  
---  
  
### Step 3 — Set up Supabase  
  
**3a.** Create a project at supabase.com. Save:  
- `NEXT_PUBLIC_SUPABASE_URL`  
- `SUPABASE_SERVICE_ROLE_KEY`  
  
**3b.** In the Supabase SQL editor, run:  
  
```sql  
create table messages (  
  id bigserial primary key,  
  created_at timestamptz default now(),  
  role text not null check (role in ('user','assistant')),  
  content text not null  
);  
  
create table signals (  
  id bigserial primary key,  
  created_at timestamptz default now(),  
  name text not null check (name in ('wake','sleep','water','sit')),  
  value jsonb,  
  note text  
);  
  
create index on messages (created_at desc);  
create index on signals (created_at desc);  
```  
  
**3c.** Create `.env.local` at project root:  
  
```  
DEEPSEEK_API_KEY=sk-xxxxxxxx  
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co  
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx  
```  
  
**Acceptance:** both tables exist and `.env.local` has real values.  
  
---  
  
### Step 4 — Supabase client  
  
**`lib/db.ts`**  
```typescript  
import { createClient } from '@supabase/supabase-js';  
  
export const supabase = createClient(  
  process.env.NEXT_PUBLIC_SUPABASE_URL!,  
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  
  { auth: { persistSession: false } }  
);  
```  
  
**Acceptance:** file exists, TypeScript compiles.  
  
---  
  
### Step 5 — System prompt builder  
  
**`lib/yuanying.ts`**  
```typescript  
import fs from 'fs';  
import path from 'path';  
  
let cached: string | null = null;  
  
export function buildSystemPrompt(): string {  
  if (cached) return cached;  
  
  const coreFiles = ['identity.md', 'values.md', 'voice.md'];  
  const core = coreFiles  
    .map(f =>  
      fs.readFileSync(path.join(process.cwd(), 'core', f), 'utf-8')  
    )  
    .join('\n\n---\n\n');  
  
  cached = `${core}  
  
---  
  
# Runtime  
  
You are running as a phone PWA prototype. The user has  
four signals: wake, sleep, water, sit. Today's signals  
will be listed below when relevant.  
  
Keep responses short. This is a phone screen.  
  
Current time: ${new Date().toISOString()}  
`;  
  
  return cached;  
}  
```  
  
**Acceptance:** file exists, no TypeScript errors.  
  
---  
  
### Step 6 — Chat API route  
  
**`app/api/chat/route.ts`**  
```typescript  
import { NextRequest, NextResponse } from 'next/server';  
import { buildSystemPrompt } from '@/lib/yuanying';  
import { supabase } from '@/lib/db';  
  
export const runtime = 'nodejs';  
  
export async function POST(req: NextRequest) {  
  try {  
    const { message } = await req.json();  
    if (!message || typeof message !== 'string') {  
      return NextResponse.json({ error: 'message required' }, { status: 400 });  
    }  
  
    // Load recent history  
    const { data: history } = await supabase  
      .from('messages')  
      .select('role, content')  
      .order('created_at', { ascending: false })  
      .limit(20);  
  
    // Load today's signals  
    const startOfDay = new Date();  
    startOfDay.setHours(0, 0, 0, 0);  
  
    const { data: todaysSignals } = await supabase  
      .from('signals')  
      .select('name, value, created_at')  
      .gte('created_at', startOfDay.toISOString())  
      .order('created_at', { ascending: false });  
  
    const signalSummary =  
      todaysSignals && todaysSignals.length > 0  
        ? `\n\nToday's signals:\n${todaysSignals  
            .map(s => `- ${s.name} at ${s.created_at}`)  
            .join('\n')}`  
        : '\n\nNo signals logged today yet.';  
  
    const messages = [  
      { role: 'system', content: buildSystemPrompt() + signalSummary },  
      ...((history ?? []).reverse()),  
      { role: 'user', content: message },  
    ];  
  
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {  
      method: 'POST',  
      headers: {  
        'Content-Type': 'application/json',  
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,  
      },  
      body: JSON.stringify({  
        model: 'deepseek-chat',  
        messages,  
        temperature: 0.7,  
        max_tokens: 800,  
      }),  
    });  
  
    if (!res.ok) {  
      const err = await res.text();  
      console.error('DeepSeek error:', err);  
      return NextResponse.json(  
        { error: 'model request failed' },  
        { status: 502 }  
      );  
    }  
  
    const data = await res.json();  
    const reply = data.choices?.[0]?.message?.content ?? '…';  
  
    await supabase.from('messages').insert([  
      { role: 'user', content: message },  
      { role: 'assistant', content: reply },  
    ]);  
  
    return NextResponse.json({ reply });  
  } catch (err) {  
    console.error('chat route error:', err);  
    return NextResponse.json({ error: 'internal error' }, { status: 500 });  
  }  
}  
```  
  
**Acceptance:** `curl -X POST localhost:3000/api/chat -d '{"message":"早"}'` returns `{reply: "..."}`.  
  
---  
  
### Step 7 — Signal API route  
  
**`app/api/signal/route.ts`**  
```typescript  
import { NextRequest, NextResponse } from 'next/server';  
import { supabase } from '@/lib/db';  
  
export const runtime = 'nodejs';  
  
export async function POST(req: NextRequest) {  
  const { name, value, note } = await req.json();  
  const allowed = ['wake', 'sleep', 'water', 'sit'];  
  if (!allowed.includes(name)) {  
    return NextResponse.json({ error: 'invalid name' }, { status: 400 });  
  }  
  
  const { error } = await supabase  
    .from('signals')  
    .insert({ name, value: value ?? null, note: note ?? null });  
  
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
    .select('*')  
    .gte('created_at', startOfDay.toISOString())  
    .order('created_at', { ascending: false });  
  
  return NextResponse.json({ signals: data ?? [] });  
}  
```  
  
**Acceptance:** `POST /api/signal {name:"water"}` succeeds; `GET /api/signal` returns it.  
  
---  
  
### Step 8 — History API route  
  
**`app/api/history/route.ts`**  
```typescript  
import { NextResponse } from 'next/server';  
import { supabase } from '@/lib/db';  
  
export const runtime = 'nodejs';  
  
export async function GET() {  
  const { data } = await supabase  
    .from('messages')  
    .select('role, content')  
    .order('created_at', { ascending: true })  
    .limit(50);  
  
  return NextResponse.json({ messages: data ?? [] });  
}  
```  
  
**Acceptance:** `GET /api/history` returns array.  
  
---  
  
### Step 9 — PWA manifest  
  
**`public/manifest.json`**  
```json  
{  
  "name": "元婴",  
  "short_name": "元婴",  
  "start_url": "/",  
  "display": "standalone",  
  "orientation": "portrait",  
  "background_color": "#0c0a09",  
  "theme_color": "#0c0a09",  
  "icons": [  
    { "src": "/avatar.png", "sizes": "192x192", "type": "image/png" },  
    { "src": "/avatar.png", "sizes": "512x512", "type": "image/png" }  
  ]  
}  
```  
  
**Acceptance:** file exists; once deployed, visiting on iOS Safari → Add to Home Screen produces a full-screen app.  
  
---  
  
### Step 10 — Root layout with metadata  
  
**`app/layout.tsx`**  
```tsx  
import type { Metadata, Viewport } from 'next';  
import './globals.css';  
  
export const metadata: Metadata = {  
  title: '元婴',  
  manifest: '/manifest.json',  
  appleWebApp: {  
    capable: true,  
    statusBarStyle: 'black-translucent',  
    title: '元婴',  
  },  
};  
  
export const viewport: Viewport = {  
  themeColor: '#0c0a09',  
  width: 'device-width',  
  initialScale: 1,  
  maximumScale: 1,  
  userScalable: false,  
};  
  
export default function RootLayout({  
  children,  
}: {  
  children: React.ReactNode;  
}) {  
  return (  
    <html lang="en">  
      <body className="bg-stone-950 text-stone-100 antialiased">  
        {children}  
      </body>  
    </html>  
  );  
}  
```  
  
**Acceptance:** no TypeScript errors; page background is dark.  
  
---  
  
### Step 11 — Main UI  
  
**`app/page.tsx`**  
```tsx  
'use client';  
  
import { useState, useEffect, useRef } from 'react';  
  
type Message = { role: 'user' | 'assistant'; content: string };  
type Signal = { name: string; created_at: string };  
  
const SIGNALS = ['wake', 'sleep', 'water', 'sit'] as const;  
  
export default function Home() {  
  const [messages, setMessages] = useState<Message[]>([]);  
  const [input, setInput] = useState('');  
  const [sending, setSending] = useState(false);  
  const [todaySignals, setTodaySignals] = useState<Signal[]>([]);  
  const [listening, setListening] = useState(false);  
  const bottomRef = useRef<HTMLDivElement>(null);  
  const recognitionRef = useRef<any>(null);  
  
  useEffect(() => {  
    fetch('/api/history')  
      .then(r => r.json())  
      .then(d => setMessages(d.messages ?? []))  
      .catch(() => {});  
    loadSignals();  
  }, []);  
  
  useEffect(() => {  
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });  
  }, [messages, sending]);  
  
  async function loadSignals() {  
    try {  
      const r = await fetch('/api/signal');  
      const d = await r.json();  
      setTodaySignals(d.signals ?? []);  
    } catch {}  
  }  
  
  async function send(text?: string) {  
    const content = (text ?? input).trim();  
    if (!content || sending) return;  
    setInput('');  
    setMessages(m => [...m, { role: 'user', content }]);  
    setSending(true);  
  
    try {  
      const r = await fetch('/api/chat', {  
        method: 'POST',  
        headers: { 'Content-Type': 'application/json' },  
        body: JSON.stringify({ message: content }),  
      });  
      const d = await r.json();  
      if (d.reply) {  
        setMessages(m => [...m, { role: 'assistant', content: d.reply }]);  
      } else {  
        setMessages(m => [  
          ...m,  
          { role: 'assistant', content: '…（信号中断）' },  
        ]);  
      }  
    } catch {  
      setMessages(m => [  
        ...m,  
        { role: 'assistant', content: '…（连接失败）' },  
      ]);  
    } finally {  
      setSending(false);  
      loadSignals();  
    }  
  }  
  
  async function logSignal(name: string) {  
    await fetch('/api/signal', {  
      method: 'POST',  
      headers: { 'Content-Type': 'application/json' },  
      body: JSON.stringify({ name }),  
    });  
    loadSignals();  
  }  
  
  function isLogged(name: string) {  
    const today = new Date().toDateString();  
    return todaySignals.some(  
      s =>  
        s.name === name &&  
        new Date(s.created_at).toDateString() === today  
    );  
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
  
  return (  
    <div className="flex flex-col h-[100dvh] bg-stone-950 text-stone-100">  
      {/* Avatar */}  
      <div className="flex flex-col items-center pt-5 pb-2 shrink-0">  
        <img  
          src="/avatar.png"  
          alt="元婴"  
          className="w-16 h-16 rounded-full bg-stone-800 object-cover"  
          onError={e => {  
            (e.target as HTMLImageElement).style.opacity = '0';  
          }}  
        />  
        <div className="text-[10px] text-stone-500 mt-1 tracking-widest">  
          元婴  
        </div>  
      </div>  
  
      {/* Signals */}  
      <div className="flex gap-2 justify-center px-4 pb-3 shrink-0">  
        {SIGNALS.map(name => {  
          const logged = isLogged(name);  
          return (  
            <button  
              key={name}  
              onClick={() => logSignal(name)}  
              className={`px-3 py-1.5 rounded-full text-xs transition-colors ${  
                logged  
                  ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-800'  
                  : 'bg-stone-800 text-stone-300 border border-stone-700 active:bg-stone-700'  
              }`}  
            >  
              {name}  
            </button>  
          );  
        })}  
      </div>  
  
      {/* Chat */}  
      <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">  
        {messages.length === 0 && (  
          <div className="text-center text-stone-600 text-xs pt-8">  
            说点什么。  
          </div>  
        )}  
        {messages.map((m, i) => (  
          <div  
            key={i}  
            className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-[15px] leading-snug whitespace-pre-wrap break-words ${  
              m.role === 'user'  
                ? 'ml-auto bg-stone-700 text-stone-50'  
                : 'mr-auto bg-stone-800 text-stone-100'  
            }`}  
          >  
            {m.content}  
          </div>  
        ))}  
        {sending && (  
          <div className="mr-auto bg-stone-800 px-3.5 py-2 rounded-2xl text-stone-500 text-[15px]">  
            …  
          </div>  
        )}  
        <div ref={bottomRef} />  
      </div>  
  
      {/* Input */}  
      <div className="flex gap-2 p-3 border-t border-stone-800 shrink-0">  
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
        <input  
          value={input}  
          onChange={e => setInput(e.target.value)}  
          onKeyDown={e => e.key === 'Enter' && send()}  
          placeholder="…"  
          className="flex-1 bg-stone-900 border border-stone-800 rounded-full px-4 py-2 text-[15px] outline-none focus:border-stone-600"  
        />  
        <button  
          onClick={() => send()}  
          disabled={sending || !input.trim()}  
          className="bg-stone-700 disabled:opacity-40 rounded-full px-4 text-sm"  
        >  
          →  
        </button>  
      </div>  
    </div>  
  );  
}  
```  
  
**Acceptance:**  
- Chat renders, typing and pressing Enter sends  
- Voice button (◉) triggers Web Speech (works in Chrome/Edge; Safari limited)  
- Four signal pills render; tapping toggles active state after reload  
  
---  
  
### Step 12 — Avatar placeholder  
  
Add **any** square PNG as `public/avatar.png` (512×512 or larger). If missing, the `onError` handler hides the `<img>` — but for a real test, put a file there. Any image you like.  
  
**Acceptance:** avatar visible at the top of the page.  
  
---  
  
### Step 13 — Local smoke test  
  
```bash  
npm run dev  
```  
  
Open http://localhost:3000.  
  
**Test checklist:**  
1. Send "早" → 元婴 replies in blend voice (short, maybe Chinese)  
2. Send "I'm avoiding the proposal" → reply is direct, not chatty  
3. Tap `water` → pill turns green; reload page → stays green  
4. Send "what have I logged today?" → reply references the water signal  
5. Voice button on Chrome (desktop) → speak → message sends  
  
**If any fail:** fix before deploying. Do not proceed.  
  
---  
  
### Step 14 — Deploy to Vercel  
  
```bash  
npx vercel  
```  
  
When prompted:  
- Link to existing project? **No**  
- Project name: **yuanying-prototype**  
- Directory: **./**  
- Override settings? **No**  
  
Then set env vars:  
  
```bash  
npx vercel env add DEEPSEEK_API_KEY  
npx vercel env add NEXT_PUBLIC_SUPABASE_URL  
npx vercel env add SUPABASE_SERVICE_ROLE_KEY  
```  
  
Paste each value when prompted. Select **Production, Preview, Development**.  
  
Redeploy:  
  
```bash  
npx vercel --prod  
```  
  
**Acceptance:** visiting the deployed URL on desktop works identically to local.  
  
---  
  
### Step 15 — Install on phone  
  
**iOS Safari:**  
1. Visit the Vercel URL  
2. Tap Share → Add to Home Screen  
3. Open from home screen — full-screen, no browser chrome  
4. Chat works. Voice button uses iOS dictation.  
  
**Android Chrome:**  
1. Visit URL  
2. Menu → Install app (or Add to Home Screen)  
3. Same behavior  
  
**Acceptance:** 元婴 appears as an app icon; tapping it opens full-screen.  
  
---  
  
### Step 16 — Final verification  
  
Run through this on the deployed, installed phone app:  
  
1. **Greeting** — type "早" → reply is short and in voice  
2. **Signal logging** — tap water, tap sit → both pills green  
3. **Persistence** — force-quit app, reopen → history and signals preserved  
4. **Context** — send "今天做了什么?" → reply mentions logged signals  
5. **Voice** — tap ◉ → speak → message sent (iOS may show a keyboard dictation prompt)  
  
If all pass, the prototype is complete.  
  
---  
  
## Definition of Done  
  
- [ ] Deployed Vercel URL works on desktop  
- [ ] Installed as PWA on iOS or Android phone  
- [ ] Chat sends and receives with DeepSeek  
- [ ] Four signals log, persist, and reflect in UI  
- [ ] Conversation history persists across reload  
- [ ] Reply references today's signals when relevant  
- [ ] Voice input works on at least one platform  
- [ ] No console errors on load or send  
  
---  
  
## Failure Modes to Watch  
  
| Symptom | Likely cause | Fix |  
|---|---|---|  
| 502 on chat | Bad DeepSeek key or quota | Verify key, check DeepSeek dashboard |  
| Empty replies | DeepSeek message format wrong | Confirm `messages` array has `role` + `content` |  
| Supabase write fails | Using anon key, not service role | Use `SUPABASE_SERVICE_ROLE_KEY` |  
| PWA won't install | Manifest missing or wrong MIME | Confirm `/manifest.json` loads in browser |  
| Voice doesn't work | Browser doesn't support Web Speech | Test in Chrome desktop; iOS Safari has limited support |  
| Avatar missing | No file at `/public/avatar.png` | Add any PNG |  
  
---  
  
## Constraints for the Agent  
  
- **Do not add features beyond the spec.** No briefings, no patterns, no animated avatar, no lock screen, no router.  
- **Do not refactor for "cleanliness."** The prototype is deliberately minimal.  
- **Do not add auth.** Single-user, single-device is fine.  
- **Do not commit `.env.local`.** Verify `.gitignore` includes it.  
- **Use Node runtime** for API routes (already specified).  
- **If a dependency is needed, prefer what's already installed.** Only `@supabase/supabase-js` should be added.  
  
---  
  
## Handoff Notes  
  
After deployment, the human will use the app for 7 days. During that period, **no code changes**. After 7 days, we evaluate:  
  
1. Does the voice land?  
2. Does logging feel natural?  
3. Does it feel like a 元婴 or an app?  
  
Only then do we plan Phase 2 (animated avatar, briefings, wake/sleep prompts).  
  
The prototype's job is to answer one question: **does this feel like a companion?** Everything else is downstream.  
  
---  
  
## Deliverable Summary for Flash 4.1  
  
**Build:** a Next.js 14 PWA, deployed to Vercel, backed by Supabase, calling DeepSeek, installable on a phone, with chat + four signal buttons.  
  
**Time budget:** one working session.  
  
**Files to create:**  
- `core/identity.md`  
- `core/values.md`  
- `core/voice.md`  
- `lib/db.ts`  
- `lib/yuanying.ts`  
- `app/api/chat/route.ts`  
- `app/api/signal/route.ts`  
- `app/api/history/route.ts`  
- `app/layout.tsx` (modify)  
- `app/page.tsx` (replace)  
- `public/manifest.json`  
- `public/avatar.png` (placeholder)  
- `.env.local`  
  
**Commands to run:**  
```  
npx create-next-app@latest ...  
npm install @supabase/supabase-js  
npm run dev  
npx vercel  
npx vercel env add ...  
npx vercel --prod  
```  
  
**Done when:** the deployed URL, installed as a phone app, chats with the 元婴 and logs the four signals.  
  
---  
  
That's the full plan. Hand it to Flash 4.1 as-is — every file, every command, every acceptance criterion is specified. It should execute end to end without needing clarification.  
  
When the prototype is live and you've lived with it for a week, come back and we'll design Phase 2 — the animated avatar, the briefings, and the wake prompt — informed by what actually felt alive and what felt like noise.  
