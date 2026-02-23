'use strict';

const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');

const { getRank, getRandomWord, evaluateGuess, calculateMMRChange } = require('./src/game');
const VALID_WORDS = require('./src/words');

// ── Server setup ────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
    pingTimeout:  60000,
    pingInterval: 25000
});

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'worduel-secret-key-change-in-production';

// ── In-memory store (replace with a real DB before production) ──────────────
const users           = new Map(); // username.toLowerCase() → user object
const activeSockets   = new Map(); // username → socket
const matchmakingQueue = [];
const activeMatches   = new Map(); // matchId → match object

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static('public'));

// ── REST API ─────────────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.json({ success: false, error: 'Username and password required' });
        if (password.length < 6)
            return res.json({ success: false, error: 'Password must be at least 6 characters' });
        if (users.has(username.toLowerCase()))
            return res.json({ success: false, error: 'Username already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            username,
            password: hashedPassword,
            balance: 1000,
            mmr: 1000,
            gamesPlayed: 0,
            gamesWon: 0,
            createdAt: Date.now()
        };
        users.set(username.toLowerCase(), user);

        const token = jwt.sign({ username: user.username }, JWT_SECRET);
        res.json({ success: true, token, user: publicProfile(user) });
    } catch {
        res.json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = users.get(username.toLowerCase());
        if (!user) return res.json({ success: false, error: 'Invalid credentials' });

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.json({ success: false, error: 'Invalid credentials' });

        const token = jwt.sign({ username: user.username }, JWT_SECRET);
        res.json({ success: true, token, user: publicProfile(user) });
    } catch {
        res.json({ success: false, error: 'Login failed' });
    }
});

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        users:        users.size,
        activeMatches: activeMatches.size,
        queueSize:    matchmakingQueue.length
    });
});

// ── Socket.IO ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // ── authenticate ──────────────────────────────────────────────────────
    socket.on('authenticate', (data) => {
        try {
            const decoded = jwt.verify(data.token, JWT_SECRET);
            const user    = users.get(decoded.username.toLowerCase());
            if (!user) {
                socket.emit('auth_error', { message: 'Session expired. Please log in again.' });
                return;
            }
            socket.username = user.username;
            socket.user     = user;
            activeSockets.set(user.username, socket);
            socket.emit('authenticated', publicProfile(user));
            console.log('User authenticated:', user.username);
        } catch {
            socket.emit('error', { message: 'Invalid token' });
        }
    });

    // ── find_match ────────────────────────────────────────────────────────
    socket.on('find_match', (data) => {
        try {
            const { betAmount, mode } = data;
            const user = socket.user;

            if (!user)                                return socket.emit('error', { message: 'Not authenticated' });
            if (betAmount < 10 || betAmount > 500)    return socket.emit('error', { message: 'Bet must be between $10 and $500' });
            if (user.balance < betAmount)             return socket.emit('error', { message: 'Insufficient balance' });
            if (!['best_of_3', 'blitz'].includes(mode)) return socket.emit('error', { message: 'Invalid game mode' });
            if (matchmakingQueue.find(p => p.username === user.username))
                return socket.emit('error', { message: 'Already in matchmaking' });

            const mmrRange   = [user.mmr - 200, user.mmr + 200];
            const matchIndex = matchmakingQueue.findIndex(p =>
                p.betAmount === betAmount &&
                p.mode      === mode      &&
                p.mmr >= mmrRange[0] && p.mmr <= mmrRange[1] &&
                p.username  !== user.username
            );

            if (matchIndex !== -1) {
                const opponent = matchmakingQueue.splice(matchIndex, 1)[0];
                createMatch(socket, user, opponent, betAmount, mode);
            } else {
                matchmakingQueue.push({
                    username: user.username,
                    socketId: socket.id,
                    betAmount, mode,
                    mmr:  user.mmr,
                    rank: getRank(user.mmr),
                    mmrRange
                });
                socket.emit('matchmaking', { message: 'Searching for opponent...', mode });
            }
        } catch (err) {
            console.error('find_match error:', err);
            socket.emit('error', { message: 'Matchmaking failed' });
        }
    });

    // ── submit_guess ──────────────────────────────────────────────────────
    socket.on('submit_guess', (data) => {
        try {
            const match = activeMatches.get(socket.matchId);
            if (!match || match.status !== 'active')
                return socket.emit('error', { message: 'No active match' });

            const player = match.players.find(p => p.username === socket.username);
            if (!player || player.solved) return;

            const guess = data.word.toUpperCase();
            if (guess.length !== 5)      return socket.emit('error', { message: 'Guess must be 5 letters' });
            if (!VALID_WORDS.has(guess)) return socket.emit('invalid_word', { word: guess });

            const targetWord = match.mode === 'blitz' ? player.currentWord : match.targetWord;
            const evaluation = evaluateGuess(guess, targetWord);
            player.guesses.push({ word: guess, evaluation });

            const solved = evaluation.every(e => e === 'correct');
            if (solved) {
                player.solved    = true;
                player.solveTime = Date.now() - match.startTime;
            }

            socket.emit('guess_result', { guess: { word: guess, evaluation }, solved });

            const opp     = match.players.find(p => p.username !== socket.username);
            const oppSock = activeSockets.get(opp.username);
            if (oppSock) oppSock.emit('opponent_guess', { guess: { word: guess, evaluation }, solved });

            // Blitz: independent per-player resets
            if (match.mode === 'blitz') {
                if (solved) {
                    player.solves++;
                    Object.assign(player, { currentWord: getRandomWord(), guesses: [], solved: false, solveTime: null });
                    socket.emit('blitz_word_solved', {
                        newWord:        player.currentWord,
                        yourSolves:     player.solves,
                        opponentSolves: opp.solves
                    });
                    if (oppSock) oppSock.emit('blitz_opponent_solved', {
                        opponentSolves: player.solves,
                        yourSolves:     opp.solves
                    });
                } else if (player.guesses.length >= 6) {
                    Object.assign(player, { currentWord: getRandomWord(), guesses: [], solved: false });
                    socket.emit('blitz_word_failed', { newWord: player.currentWord });
                }
                return;
            }

            // Best-of-3 / standard end logic
            if (solved) {
                if (match.mode === 'best_of_3') endRound(socket.matchId);
                else endMatch(socket.matchId);
            } else if (player.guesses.length >= 6) {
                const bothDone = match.players.every(p => p.solved || p.guesses.length >= 6);
                if (bothDone) {
                    if (match.mode === 'best_of_3') endRound(socket.matchId);
                    else endMatch(socket.matchId);
                }
            }
        } catch (err) {
            console.error('submit_guess error:', err);
            socket.emit('error', { message: 'Failed to submit guess' });
        }
    });

    // ── cancel_search / cancel_matchmaking ────────────────────────────────
    function handleCancel() {
        const i = matchmakingQueue.findIndex(p => p.socketId === socket.id);
        if (i !== -1) matchmakingQueue.splice(i, 1);
    }
    socket.on('cancel_search',      handleCancel);
    socket.on('cancel_matchmaking', handleCancel);

    // ── disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        handleCancel();

        if (socket.matchId) {
            const match = activeMatches.get(socket.matchId);
            if (match && (match.status === 'active' || match.status === 'between_rounds')) {
                if (match.blitzTimeout) clearTimeout(match.blitzTimeout);
                const opp = match.players.find(p => p.username !== socket.username);
                if (opp) endMatch(socket.matchId, opp.username);
            }
        }

        if (socket.username) activeSockets.delete(socket.username);
    });
});

// ── Game flow helpers ────────────────────────────────────────────────────────

function createMatch(socket, user, opponent, betAmount, mode) {
    const matchId      = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const oppSocket    = activeSockets.get(opponent.username);

    const makePlayer = (u, sockId) => ({
        username: u.username, socketId: sockId,
        mmr: u.mmr, betAmount,
        guesses: [], solved: false, solveTime: null,
        solves: 0, currentWord: null
    });

    const match = {
        id: matchId, mode,
        players: [
            makePlayer(user,     socket.id),
            makePlayer(opponent, opponent.socketId)
        ],
        targetWord:   getRandomWord(),
        pot:          betAmount * 2,
        startTime:    Date.now(),
        status:       'active',
        scores:       { [user.username]: 0, [opponent.username]: 0 },
        currentRound: 1,
        blitzTimeout: null
    };

    if (mode === 'blitz') {
        match.players[0].currentWord = getRandomWord();
        match.players[1].currentWord = getRandomWord();
        match.blitzTimeout = setTimeout(() => endBlitz(matchId), 5 * 60 * 1000);
    }

    activeMatches.set(matchId, match);
    socket.matchId = matchId;
    if (oppSocket) oppSocket.matchId = matchId;

    const oppProfile = { username: opponent.username, mmr: opponent.mmr, rank: getRank(opponent.mmr) };
    const myProfile  = { username: user.username,     mmr: user.mmr,     rank: getRank(user.mmr)     };

    socket.emit('match_found',    { matchId, mode, opponent: oppProfile, pot: match.pot });
    if (oppSocket) oppSocket.emit('match_found', { matchId, mode, opponent: myProfile,  pot: match.pot });

    setTimeout(() => {
        const p1Word = mode === 'blitz' ? match.players[0].currentWord : match.targetWord;
        const p2Word = mode === 'blitz' ? match.players[1].currentWord : match.targetWord;
        socket.emit('match_start',    { targetWord: p1Word, mode });
        if (oppSocket) oppSocket.emit('match_start', { targetWord: p2Word, mode });
    }, 1000);
}

function endRound(matchId) {
    const match = activeMatches.get(matchId);
    if (!match || match.status !== 'active') return;
    match.status = 'between_rounds';

    const [p1, p2]   = match.players;
    const solver      = match.players.find(p => p.solved);
    let roundWinner   = null;

    if (solver) {
        roundWinner = solver.username;
    } else {
        if      (p1.guesses.length < p2.guesses.length) roundWinner = p1.username;
        else if (p2.guesses.length < p1.guesses.length) roundWinner = p2.username;
        // tie → no point awarded
    }
    if (roundWinner) match.scores[roundWinner]++;

    const s1    = match.scores[p1.username];
    const s2    = match.scores[p2.username];
    const s1Sok = activeSockets.get(p1.username);
    const s2Sok = activeSockets.get(p2.username);

    if (s1Sok) s1Sok.emit('round_end', { roundNumber: match.currentRound, roundWon: roundWinner === p1.username, yourScore: s1, opponentScore: s2, targetWord: match.targetWord });
    if (s2Sok) s2Sok.emit('round_end', { roundNumber: match.currentRound, roundWon: roundWinner === p2.username, yourScore: s2, opponentScore: s1, targetWord: match.targetWord });

    console.log(`Round ${match.currentRound}: ${p1.username}=${s1} ${p2.username}=${s2}`);

    if (s1 >= 2 || s2 >= 2) {
        setTimeout(() => endMatch(matchId, s1 >= 2 ? p1.username : p2.username), 4000);
    } else {
        match.currentRound++;
        match.targetWord = getRandomWord();
        match.players.forEach(p => { p.guesses = []; p.solved = false; p.solveTime = null; });
        setTimeout(() => {
            match.status = 'active';
            if (s1Sok) s1Sok.emit('round_start', { round: match.currentRound, targetWord: match.targetWord, yourScore: s1, opponentScore: s2 });
            if (s2Sok) s2Sok.emit('round_start', { round: match.currentRound, targetWord: match.targetWord, yourScore: s2, opponentScore: s1 });
        }, 3500);
    }
}

function endBlitz(matchId) {
    const match = activeMatches.get(matchId);
    if (!match || match.status === 'ended') return;
    const [p1, p2] = match.players;
    const winner = p1.solves >= p2.solves ? p1.username : p2.username; // p1 wins ties
    console.log(`Blitz ended: ${p1.username}=${p1.solves} ${p2.username}=${p2.solves} → ${winner}`);
    endMatch(matchId, winner);
}

function endMatch(matchId, forfeitWinner = null) {
    const match = activeMatches.get(matchId);
    if (!match) return;

    if (match.blitzTimeout) { clearTimeout(match.blitzTimeout); match.blitzTimeout = null; }
    match.status = 'ended';

    const [p1, p2] = match.players;
    let winner, loser;

    if (forfeitWinner) {
        winner = match.players.find(p => p.username === forfeitWinner);
        loser  = match.players.find(p => p.username !== forfeitWinner);
    } else {
        const s1 = p1.solved, s2 = p2.solved;
        if      (s1 && !s2)  { winner = p1; loser = p2; }
        else if (s2 && !s1)  { winner = p2; loser = p1; }
        else if (s1 && s2)   { winner = p1.solveTime < p2.solveTime ? p1 : p2; loser = winner === p1 ? p2 : p1; }
        else                 { winner = p1.guesses.length <= p2.guesses.length ? p1 : p2; loser = winner === p1 ? p2 : p1; }
    }

    const winnerUser = users.get(winner.username.toLowerCase());
    const loserUser  = users.get(loser.username.toLowerCase());
    if (!winnerUser || !loserUser) return;

    const mmrChange = calculateMMRChange(winner.mmr, loser.mmr, true);

    winnerUser.balance  += loser.betAmount;
    winnerUser.mmr      += mmrChange;
    winnerUser.gamesPlayed++;
    winnerUser.gamesWon++;

    loserUser.balance   -= loser.betAmount;
    loserUser.mmr       -= mmrChange;
    loserUser.gamesPlayed++;

    console.log(`Match ended: ${winner.username} defeats ${loser.username} (+${mmrChange} MMR)`);

    const wSock = activeSockets.get(winner.username);
    const lSock = activeSockets.get(loser.username);

    if (wSock) {
        wSock.emit('match_end', { won: true, targetWord: match.targetWord, winnings: loser.betAmount, mmrChange, newMMR: winnerUser.mmr, newRank: getRank(winnerUser.mmr), newBalance: winnerUser.balance, yourSolves: winner.solves });
        wSock.matchId = null;
    }
    if (lSock) {
        lSock.emit('match_end', { won: false, targetWord: match.targetWord, winnings: 0, mmrChange: -mmrChange, newMMR: loserUser.mmr, newRank: getRank(loserUser.mmr), newBalance: loserUser.balance, yourSolves: loser.solves });
        lSock.matchId = null;
    }

    setTimeout(() => activeMatches.delete(matchId), 5000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip sensitive fields before sending user data to clients. */
function publicProfile(user) {
    return {
        username:    user.username,
        balance:     user.balance,
        mmr:         user.mmr,
        rank:        getRank(user.mmr),
        gamesPlayed: user.gamesPlayed,
        gamesWon:    user.gamesWon
    };
}

// ── Start ────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
    console.log(`Worduel Server running on port ${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
});
