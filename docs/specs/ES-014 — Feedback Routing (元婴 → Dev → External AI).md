**ES-014 — Feedback Routing (元婴 → Dev → External AI)**  
## Status: Approved Category: Feature (Integration) Depends on: ES-012 (Feedback Loop) Tracking: P1-42  
**1. The Core Problem**  
**Currently, the owner has to manually copy text from the 元婴 UI to send to the dev team or external AI tools (like this chat). This adds friction and breaks the "another me" flow.**  
**2. The Architecture: Webhooks + Inbox**  
## We will use a Webhook approach for Dev, and a Clipboard/Markdown approach for external AI.  
**2.1 Dev Integration (GitHub Issues)**  
**Instead of just writing to the local DB, the 元婴 can push feedback directly to GitHub.**  
* **Trigger**: Owner says "把这个发给 dev" or marks a note as [feedback] and taps **Push to Dev**.  
* **Action**: 元婴 formats the issue (using the ES-011 self-diagnostic format) and calls the GitHub API.  
* **Result**: A new GitHub Issue is created in yuanying-prototype/issues, assigned to the dev.  
**2.2 External AI Integration (Clipboard / Markdown Export)**  
## We cannot easily push directly into a ChatGPT/Claude web session via API (and we don't want to scrape the browser). The best flow is "One-Click Copy for AI":  
* **Trigger**: Owner taps "Send to Design Partner" (or similar).  
* **Action**: 元婴 formats the text into a clean Markdown block (Problem, Findings, Proposal).  
* **Result**: It copies to the phone's clipboard and opens the share sheet. The owner pastes it into this chat.  
**3. Implementation (The Dev Task)**  
**3.1 GitHub Webhook**  
## Add a new endpoint POST /api/integrations/github:  
```
typescript
// If GITHUB_TOKEN and GITHUB_REPO are set in .env
```
```


```
```
export
```
```
 async function createIssue(title: string, body: string) {

```
```
  
```
```
const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`, {

```
```
    method
```
```
: 'POST',

```
```
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      
```
```
'Accept': 'application/vnd.github.v3+json'

```
```
    },
    body
```
```
: JSON.stringify({ title, body, labels: ['yuanying-feedback'] })

```
```
  });
  return res.json();
}
```
```


```
**3.2 The "Forward" UI (in Chat)**  
**When 元婴 outputs a self-diagnostic (like the Xiaowu email draft you just got), it should append a tiny action bar:**  
```
text
[Copy for Dev]  [Copy for AI]  [Save to Inbox]

```
* **Copy for Dev**: Formats as a GitHub issue body.  
* **Copy for AI**: Formats as a <feedback> block for this chat.  
* **Save to Inbox**: Writes to docs/pm/inbox/.  
**4. How we (you, me, and 元婴) will work now**  
## Since 元婴 can't yet talk to this chat directly via API, we establish a standard protocol. When you want me to review 元婴's output, you paste it and wrap it in tags, like this:  
```
markdown
[YUANYING FEEDBACK]
Title: Standup notification button bug
Body: ...
[/YUANYING FEEDBACK]
```
```


```
**I will immediately recognize this as a direct signal from Xiaowu, evaluate it against our current specs, and reply with a solution (like the ES-013 we just did).**  
**5. Acceptance**  
* □ .env has GITHUB_TOKEN and GITHUB_REPO.  
* □ 元婴 can create a GitHub issue via a /api/integrations/github call.  
* □ Chat UI has a "Copy for Dev" button when 元婴 proposes a fix.  
* □ Chat UI has a "Copy for AI" button that formats a markdown block.  
##   
**Handoff to Dev (for ES-014)**  
```
markdown
###
```
```
 [P1-42] Add Feedback Forwarding (GitHub + Clipboard)

```
```

-
```
```
 **Status**: To Do

```
```
-
```
```
 **Category**: Feature (Integration)

```
```
- **Refs**: ES-014
-
```
```
 **Description**: 

```
```
  Add a new endpoint `/api/integrations/github` to create issues.
  In the chat UI, when a note is marked as feedback, show action buttons:
  [Copy for Dev], [Copy for AI], [Save to Inbox].
  - "Copy for Dev" should format the text and call the GitHub API.
  
```
```
- "Copy for AI" should copy a markdown block to the clipboard.

```
```
-
```
```
 **Acceptance**: 

```
```
  - Clicking "Copy for Dev" creates a real GitHub issue.
  
```
```
- Clicking "Copy for AI" copies the text successfully.

```
**The future (v2)**  
**Eventually, the 元婴 will have API access to Anthropic/OpenAI, and we will build an integration where 元婴 sends its markdown directly to an API endpoint I am listening on. But for now, the clipboard bridge is the safest and fastest way to keep the workflow moving without building fragile browser automations.**  
##   
