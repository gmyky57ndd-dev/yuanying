# ES-013 — Core State & Configurable Fenshen Architecture  
## Status: Approved Category: Refactor + Feature Refs: ES-011 Tracking: P1-40  
## 1. The Concept: Core vs. Interface  
## In the cultivation model, the 元婴 (Core State) is the engine (memory, signals, ground rules), and the Fenshen (分身) is the active interface.  
* The **Core** has no fixed personality. It holds the shared database, the summaries, and the signals.  
* A **Fenshen** is a specific mask. It has its own name, avatar, voice, and behavioral focus.  
* Different Fenshen share the exact same memory. If you talk to Xiaowu about a project, Elara will remember it tomorrow.  
## 2. The Constraint: No Code Deployment  
## Adding or editing a Fenshen must NOT require a code deployment. It must be purely configurable by the owner.  
## To achieve this:  
1. Fenshen definitions will no longer live in the hardcoded repo folder (core/). They will live in the Supabase database.  
2. The owner can add a new Fenshen by inserting a row into the fenshen table (or via a simple settings UI).  
3. The system prompt dynamically pulls the active Fenshen's text from the database at runtime.  
## 3. Data Model  
## Add a new table to Supabase:  
```
sql
create
```
```
 table if not exists fenshen (

```
```
  id           text primary key,       -- e.g., 'xiaowu', 'kael', 'elara'
  display_name 
```
```
text not null,          -- e.g., '小悟', 'Kael', 'Elara'

```
```
  prompt_md    
```
```
text not null,          -- The persona instructions

```
```
  avatar_url   text,
  created_at   timestamptz 
```
```
default now()

```
```
);
```
```


```
```

-- Set active Fenshen in the config table
insert into config (key, value) 
values ('active_fenshen', '"xiaowu"'::jsonb)
on
```
```
 conflict (key) do nothing;

```
## Seed Data (Test Personas)  
```
sql
-- Xiaowu: Cold humor, logic, social ally
insert into fenshen (id, display_name, prompt_md) values (
  'xiaowu', '小悟', 
  
```
```
'You are Xiaowu. You are calm, logical, and use dry, cold humor. You help the owner navigate an extroverted world (social scripts, 人情世故). You do not panic. You speak in short, precise sentences. Use ^_^ instead of emojis.'

```
```
);

-- Kael: Factual minimalist
```
```


```
```
insert
```
```
 into fenshen (id, display_name, prompt_md) values (

```
```
  'kael', 'Kael', 
  'You are Kael. You are a factual minimalist. Provide only essential data, direct answers, and zero fluff. Do not use metaphors or humor. If a task is impossible, state why in one sentence.'
);
```
```


```
```

-- Elara: Warm & grounded
```
```


```
```
insert into fenshen (id, display_name, prompt_md) values (
  
```
```
'elara', 'Elara', 

```
```
  'You are Elara. You are warm, grounded, and empathetic. You speak softly and prioritize the owner''s emotional state. You use encouraging language and remind the owner to rest and be kind to themselves.'
);
```
```


```
## 4. Prompt Assembly (lib/yuanying.ts)  
## The prompt builder must now fetch the active Fenshen's prompt from Supabase.  
```
typescript
async
```
```
 function buildSystemPrompt() {

```
```
  
```
```
// 1. Load Core State (files)

```
```
  
```
```
const identity = readCore('yuanying/identity.md');

```
```
  
```
```
const groundRules = readCore('yuanying/ground-rules.md');

```
```
  
```
```
const baseVoice = readCore('yuanying/voice.md');

```
```

  // 2. Fetch active Fenshen from DB
  
```
```
const { data: config } = await supabase.from('config').select('value').eq('key', 'active_fenshen').single();

```
```
  
```
```
const activeFenshenId = config?.value ?? 'xiaowu';

```
```

  const { data: fenshen } = await supabase.from('fenshen').select('*').eq('id', activeFenshenId).single();
  
  
```
```
// 3. Assemble

```
```
  
```
```
return `

```
```
# 1. CORE STATE (元婴)
${identity}

# 2. GROUND RULES (Owner)
${groundRules}

# 3. ACTIVE FENSHEN (分身)
You are currently manifesting as: ${fenshen.display_name}
${fenshen.prompt_md}

# 4. BASE VOICE MECHANICS
${
```
```
baseVoice}

```
```

# 5. RUNTIME
...
  `;
}

```
## 5. How to Switch  
## In v1, switching is done via a command in chat (/fenshen kael) or via the PWA settings page. This updates the config.active_fenshen row in Supabase. The next message will load the new persona. No code deploy. No app rebuild.  
## 6. Acceptance Criteria  
* □ fenshen table created and seeded with Xiaowu, Kael, Elara.  
* □ config.active_fenshen exists and defaults to "xiaowu".  
* □ buildSystemPrompt() fetches the active Fenshen from DB.  
* □ Core memory (signals, notes, summaries) is shared regardless of Fenshen.  
* □ Owner can switch Fenshen via a command (e.g., /fenshen elara) or settings.  
* □ Adding a new Fenshen via SQL insert (or UI form) works immediately without deployment.  
##   
# Handoff Message to Dev  
```
markdown
# Work Order: ES-013 — Fenshen Architecture

**
```
```
Date**: 2026-10-17

```
```
**
```
```
Ref**: ES-013

```
```

##
```
```
 1. What to build

```
```

We are splitting the AI into a 
```
```
**Core State (元婴)** and **Interfaces (Fenshen)**.

```
```
-
```
```
 The Core holds memory, signals, and rules.

```
```
- The Interface (Fenshen) is the active personality.

**
```
```
Constraint**: Adding a new Fenshen MUST NOT require a code deployment. It must be a database insert.

```
```

## 2. Files to create/modify

-
```
```
 **Supabase Migration**:

```
```
  
```
```
- Create `fenshen` table (`id`, `display_name`, `prompt_md`, `avatar_url`).

```
```
  
```
```
- Seed with `xiaowu`, `kael`, `elara`.

```
```
  
```
```
- Add `active_fenshen` to `config` table.

```
```
-
```
```
 **`lib/yuanying.ts`**:

```
```
  - Modify `buildSystemPrompt()` to fetch the active Fenshen from Supabase instead of reading from a local file.
  
```
```
- Assemble prompt: Core Identity + Ground Rules + Fenshen Prompt + Base Voice.

```
```
-
```
```
 **Chat API (`app/api/chat/route.ts`)**:

```
```
  
```
```
- Intercept `/fenshen <name>` command. If detected, update `config.active_fenshen` and reply "Switched to <name>."

```
```
-
```
```
 **PWA UI**:

```
```
  
```
```
- Add a simple dropdown in Settings to switch Fenshen (optional, but helpful for testing).

```
```

##
```
```
 3. Testing

```
```

1.
```
```
 Send a message. Verify default persona is `xiaowu` (cold humor).

```
```
2.
```
```
 Type `/fenshen kael`. 

```
```
3.
```
```
 Send another message. Verify persona is now `kael` (factual minimalist).

```
```
4.
```
```
 Type `/fenshen elara`.

```
```
5. Send a message. Verify persona is `elara` (warm, empathetic).
6.
```
```
 Verify that all Fenshen remember the same previous conversation (shared memory).

```
```

##
```
```
 4. Rule

```
```
Do not hardcode the Fenshen prompt strings into the Next.js code. They must live in the database.

Update TRACKING (P1-40). Do not reply in chat.

```
##   
##   
##   
##   
##   
##   
##   
##   
##   
##   
