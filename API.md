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

### `POST /api/ads/reward`
Grant a reward after a player watches an ad. Call this from your AppLovin MAX reward callback.

**Request body**
```json
{
  "token": "<jwt>",
  "type": "daily"   // "daily" | "double_winnings" | "consolation"
}
```

| type | Reward | Condition |
|------|--------|-----------|
| `daily` | 100 coins | Once per 24 hours |
| `double_winnings` | Doubles last match winnings | Player must have won their last match |
| `consolation` | 25% of last match bet | Player must have lost their last match |

**Success response**
```json
{ "success": true, "coinsEarned": 100, "newBalance": 1100 }
```

**Error response**
```json
{ "success": false, "error": "Daily reward already claimed", "nextAvailableAt": 1700000000000 }
```

Also triggers Socket.IO `ad_reward_granted` event on the player's connected socket.

---

### `POST /api/purchase/coins`
Initiate a Stripe payment for a coin package. Requires `STRIPE_SECRET_KEY` env var.

**Request body**
```json
{ "token": "<jwt>", "packageId": "bronze" }
```

Package IDs: `bronze` (100c/$0.99) · `silver` (500c/$4.99) · `gold` (1000c/$9.99) · `platinum` (5000c/$39.99)

**Success response** — use `clientSecret` with Stripe.js `confirmCardPayment`
```json
{ "success": true, "clientSecret": "pi_xxx_secret_xxx" }
```

> ⚠️ Currently returns `{ "success": false, "error": "Payments not yet enabled" }` until Stripe keys are configured and a database is connected.

---

### `POST /api/purchase/validate-receipt`
Validate a mobile IAP receipt (Unity / iOS / Android). Server-to-server validation.

**Request body**
```json
{
  "token": "<jwt>",
  "platform": "apple",   // "apple" | "google"
  "productId": "com.worduel.coins.bronze",
  "receipt": "<receipt data from platform>"
}
```

> ⚠️ Currently a stub — returns `{ "success": false, "error": "IAP validation not yet enabled" }` until Apple/Google credentials are configured.

---

### `POST /api/webhooks/stripe`
Stripe webhook endpoint (raw body, `Stripe-Signature` header). Called by Stripe servers after payment confirmation. Do not call this directly.

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
  "newBalance": 1050,
  "betAmount": 50,
  "consolationAmount": 13
}
```

- `mmrChange` is always positive here. The loser receives `-mmrChange`.
- `betAmount` and `consolationAmount` are only relevant for the loser — show the "GET 25% BACK" ad button using `consolationAmount`.

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

### `ad_reward_granted`
Fired after `/api/ads/reward` successfully credits coins.

```json
{
  "type": "daily",          // "daily" | "double_winnings" | "consolation"
  "coinsEarned": 100,
  "newBalance": 1100
}
```

---

### `daily_reward_already_claimed`
Fired if the player tries to claim the daily reward more than once in 24 hours.

```json
{ "nextAvailableAt": 1700086400000 }
```

---

### `coin_purchase_success`
Fired after a Stripe payment is confirmed via webhook and coins are credited.

```json
{ "newBalance": 1500 }
```

---

### `opponent_disconnected`
Opponent's socket dropped — grace period started.

```json
{ "seconds": 15 }
```

---

### `opponent_reconnected`
Opponent reconnected within the grace period.

```json
{}
```

---

### `match_reconnect`
Sent to a player who reconnected mid-match. Restore full game state from this payload.

```json
{
  "mode": "best_of_3",
  "targetWord": "CRANE",
  "guesses": [{ "word": "STARE", "evaluation": ["absent","present","correct","absent","absent"] }],
  "opponentGuesses": [{ "word": "CRANE", "evaluation": ["correct","correct","correct","correct","correct"] }],
  "currentRound": 2,
  "scores": { "alice": 1, "bob": 0 },
  "yourUsername": "alice",
  "opponentUsername": "bob",
  "yourSolves": 2,
  "opponentSolves": 3,
  "roundElapsed": 45,
  "inOvertime": false
}
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
- [ ] Handle `opponent_disconnected` / `opponent_reconnected` / `match_reconnect` for reconnection
- [ ] **Monetization**:
  - Use Unity IAP SDK (StoreKit / Google Play Billing) → `POST /api/purchase/validate-receipt`
  - Use AppLovin MAX Unity Plugin for interstitials and rewarded ads
  - On `OnRewardedAdReceivedReward` → `POST /api/ads/reward { type, token }`
  - Handle `ad_reward_granted` socket event → update balance display
  - Show "DOUBLE YOUR WINNINGS" ad button on victory (`match_end.won = true`)
  - Show "GET 25% BACK" ad button on defeat using `match_end.consolationAmount`
  - Show interstitial on navigation away from results screen
