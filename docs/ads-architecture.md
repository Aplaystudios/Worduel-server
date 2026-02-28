# Worduel — Ads & Interstitials Architecture

## Overview

The ads system is built around **AppLovin MAX SDK**. Two ad formats are used:
- **Rewarded Ads** — user opts in to watch, then receives a coin reward.
- **Interstitial Ads** — full-screen ad shown automatically at screen transitions.

The web frontend stubs both formats. When AppLovin MAX SDK is injected (via the native WebView wrapper in the Unity/mobile app), the stubs hand off to the real SDK. If the SDK is not present (e.g. running in a browser), the code silently skips the ad and proceeds as if it was watched.

---

## Ad Unit IDs (placeholder — replace before shipping)

```javascript
// public/index.html ~line 3812
const APPLOVIN_INTERSTITIAL_UNIT = 'YOUR_INTERSTITIAL_UNIT_ID';
const APPLOVIN_REWARDED_UNIT     = 'YOUR_REWARDED_UNIT_ID';
```

---

## Current Ad Placements

### 1. Rewarded Ad — Daily Free Coins (HOME SCREEN)

| | |
|---|---|
| **Trigger** | User taps the 🎁 gift icon on the home screen |
| **Reward** | +100 coins |
| **Frequency** | Once per 24 hours (enforced server-side + localStorage) |
| **Server endpoint** | `POST /api/ads/reward { type: 'daily' }` |
| **JS function** | `claimDailyReward()` → `showRewardedAd()` → `/api/ads/reward` |
| **After reward** | `showCoinRewardPopup()` — animated coin popup |
| **File refs** | `index.html:6449` (client), `server.js:108` (server) |

**Flow:**
```
🎁 icon tap
  → showRewardedAd()
    → AppLovin shows rewarded video
      → onEarned() callback
        → POST /api/ads/reward { type: 'daily' }
          → +100 coins credited server-side
            → showCoinRewardPopup(100, newBalance)
```

---

### 2. Rewarded Ad — Double Winnings (POST-MATCH, WINNER ONLY)

| | |
|---|---|
| **Trigger** | Winner taps "DOUBLE YOUR WINNINGS — WATCH AD" on the result screen |
| **Reward** | Doubles the coins just won (e.g. won 200 → get another 200) |
| **Frequency** | Once per match |
| **Server endpoint** | `POST /api/ads/reward { type: 'double_winnings' }` |
| **JS function** | `watchAdDoubleWinnings()` → `showRewardedAd()` → `/api/ads/reward` |
| **File refs** | `index.html:6482`, `server.js:136` |

**The button is shown only when `data.won === true`** in the result modal.

**Flow:**
```
VICTORY result screen shown
  → "DOUBLE YOUR WINNINGS" button appears
    → watchAdDoubleWinnings()
      → AppLovin shows rewarded video
        → POST /api/ads/reward { type: 'double_winnings' }
          → bonus = lastMatchWinnings credited
            → showToast("+X coins")
```

---

### 3. Rewarded Ad — Consolation Prize (POST-MATCH, LOSER ONLY)

| | |
|---|---|
| **Trigger** | Loser taps "GET 25% BACK — WATCH AD" on the result screen |
| **Reward** | 25% of the bet amount returned |
| **Frequency** | Once per match |
| **Server endpoint** | `POST /api/ads/reward { type: 'consolation' }` |
| **JS function** | `watchAdConsolation()` → `showRewardedAd()` → `/api/ads/reward` |
| **File refs** | `index.html:6511`, `server.js:146` |

**The button is shown only when `data.consolationAmount > 0`** in the result modal.

**Flow:**
```
DEFEAT result screen shown
  → "GET 25% BACK" button appears (shows exact coin amount)
    → watchAdConsolation()
      → AppLovin shows rewarded video
        → POST /api/ads/reward { type: 'consolation' }
          → 25% of bet credited
            → showToast("+X consolation prize")
```

---

### 4. Interstitial Ad — Between Match and Bet Screen

| | |
|---|---|
| **Trigger** | User taps "PLAY AGAIN" on the result screen |
| **Format** | Full-screen interstitial (not rewarded, user cannot skip immediately) |
| **Skip timer** | 5-second countdown, then SKIP button becomes active |
| **JS function** | `playAgain()` → `showInterstitial(callback)` |
| **After close** | Navigates to the bet screen |
| **File refs** | `index.html:6299` (playAgain), `index.html:6366` (showInterstitial) |

**Flow:**
```
"PLAY AGAIN" tapped
  → showInterstitial(callback)
    → if AppLovin SDK + ad ready:
        AppLovin shows interstitial
          → user watches / skips after 5s
            → closeInterstitial()
              → callback() → showScreen('betScreen')
    → if SDK not ready:
        callback() called immediately → showScreen('betScreen')
```

**HTML overlay** (visible when SDK not available / fallback):
```html
<div id="interstitialAd">
  <div id="interstitialAdContainer"><!-- AppLovin injects here --></div>
  <div class="interstitial-skip">
    <span id="interstitialCountdown">Skip in 5s</span>
    <button id="interstitialSkipBtn" onclick="closeInterstitial()" disabled>SKIP ▶</button>
  </div>
</div>
```

---

## Possible Future Ad Placements (not yet implemented)

These are natural insertion points identified in the current code flow:

| Placement | Trigger | Format | Notes |
|-----------|---------|--------|-------|
| **Between rounds** (Best of 3) | Round end overlay → next round | Interstitial | 3.5s gap between rounds is a natural window |
| **Post-Blitz** | Blitz timer expires, before result | Interstitial | Similar to play-again interstitial |
| **Home screen banner** | Persistent at bottom of home screen | Banner | Low disruption, always visible |
| **Store screen banner** | Inside the store overlay | Banner | Users already in a buying mindset |
| **Training mode end** | After a training game solve/fail | Interstitial | No coins at stake, low friction |
| **Daily reward — no opt-in** | Non-rewarded interstitial shown when dot is tapped (no ad → no coins) | Interstitial | Alternative monetization if rewarded inventory runs out |
| **Matchmaking wait** | While waiting for opponent | Interstitial | Long wait = good window. Must cancel/close if match found |

---

## Backend — `/api/ads/reward` Endpoint

**File:** `server.js:108`

```
POST /api/ads/reward
Body: { type: 'daily' | 'double_winnings' | 'consolation', token: JWT }
```

| type | Guard | Reward | Server event emitted |
|------|-------|--------|---------------------|
| `daily` | Once per 24h (`user.lastDailyRewardAt`) | +100 coins | `ad_reward_granted` |
| `double_winnings` | Once per match (`user.doubleWinningsClaimed`) | +`user.lastMatchWinnings` | `ad_reward_granted` |
| `consolation` | Once per match (`user.consolationClaimed`), loser only | +25% of bet | `ad_reward_granted` |

The server emits `ad_reward_granted` over Socket.IO in addition to the HTTP response, so the client can handle it either way.

---

## JS Helper Functions (frontend)

| Function | Purpose |
|----------|---------|
| `showInterstitial(onClose)` | Shows interstitial via AppLovin, calls `onClose` when dismissed |
| `closeInterstitial()` | Closes the fallback interstitial overlay, fires pending callback |
| `showRewardedAd(onEarned, onClose)` | Shows rewarded ad via AppLovin, calls `onEarned` if watched |
| `claimDailyReward()` | Orchestrates daily reward: rewarded ad → server call → popup |
| `watchAdDoubleWinnings()` | Orchestrates double-winnings: rewarded ad → server call → toast |
| `watchAdConsolation()` | Orchestrates consolation: rewarded ad → server call → toast |
| `showCoinRewardPopup(amount, balance)` | Animated popup with flying coin particles |
| `closeDailyRewardPopup()` | Closes the reward popup |

---

## SDK Integration Notes (for Unity / native wrapper)

The frontend checks `typeof AppLovinMAX !== 'undefined'` before calling SDK methods. The native wrapper must:
1. Inject the `AppLovinMAX` global object into the WebView's JavaScript context.
2. Implement `AppLovinMAX.Interstitials.isReady(unitId)` and `.show(unitId)`.
3. Implement `AppLovinMAX.Rewarded.isReady(unitId)` and `.show(unitId)`.
4. Call back into JS via `window._rewardedCallback()` after a rewarded ad is fully watched.
5. Call back into JS via `window.closeInterstitial()` after an interstitial is dismissed.

Replace the two unit ID constants in `index.html` with your real AppLovin unit IDs before going live.
