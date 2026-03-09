# Worduel Multiplayer Reliability

## Overview

This document maps every scenario that can occur during a live multiplayer match, the exact server response, and the player experience. It also covers how both authentication modes (Google and username/password) interact with the socket layer.

---

## Authentication Modes

| Mode | Flow | Token |
|------|------|-------|
| **Username/Password** | `POST /api/login` → JWT stored in `localStorage` | JWT signed by `JWT_SECRET` |
| **Google Sign-In** | `POST /api/auth/google` → JWT stored in `localStorage` | Same JWT format, different verification |
| **Socket auth** | `socket.emit('authenticate', { token })` on every `connect` event | Identical for both modes |

**Both modes are indistinguishable at the socket layer.** After the first login, both use the same JWT token and the same socket authenticate flow. Neither mode has special privileges or different reconnect behavior.

---

## Scenario Map

### Scenario 1: Normal match flow (no issues)

| Step | Event | Server Action | Client Action |
|------|-------|---------------|---------------|
| Player enters queue | `find_match` | Added to queue | Shows matchmaking screen |
| Opponent found | — | Calls `createMatch()`, starts timers | — |
| Both paired | `match_found` | Emitted to both | — |
| Match starts | `match_start` | Emitted 1s later (retry logic) | Shows battle screen, starts timer |
| Player guesses | `submit_guess` | Validates word, evaluates, emits `guess_result` + `opponent_guess` | Reveals tiles, updates keyboard |
| Player solves | `submit_guess` (correct) | Calls `endRound()` or `endMatch()` | Grid tiles fill green |
| Round ends | `round_end` | Emitted to both with scores | Shows round overlay |
| Next round | `round_start` | Emitted 3.5s after round_end | Clears grids, starts timer |
| Match ends | `match_end` | Updates MMR/balance, emits to both | Shows result modal |

---

### Scenario 2: Brief network micro-blip (< 3 seconds)

**Trigger:** Render.com WebSocket drop, phone signal blip, or brief WiFi stutter.

| Step | What Happens |
|------|-------------|
| Socket disconnects | Server `disconnect` event fires |
| Timer saved | `roundTimer` or `blitzTimeout` paused, `pausedTimerMs` recorded |
| **3-second grace period starts** | `notifyOpponentTimer` set — opponent NOT notified yet |
| Socket reconnects | Socket.IO auto-reconnects; `connect` fires; client calls `authenticate` |
| Server re-authenticates | Finds active match, cancels `reconnectTimeout` AND `notifyOpponentTimer` |
| Timer restored | `roundTimer` or `blitzTimeout` restarted with remaining time |
| Opponent notified | `opponent_reconnected` sent |
| **Result: Opponent never saw disconnect overlay** | Micro-blip is invisible to both players |

---

### Scenario 3: Real disconnect (3–33 seconds)

**Trigger:** Player loses signal, closes phone screen, or app goes to background for a while.

| Step | What Happens |
|------|-------------|
| Socket disconnects | Server `disconnect` fires, timers paused |
| After 3 seconds | `notifyOpponentTimer` fires → opponent sees `opponent_disconnected { seconds: 30 }` |
| Opponent UI | Red overlay: "OPPONENT DISCONNECTED — Match ends in 30s" |
| Player reconnects (within 33s total) | `connect` → `authenticate` → server finds match → cancels both timers |
| Opponent UI cleared | `opponent_reconnected` sent → overlay removed |
| Timer resumed | `pausedTimerMs` restored to timer |
| **Result: Brief disruption, match continues** | Opponent saw the overlay but match resumes normally |

---

### Scenario 4: Permanent disconnect (> 33 seconds)

**Trigger:** Player closes the browser, phone dies, or network is out for too long.

| Step | What Happens |
|------|-------------|
| Socket disconnects | Timers paused, notification timer + forfeit timer set |
| After 3 seconds | Opponent sees "OPPONENT DISCONNECTED — 30s" countdown |
| After 33 seconds | `reconnectTimeout` fires → checks if player reconnected → calls `endMatch(matchId, opponent)` |
| Match ends | Opponent wins by forfeit. Both players get `match_end` (opponent wins, disconnected player loses) |
| MMR/balance settled | Winner gains, loser loses (normal match settlement) |
| **Result: Opponent wins by forfeit** | Fair outcome after 33s total |

---

### Scenario 5: Both players disconnect simultaneously

**Trigger:** Server restart (Render deploy), or simultaneous network failure.

| Step | What Happens |
|------|-------------|
| Both sockets disconnect | Two `disconnect` events fire |
| Both get `notifyOpponentTimer` + `reconnectTimeout` | Timers set for both (each trying to forfeit the other) |
| If server restarted | All in-memory state cleared (`users` Map wiped) |
| Player reconnects to server | JWT still valid, but `users.get(username)` returns `undefined` |
| Auth fails | `auth_error` emitted → client shows auth screen |
| **Result: Both players log out** | Match is lost. This is a known limitation (no database). Players must re-login. |

**Note:** A database (MongoDB) would persist user accounts across restarts. Without it, server restarts wipe all accounts.

---

### Scenario 6: Player disconnects between rounds

**Trigger:** Disconnect during the 3.5-second pause between rounds (status = `between_rounds`).

| Step | What Happens |
|------|-------------|
| Socket disconnects | Server `disconnect` fires |
| Timer check | No `roundTimer` or `blitzTimeout` running → `pausedTimerMs` stays `null` |
| 3s grace + 33s forfeit | Same as normal disconnect |
| Player reconnects | `match_reconnect` sent with `matchStatus: 'between_rounds'` |
| Client receives reconnect | Grids restored, but timer shows full time (no timer was running) |
| Next `round_start` fires | Timer starts from 180s as normal |
| **Result: Minor UX glitch** | Reconnected player briefly sees frozen timer, then round_start resets it |

---

### Scenario 7: Player rejoins mid-match after page refresh

**Trigger:** Player presses refresh or browser crashes.

| Step | What Happens |
|------|-------------|
| Page reloads | `localStorage` still has `token` and `user` |
| `connectSocket()` called | New socket created, `connect` fires, `authenticate` sent |
| Server processes auth | Finds active match in `activeMatches`, sets `socket.matchId` |
| Cancels forfeit timers | Both `reconnectTimeout` and `notifyOpponentTimer` cancelled |
| Opponent notified | `opponent_reconnected` sent |
| Client receives `match_reconnect` | Full state: guesses, scores, timer, target word |
| Client restores grids | All tiles re-colored from `data.guesses` and `data.opponentGuesses` |
| Timer restored | `startRoundTimer(180 - roundElapsed)` |
| **Result: Full match state restored** | Player can continue as if nothing happened |

---

### Scenario 8: Invalid word / guess submission errors

| Error | Server Response | Client Response |
|-------|----------------|-----------------|
| Word not in 1,712-word list | `invalid_word` event | Shake animation on grid, no row advance |
| Word not 5 letters | `error { message: 'Guess must be 5 letters' }` | Alert shown |
| Not authenticated | `error { message: 'Not authenticated' }` | Auth failure handler |
| No active match | `error { message: 'No active match' }` | Alert shown |
| Already solved (silent) | No event emitted | Client-side guard prevents submission |

---

### Scenario 9: Player stuck on "reveal word" overlay — round_start never received

**Trigger:** Render.com micro-blip or phone network switch between `round_end` (t=0) and `round_start` (t=3.5s). The player's WebSocket becomes a **zombie** — appears alive to the server but dead on the network. The server emits `round_start` to the zombie socket at t=3.5s. The emit appears to succeed on the server, but the client never receives it. Player is frozen on the overlay.

**Root cause:** Default Socket.IO `pingTimeout: 60000` + `pingInterval: 25000` = zombie connection can persist for up to 85 seconds undetected. `round_start` is fire-and-forget with no retry.

| Step | What Happens |
|------|-------------|
| Round 1 ends | Both players receive `round_end`, see overlay ✓ |
| Player B's WebSocket dies silently (zombie) | Server still thinks B is connected |
| t=3.5s: `round_start` emitted to zombie socket | Server considers sent; client never receives |
| Up to 85s later: ping/pong detects zombie | `disconnect` fires, B removed from `activeSockets` |
| B reconnects | `match_reconnect` sent with `matchStatus: active` |
| Client receives `match_reconnect` | Overlay dismissed, round 2 grids/timer restored |

**Fixes applied:**
1. **Server `pingTimeout: 5000, pingInterval: 10000`** — zombie detected in ≤15s (was ≤85s)
2. **Client 6-second fallback after `round_end`** — if `round_start` doesn't arrive within 6s, re-authenticate → triggers `match_reconnect` which dismisses overlay and restores round 2 state
3. **`reconnectionAttempts: Infinity`** — client never gives up reconnecting
4. **Fallback cleared** in `round_start`, `match_reconnect`, and `match_end` handlers to avoid false re-auth

**Result:** Worst case stuck time reduced from ~85s to ≤6s. ✓

---

## Timers Reference

| Timer | Duration | Purpose | Cleared When |
|-------|----------|---------|-------------|
| `roundTimer` | 3 minutes | Ends best_of_3 round | Round ends / player disconnects (paused) |
| `blitzTimeout` | 5 minutes | Ends blitz match | Match ends / player disconnects (paused) |
| `notifyOpponentTimer` | 3 seconds | Grace period before showing disconnect to opponent | Player reconnects within 3s |
| `reconnectTimeout` | 33 seconds | Forfeits match if no reconnection | Player reconnects |
| Next round delay | 3.5 seconds | Pause between rounds | Fires once |
| Match start delay | 1 second | Ensures `match_found` delivered before `match_start` | Fires once |
| Match cleanup | 5 seconds | Removes ended match from memory | Fires once |

---

### Scenario 10: Ghost player — new socket deleted by old disconnect handler

**Trigger:** Player A reconnects (new socket) before the server finishes processing the old socket's `disconnect` event.

| Step | What Happens (OLD) | What Happens (FIXED) |
|------|-------------------|---------------------|
| socket1 drops | Disconnect queued | Disconnect queued |
| socket2 reconnects & authenticates | `activeSockets.set(A, socket2)` | `activeSockets.set(A, socket2)` |
| socket1 disconnect handler fires | `activeSockets.delete(A)` → **deletes socket2** ✗ | Identity check: `activeSockets.get(A) === socket1`? No → skip delete ✓ |
| Player A's state | Invisible to server — misses all events | Correctly tracked via socket2 |

**Fix:** `if (socket.username && activeSockets.get(socket.username) === socket) activeSockets.delete(socket.username)`

---

### Scenario 11: "OPPONENT DISCONNECTED" overlay appears after match result

**Trigger:** Player B disconnects near the end of a match while the 3s `notifyOpponentTimer` is counting down. `endMatch` was not clearing this timer.

| Step | What Happens (OLD) | What Happens (FIXED) |
|------|-------------------|---------------------|
| Match ends | Both see result modal | Both see result modal |
| `notifyOpponentTimer` still ticking | Fires 3s later → Player A sees "OPPONENT DISCONNECTED 30s" on top of result ✗ | Cleared in `endMatch` alongside all other timers ✓ |

---

## Known Limitations

1. **No database** — User accounts reset on every server restart. MongoDB is connected (Atlas cluster) but users Map is in-memory only (see `server.js` TODO).
2. **No spectator mode** — No way to watch an ongoing match.
3. **No rate limiting** — Players could spam `find_match` or `submit_guess` events.
4. **MMR range** — Matchmaking requires ±200 MMR overlap. New players (MMR 1000) can only match with other players in 800–1200 range.
5. **Server-side only** — All game logic is on the server. Client has no authoritative state. This is correct for anti-cheat but means reconnect is essential.

---

## Reconnect Flow Diagram

```
Player socket drops
       │
       ├─── Server: pause timers, save pausedTimerMs
       │
       ├─── [3s timer: notifyOpponentTimer]
       │         │
       │         ├─ IF player reconnects within 3s → CANCEL both timers silently
       │         │         opponent never sees disconnect overlay ✓
       │         │
       │         └─ IF 3s elapses → emit opponent_disconnected { seconds: 30 } to opponent
       │                   │
       │                   ├─ [30s timer: reconnectTimeout (fires at 33s total)]
       │                   │         │
       │                   │         ├─ IF player reconnects before 33s → CANCEL forfeit
       │                   │         │         restore timers, send match_reconnect ✓
       │                   │         │
       │                   │         └─ IF 33s elapses → endMatch(forfeit) ✗
       │
       └─── [Client: Socket.IO auto-reconnects → connect fires → authenticate sent]
```
