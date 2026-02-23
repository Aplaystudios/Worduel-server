# Worduel — Claude Context

## What this project is
Competitive multiplayer Wordle. Two players race to guess the same 5-letter word.
Game modes: **Best-of-3** (first to win 2 rounds) and **Blitz** (most words solved in 5 min).
Players bet in-game currency; winner takes the pot. MMR ranking system (Elo-based).

## Deployment
- **Live URL**: https://worduel-server.onrender.com
- **Platform**: Render (auto-deploys from `main` branch on GitHub push)
- **Repo**: https://github.com/Aplaystudios/Worduel-server
- **Dev env**: GitHub Codespaces (`/workspaces/Worduel-server`)

## Tech stack
- **Backend**: Node.js + Express + Socket.IO (`server.js`)
- **Frontend**: Single HTML file (`public/index.html`) — ~3600 lines HTML+CSS+JS
- **Auth**: JWT + bcrypt, in-memory `Map` storage (no database yet)
- **Word validation**: `src/words.js` — 14,855-word Set (standard Wordle list)

## File structure
```
server.js              — Express + Socket.IO wiring, match/round/blitz logic
src/
  game.js              — Pure functions: evaluateGuess, getRank, getRandomWord,
                         calculateMMRChange, WORDS[], RANKS[]
  words.js             — Set of 14,855 valid 5-letter words (Wordle standard list)
public/
  index.html           — Entire web frontend (HTML + CSS + JS, all in one file)
API.md                 — Full Socket.IO + REST contract (read this to build Unity client)
test_multiplayer.js    — Manual test script
```

## Key patterns to know

### CSS specificity in index.html
There are multiple `@media (max-width: 768px)` blocks. The **last** one wins for
same-specificity rules. The authoritative mobile battle layout block is at the very
end of `<style>`, using `#battleScreen .xxx` selectors (specificity 110 beats 010).

### Mobile battle layout (CSS Grid)
`#battleScreen { align-items: stretch }` → `.battle-container { display: grid; grid-template-rows: 36px 1fr auto }` → row 1=header, row 2=grids, row 3=keyboard.
Keyboard always visible because `auto` row is pre-allocated by CSS Grid.

### Keyboard events
On-screen keyboard uses `pointerdown` + `e.preventDefault()` (not `onclick`).
This fires instantly on first touch, no 300ms delay.

### Socket.IO game flow
1. Client: `authenticate` → Server: `authenticated`
2. Client: `find_match {betAmount, mode}` → Server: `match_found` then `match_start`
3. Client: `submit_guess {word}` → Server: `guess_result` + `opponent_guess`
4. Server: `round_end` / `round_start` (best_of_3) or `blitz_word_solved` / `blitz_word_failed`
5. Server: `match_end` → client shows result modal

### Result modal
HTML id: `resultModal`. Shown via `showResult(data)` in JS.
Bug history: was crashing silently because `resultWMR` (wrong) → fixed to `resultMMR`.

### Word validation
Server-side: `VALID_WORDS.has(guess)` before evaluating.
Client-side training mode: same check via `isValidWord()`.
`evaluateGuess(guess, target)` returns `['correct'|'present'|'absent', ...]` (5 elements).

### Game modes
- **best_of_3**: shared `targetWord`, `scores` object, `currentRound` counter. `endRound()`
  increments score, delays 3.5s then `round_start`. First to 2 round wins → `endMatch`.
- **blitz**: per-player `currentWord`, `solves` count. 5-min `setTimeout → endBlitz()`.
  On solve/fail: new word assigned immediately, grid resets client-side.

### MMR / balance
Winner: `balance += loser.betAmount`, `mmr += mmrChange`
Loser: `balance -= loser.betAmount`, `mmr -= mmrChange`
Elo K=32. Bet never deducted upfront — only settled at match end.

## Unity migration plan
The backend is ready. See `API.md` for the full event contract.
Unity replaces `public/index.html`. Socket.IO client lib for Unity:
- `best.mass-net` or `socket.io-client-csharp`
- Replicate `evaluateGuess` algorithm in C# for instant client-side tile coloring.

## What still needs work (known issues / TODOs)
- Database: users reset on every server restart (in-memory only)
- No reconnection handling if socket drops mid-match
- No spectator mode
- Training mode word list uses same `src/game.js` WORDS array (small pool)
