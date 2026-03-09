/**
 * Pure game logic — no Express/Socket.IO dependencies.
 * Unity can mirror this logic in C# for client-side prediction.
 */

'use strict';

// ── Word pool: solutions only (wordle-answers-alphabetical, 2,314 words) ────
const fs   = require('fs');
const path = require('path');
const WORDS = fs.readFileSync(path.join(__dirname, 'solutions.txt'), 'utf8')
    .split('\n')
    .map(w => w.trim().toUpperCase())
    .filter(w => w.length === 5);

// ── Rank thresholds ─────────────────────────────────────────────────────────
const RANKS = [
    { name: 'Bronze',      icon: '🥉', minMMR: 0    },
    { name: 'Silver',      icon: '🥈', minMMR: 1100 },
    { name: 'Gold',        icon: '🥇', minMMR: 1300 },
    { name: 'Platinum',    icon: '💎', minMMR: 1500 },
    { name: 'Diamond',     icon: '💠', minMMR: 1700 },
    { name: 'Master',      icon: '⭐', minMMR: 1900 },
    { name: 'Grandmaster', icon: '🌟', minMMR: 2100 },
    { name: 'Legend',      icon: '👑', minMMR: 2300 }
];

/** Return rank object for a given MMR value. */
function getRank(mmr) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (mmr >= RANKS[i].minMMR) return RANKS[i];
    }
    return RANKS[0];
}

/** Pick a random target word. */
function getRandomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
}

/**
 * Evaluate a 5-letter guess against a target word.
 * Returns array of 5 strings: 'correct' | 'present' | 'absent'
 *
 * Used server-side for authoritative results.
 * Unity should mirror this algorithm in C# for instant client feedback.
 */
function evaluateGuess(guess, target) {
    const result = new Array(5).fill('absent');
    const targetLetters = target.split('');
    const guessLetters  = guess.split('');

    // Pass 1: exact matches
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            result[i]        = 'correct';
            targetLetters[i] = null;
            guessLetters[i]  = null;
        }
    }

    // Pass 2: present-but-wrong-position
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] !== null) {
            const idx = targetLetters.indexOf(guessLetters[i]);
            if (idx !== -1) {
                result[i]         = 'present';
                targetLetters[idx] = null;
            }
        }
    }

    return result;
}

/**
 * Elo-style MMR change calculation.
 * K=32, standard chess Elo formula.
 */
function calculateMMRChange(playerMMR, opponentMMR, won) {
    const K = 32;
    const expected = 1 / (1 + Math.pow(10, (opponentMMR - playerMMR) / 400));
    return Math.round(K * ((won ? 1 : 0) - expected));
}

module.exports = { WORDS, RANKS, getRank, getRandomWord, evaluateGuess, calculateMMRChange };
