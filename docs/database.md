# Database — Worduel

## Overview

- **Provider**: MongoDB Atlas (free M0 tier)
- **ODM**: Mongoose v8
- **Model file**: `src/models/User.js`
- **Strategy**: Write-through cache — on startup, all users are loaded from MongoDB into an in-memory `Map` for fast reads. Every time a user's data changes, it is written back to MongoDB immediately.

---

## Environment Variable

| Variable | Where to set | Format |
|----------|-------------|--------|
| `MONGODB_URI` | Render → Environment | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/worduel?appName=Worduel` |

If `MONGODB_URI` is not set, the server starts in **in-memory only mode** (data resets on restart). This is safe for local development.

---

## What We Collect

### Users collection (`users`)

Every registered player has one document. Fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `username` | String | — | Unique display name (case-preserved, looked up case-insensitively) |
| `password` | String \| null | null | bcrypt hash (10 rounds). `null` for Google-only accounts |
| `googleId` | String \| null | null | Google OAuth `sub` claim. `null` for username/password accounts |
| `balance` | Number | 1000 | In-game coin balance |
| `mmr` | Number | 1000 | Matchmaking rating (Elo-based, K=32) |
| `gamesPlayed` | Number | 0 | Total matches completed (win or loss) |
| `gamesWon` | Number | 0 | Total matches won |
| `createdAt` | Number | Date.now() | Unix timestamp of account creation |
| `lastDailyRewardAt` | Number \| null | null | Unix timestamp of last daily reward claim (24h cooldown) |
| `lastMatchBet` | Number | 0 | Bet amount wagered in the most recent match |
| `lastMatchWon` | Boolean | false | Whether the player won their most recent match |
| `lastMatchWinnings` | Number | 0 | Coins won in the most recent match (used to calculate double-winnings ad reward) |
| `consolationClaimed` | Boolean | false | Whether the post-loss consolation ad reward (25% refund) has been claimed |
| `doubleWinningsClaimed` | Boolean | false | Whether the post-win double-winnings ad reward has been claimed |

---

## What Is NOT Stored in the Database

The following are kept **in-memory only** (transient by design):

| Data | Why in-memory |
|------|--------------|
| Active matches | Matches last minutes and are deleted 5s after they end — no value in persisting |
| Matchmaking queue | Per-session, players re-queue on reconnect |
| Active socket connections | Socket IDs change every connection |
| Match history / replays | Not yet implemented |

---

## When the Database Is Written To

`saveUser(user)` is called (fire-and-forget) at exactly 4 points:

1. **`POST /api/register`** — new user created via username/password
2. **`POST /api/auth/google`** — new user created via Google Sign-In
3. **`POST /api/ads/reward`** — after a daily reward, double-winnings, or consolation prize is claimed (balance + flags updated)
4. **`endMatch()`** — after a match finishes (balance, MMR, gamesPlayed, gamesWon, and last-match fields updated for both winner and loser)

---

## Atlas Setup Requirements

1. **Cluster**: M0 free tier is sufficient for the current scale
2. **Database user**: must have `readWrite` access to the `worduel` database
3. **Network Access**: set to `0.0.0.0/0` (Allow from Anywhere) so Render's dynamic IPs can connect
4. **Database name**: `worduel` (specified in the connection string before the `?`)

---

## Data Not Collected

Worduel does **not** collect or store:

- Email addresses (Google Sign-In only uses the display name and internal Google ID)
- IP addresses
- Device information
- Chat or communication between players
- Payment information (Stripe/IAP not yet implemented)
