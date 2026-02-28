# Worduel — Mode Rules & Guide

## Overview

Worduel is a competitive multiplayer word game. Two players race to guess the same (or separate) 5-letter words. Players wager in-game coins; the winner takes the pot. Your MMR (skill rating) also changes after every match.

---

## How a Match Starts

1. **Log in** to your account.
2. From the home screen, tap **BATTLE**.
3. Select a **bet amount** (both players must choose the same amount to be matched).
4. Select a **game mode**: Best of 3 or Blitz.
5. The matchmaker finds an opponent with a matching bet and mode.
6. Once matched, both players see a "Match Found" screen and the game begins.

---

## Guessing Rules (applies to all modes)

- You have a **5-letter target word** to find.
- Type a valid 5-letter word and submit it as a guess.
- Each letter in your guess is colored to give you a hint:
  - 🟩 **Green** — correct letter, correct position.
  - 🟨 **Yellow** — correct letter, wrong position (it's somewhere else in the word).
  - ⬜ **Grey** — this letter is not in the word at all.
- Only valid English words are accepted. Invalid words are rejected.
- You have **6 attempts** per word.

---

## Mode 1: Best of 3

### Goal
Be the first player to **win 2 rounds**.

### How it works

**Round Start**
- Both players receive the **same secret target word**.
- Both players start guessing simultaneously.
- Neither player can see the other's guesses in real time (only a guess count indicator).

**During the Round**
- Each player works through their own 6-guess grid independently.
- You can see how many guesses your opponent has used (but not what they guessed).

**Round Timer**
- Each round has a **3-minute time limit**.
- If neither player has solved the word when the timer expires, the round ends automatically and the tiebreaker applies.

**Winning a Round**
- The first player to correctly guess the word wins that round.
- **There are no draws.** If neither player solves the word (6 guesses used up, or 3-minute timer expires), the round goes to tiebreaker.

**Tiebreaker — Most Green Letters**
When nobody solves the word, the round winner is decided by:
1. **Most green (correct-position) letters** in a single guess — whoever had the highest green count in any one guess wins the round.
2. **Tie on green count** → whoever achieved that green count on an **earlier guess number** wins (got there faster).
3. **True tie** (same green count on same guess number, or both had 0 greens) → no point awarded to either player, new word dealt.

**Between Rounds**
- A round-end screen shows both players' results for that round.
- After ~3.5 seconds, the next round begins automatically with a **new target word**.

**Winning the Match**
- First player to win **2 rounds** wins the match.
- The match ends immediately once a player reaches 2 round wins.

**Match End**
- Winner receives the full **coin pot** (both players' bets combined).
- Loser loses their bet.
- **MMR** (skill rating) changes for both players based on the Elo formula.
  - Winning against a higher-rated opponent gains more MMR.
  - Losing against a lower-rated opponent loses more MMR.

### Scenarios

| Situation | Outcome |
|-----------|---------|
| You guess the word before your opponent | You win the round |
| Opponent guesses before you | Opponent wins the round |
| 3-minute timer expires, you had more greens in a single guess | You win the round (tiebreaker) |
| 3-minute timer expires, tied on greens, you got that many greens on an earlier guess | You win the round (tiebreaker) |
| 3-minute timer expires, both had identical best greens on same guess number | No point awarded, new word dealt |
| Both use all 6 guesses, neither had any green letters | No point awarded, new word dealt |
| You reach 2 round wins | You win the match |
| Opponent reaches 2 round wins | You lose the match |
| You win 1, opponent wins 1, then you win 1 more | You win the match (2–1) |

---

## Mode 2: Blitz

### Goal
Solve **as many words as possible** in **5 minutes**. The player with the most solves wins.

### How it works

**Match Start**
- Each player receives their **own separate target word** (words are not shared).
- The 5-minute countdown begins for both players simultaneously.

**During the Match**
- Solve your current word to immediately receive a new one.
- If you use all 6 guesses without solving, the word is **failed** and you receive a new word automatically.
- Your solve count and your opponent's solve count are both visible in the header.
- The grid resets instantly after each word (solved or failed).

**Scoring**
- Each successfully solved word = **+1 solve**.
- Failed words (used all 6 guesses) = **0 points**, but you move on immediately.
- There is no penalty for failed words beyond lost time.

**Winning the Match**
- When the 5-minute timer expires, the player with **more solves** wins.
- In the event of a **tie**, the match is declared a draw and both players get their bet back with no MMR change.

**Match End**
- Same coin and MMR rules as Best of 3 apply.

### Scenarios

| Situation | Outcome |
|-----------|---------|
| You solve a word | +1 to your solve count, new word begins immediately |
| You use all 6 guesses without solving | Word is failed, new word begins immediately (no point) |
| Timer runs out | Player with more solves wins |
| Both players have the same solve count at time | Draw — bets returned, no MMR change |
| You solve many easy words quickly vs opponent solving fewer hard words | You win by solve count |

### Strategy Tips
- **Speed matters**: Prioritize common letters (E, A, R, S, T) in early guesses.
- **Don't overthink**: If a word is taking too long, you may burn more time than it's worth.
- **Failed words still advance**: Moving on quickly after a failed word can be better than struggling on a hard one.

---

## Coins & Betting

- Both players wager an equal amount of coins before matchmaking.
- Coins are **not deducted upfront** — they are only settled at match end.
- **Winner** receives their bet back plus the opponent's bet.
- **Loser** loses their bet amount.
- Example: Both players bet 50 coins → winner receives 100 coins total (+50 net), loser loses 50 coins.

### Daily Reward
- Once per day, tap the 🎁 gift icon on the home screen to claim **+100 free coins**.
- Resets every 24 hours.

---

## MMR (Skill Rating)

- Every player starts with a base MMR.
- MMR changes after every match using an **Elo-based formula** (K=32).
- Ranks are based on MMR thresholds:

| Rank | MMR Range |
|------|-----------|
| Bronze | 0 – 999 |
| Silver | 1000 – 1499 |
| Gold | 1500 – 1999 |
| Platinum | 2000 – 2499 |
| Diamond | 2500+ |

- Beating a higher-rated opponent = larger MMR gain.
- Losing to a lower-rated opponent = larger MMR loss.
- Draws award no MMR change.

---

## Training Mode

- Practice guessing without an opponent or bet.
- Same 6-guess, 5-letter word rules apply.
- Words are drawn from the standard Worduel word list.
- No coins or MMR are affected.
- Great for warming up before a real match.

---

## Glossary

| Term | Meaning |
|------|---------|
| **Round** | A single word-guessing duel (Best of 3 only) |
| **Solve** | Successfully guessing the target word within 6 tries |
| **Fail** | Using all 6 guesses without finding the word |
| **Tiebreaker** | When nobody solves the word, the round winner is whoever had the most green letters in a single guess (fastest if tied) |
| **MMR** | Matchmaking Rating — your skill score |
| **Pot** | Total coins wagered by both players in a match |
| **Blitz** | 5-minute timed mode, most solves wins |
| **Best of 3** | First to win 2 rounds wins the match |
