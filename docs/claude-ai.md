# Claude AI — Worduel Integration Notes

## Your Dev Environment (Quick Clarification)

| Layer | What it is | Cloud? |
|-------|-----------|--------|
| GitHub Codespaces | Your editor/terminal (VS Code in browser, runs on Azure) | ✅ Yes |
| Render | Production server deployment | ✅ Yes |
| Your laptop | Nothing — no local copy of the repo | — |

**Takeaway**: Everything is cloud-based. Push to GitHub often — if your Codespace is rebuilt, unpushed work is gone.

**On the Claude Cookbook** (`github.com/anthropics/anthropic-cookbook`): Don't clone it into this project. It's ~100 Python/Jupyter notebooks — incompatible with your Node.js stack and would bloat the repo. The useful patterns are documented below, and Claude Code already knows them all.

---

## Potential Claude AI Features for Worduel

| Feature | How it works | Coin cost to player |
|---------|-------------|---------------------|
| **Hint system** | Player taps "Hint" → Claude gives a clue without revealing the word | 50 coins |
| **Post-match analysis** | After match ends, Claude reviews your guess sequence and gives feedback | Free |
| **Word difficulty scoring** | Claude rates words Easy/Medium/Hard; used to balance ranked matchmaking | Backend only |
| **Opponent taunts** | Flavor text from Claude when you solve before your opponent | Cosmetic/free |

---

## Node.js Claude API Quickstart

When you're ready to build a feature, follow these steps:

### 1. Install the SDK
```bash
npm install @anthropic-ai/sdk
```

### 2. Add your API key to Render
In your Render service → Environment → add:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Minimal usage in `server.js`
```js
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY automatically

// Example: hint endpoint
app.post('/api/hint', authenticateToken, async (req, res) => {
  const { word } = req.body; // the target word for this round
  const msg = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 128,
    messages: [{
      role: 'user',
      content: `Give one subtle hint for the 5-letter Wordle word "${word}".
                Do NOT reveal the word or any letters. One sentence only.`
    }]
  });
  res.json({ hint: msg.content[0].text });
});
```

### 4. Call from client (`index.html`)
```js
async function requestHint() {
  const r = await fetch('/api/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ word: currentTargetWord })
  });
  const { hint } = await r.json();
  showToast(hint);
}
```

---

## Useful Cookbook Links (online — no download needed)

- [Tool use / function calling](https://github.com/anthropics/anthropic-cookbook/tree/main/tool_use)
- [Streaming responses](https://github.com/anthropics/anthropic-cookbook/blob/main/misc/how_to_enable_json_mode.ipynb)
- [Prompt caching (reduces cost on repeated system prompts)](https://github.com/anthropics/anthropic-cookbook/tree/main/misc)
- [Full cookbook repo](https://github.com/anthropics/anthropic-cookbook)

---

## Cost Estimate (rough)

| Feature | Tokens per call | Est. cost (claude-opus-4-6) |
|---------|----------------|--------------------------|
| Hint | ~100 in + ~50 out | ~$0.001 |
| Post-match analysis | ~300 in + ~200 out | ~$0.005 |

At 1,000 matches/day with hints used 10% of the time: ~$0.10/day. Negligible until significant scale.
