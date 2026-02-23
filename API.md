# Worduel — Server API Reference

> This document is the single source of truth for any client (web or Unity)
> connecting to the Worduel server.

---

## Connection

| Property   | Value |
|-----------|-------|
| Protocol  | Socket.IO (WebSocket with polling fallback) |
| Base URL  | `https://worduel-server.onrender.com` |
| Auth flow | REST login → receive JWT → send via `authenticate` socket event |

---

## REST Endpoints

### `POST /api/register`
Create a new account.

**Request body**
```json
{ "username": "string", "password": "string (min 6 chars)" }
```

**Response**
```json
{
  "success": true,
  "token": "<jwt>",
  "user": {
    "username": "string",
    "balance": 1000,
    "mmr": 1000,
    "rank": { "name": "Bronze", "icon": "🥉", "minMMR": 0 },
    "gamesPlayed": 0,
    "gamesWon": 0
  }
}
```

---

### `POST /api/login`
Authenticate an existing account.

**Request / Response** — same shape as `/api/register`.

---

### `GET /health`
Server status check.

```json
{ "status": "ok", "users": 12, "activeMatches": 3, "queueSize": 1 }
```

---

## Socket.IO — Client → Server

### `authenticate`
Must be sent immediately after connecting. All other events require a valid session.

```json
{ "token": "<jwt from REST login>" }
```

---

### `find_match`
Enter the matchmaking queue.

```json
{
  "betAmount": 50,
  "mode": "best_of_3"   // "best_of_3" | "blitz"
}
```

- Players are matched by **same bet amount**, **same mode**, and **MMR within ±200**.
- Blitz = 5-minute race, most words solved wins.
- Best-of-3 = first to 2 round wins.

---

### `submit_guess`
Submit a 5-letter guess during an active match.

```json
{ "word": "CRANE" }
```

Validation is done server-side:
- Must be exactly 5 letters.
- Must exist in the valid-word dictionary (`src/words.js`).

---

### `cancel_search` / `cancel_matchmaking`
Leave the matchmaking queue (either event name works).

```json
{}
```

---

## Socket.IO — Server → Client

### `authenticated`
Sent after a valid `authenticate`. Contains the player's current profile.

```json
{
  "username": "string",
  "balance": 1000,
  "mmr": 1000,
  "rank": { "name": "Bronze", "icon": "🥉", "minMMR": 0 },
  "gamesPlayed": 5,
  "gamesWon": 3
}
```

---

### `auth_error`
JWT was invalid or user not found.

```json
{ "message": "Session expired. Please log in again." }
```

---

### `matchmaking`
Confirmation that you entered the queue.

```json
{ "message": "Searching for opponent...", "mode": "best_of_3" }
```

---

### `match_found`
An opponent was found. Show a brief "found" screen before the game starts.

```json
{
  "matchId": "match_1700000000_abc123",
  "mode": "best_of_3",
  "opponent": { "username": "string", "mmr": 1050, "rank": { ... } },
  "pot": 100
}
```

---

### `match_start`
~1 second after `match_found`. The game begins.

```json
{ "targetWord": "CRANE", "mode": "best_of_3" }
```

- `targetWord` is your secret word — **do not display it**.
- In blitz mode each player receives a different word.

---

### `guess_result`
Your guess result (sent only to you).

```json
{
  "guess": {
    "word": "CRANE",
    "evaluation": ["correct", "absent", "present", "absent", "absent"]
  },
  "solved": false
}
```

`evaluation[i]` values:
| Value     | Meaning |
|-----------|---------|
| `correct` | Right letter, right position (green) |
| `present` | Right letter, wrong position (yellow) |
| `absent`  | Letter not in word (grey) |

---

### `opponent_guess`
Your opponent submitted a guess (evaluation is visible — no word hidden).

```json
{
  "guess": {
    "word": "STARE",
    "evaluation": ["absent", "correct", "absent", "present", "absent"]
  },
  "solved": false
}
```

---

### `invalid_word`
The submitted word is not in the dictionary.

```json
{ "word": "ZZZZZ" }
```

---

### `match_end`
The match is over (standard or blitz timer).

```json
{
  "won": true,
  "targetWord": "CRANE",
  "winnings": 50,
  "mmrChange": 14,
  "newMMR": 1014,
  "newRank": { "name": "Bronze", "icon": "🥉", "minMMR": 0 },
  "newBalance": 1050
}
```

- `mmrChange` is always positive here. The loser receives `-mmrChange`.

---

### `round_end` *(best_of_3 only)*
A round finished. Show the score overlay.

```json
{
  "roundNumber": 1,
  "roundWon": true,
  "yourScore": 1,
  "opponentScore": 0,
  "targetWord": "CRANE"
}
```

After ~3.5 seconds, `round_start` fires automatically.

---

### `round_start` *(best_of_3 only)*
Next round begins. Reset the grid, apply the new target word.

```json
{
  "round": 2,
  "targetWord": "STONE",
  "yourScore": 1,
  "opponentScore": 0
}
```

---

### `blitz_word_solved` *(blitz only)*
You solved the current word. Reset your grid and start the new word.

```json
{
  "newWord": "STONE",
  "yourSolves": 3,
  "opponentSolves": 2
}
```

---

### `blitz_word_failed` *(blitz only)*
You used all 6 guesses without solving. Grid resets silently.

```json
{ "newWord": "BRAVE" }
```

---

### `blitz_opponent_solved` *(blitz only)*
Your opponent just solved their word.

```json
{ "opponentSolves": 3, "yourSolves": 2 }
```

---

### `error`
Generic server error.

```json
{ "message": "Insufficient balance" }
```

---

## Game Logic (mirrored in Unity)

### `evaluateGuess(guess, target)`
Located in `src/game.js`. Unity must replicate this for instant client-side feedback.

```
Algorithm:
1. Pass 1 — mark exact matches (correct position) → null out matched letters
2. Pass 2 — mark present letters (wrong position) → null out matched letters
Result: array of 5 strings: 'correct' | 'present' | 'absent'
```

### Rank table

| Rank        | Min MMR |
|-------------|---------|
| Bronze      | 0       |
| Silver      | 1100    |
| Gold        | 1300    |
| Platinum    | 1500    |
| Diamond     | 1700    |
| Master      | 1900    |
| Grandmaster | 2100    |
| Legend      | 2300    |

### MMR formula
Elo, K=32:
```
expected = 1 / (1 + 10^((opponentMMR - playerMMR) / 400))
mmrChange = round(32 * (result - expected))   // result = 1 (win) or 0 (loss)
```

---

## Unity integration checklist

- [ ] Connect via Socket.IO (use `best.mass-net` or `socket.io-client-csharp`)
- [ ] POST `/api/login` → store JWT
- [ ] Send `authenticate` on connect
- [ ] Listen for `match_start` → start game loop
- [ ] Send `submit_guess` → handle `guess_result` + `opponent_guess`
- [ ] Handle `round_end` / `round_start` for best-of-3
- [ ] Handle `blitz_word_solved` / `blitz_word_failed` / `blitz_opponent_solved`
- [ ] Handle `match_end` → show results, update profile
- [ ] Replicate `evaluateGuess` in C# for client-side tile preview
