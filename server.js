const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'worduel-secret-key-change-in-production';

// In-memory database (use real DB in production)
const users = new Map();
const activeSockets = new Map();
const matchmakingQueue = [];
const activeMatches = new Map();

// Word list
const WORDS = [
    'CRANE', 'SLATE', 'TRACE', 'STARE', 'RAISE', 'SHINE', 'STONE', 'BRAVE',
    'GLOVE', 'PROVE', 'SHARE', 'SPARE', 'PHASE', 'SHAPE', 'GRAPE', 'TRADE',
    'CHASE', 'HOUSE', 'MOUSE', 'PLACE', 'PLANT', 'PIANO', 'CRIME', 'PRIME',
    'CLIMB', 'ROUND', 'SOUND', 'POUND', 'MOUNT', 'CLOUD', 'PROUD', 'FLOUR',
    'WORLD', 'WORTH', 'WRITE', 'WRONG', 'WROTE', 'FRESH', 'FLESH', 'FLASH',
    'TRASH', 'CRASH', 'STACK', 'TRACK', 'TRICK', 'TRUCK', 'TRUNK', 'TRUST'
];

// Rank system
const RANKS = [
    { name: 'Bronze', icon: '🥉', minMMR: 0 },
    { name: 'Silver', icon: '🥈', minMMR: 1100 },
    { name: 'Gold', icon: '🥇', minMMR: 1300 },
    { name: 'Platinum', icon: '💎', minMMR: 1500 },
    { name: 'Diamond', icon: '💠', minMMR: 1700 },
    { name: 'Master', icon: '⭐', minMMR: 1900 },
    { name: 'Grandmaster', icon: '🌟', minMMR: 2100 },
    { name: 'Legend', icon: '👑', minMMR: 2300 }
];

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Helper Functions
function getRank(mmr) {
    for (let i = RANKS.length - 1; i >= 0; i--) {
        if (mmr >= RANKS[i].minMMR) {
            return RANKS[i];
        }
    }
    return RANKS[0];
}

function getRandomWord() {
    return WORDS[Math.floor(Math.random() * WORDS.length)];
}

function calculateMMRChange(playerMMR, opponentMMR, won) {
    const K = 32;
    const expectedScore = 1 / (1 + Math.pow(10, (opponentMMR - playerMMR) / 400));
    const actualScore = won ? 1 : 0;
    return Math.round(K * (actualScore - expectedScore));
}

// REST API Endpoints
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.json({ success: false, error: 'Username and password required' });
        }
        
        if (password.length < 6) {
            return res.json({ success: false, error: 'Password must be at least 6 characters' });
        }
        
        if (users.has(username.toLowerCase())) {
            return res.json({ success: false, error: 'Username already exists' });
        }
        
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
        const rank = getRank(user.mmr);
        
        const token = jwt.sign({ username: user.username }, JWT_SECRET);
        
        res.json({ 
            success: true, 
            token,
            user: {
                username: user.username,
                balance: user.balance,
                mmr: user.mmr,
                rank,
                gamesPlayed: user.gamesPlayed,
                gamesWon: user.gamesWon
            }
        });
    } catch (error) {
        res.json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const user = users.get(username.toLowerCase());
        if (!user) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.json({ success: false, error: 'Invalid credentials' });
        }
        
        const rank = getRank(user.mmr);
        const token = jwt.sign({ username: user.username }, JWT_SECRET);
        
        res.json({ 
            success: true, 
            token,
            user: {
                username: user.username,
                balance: user.balance,
                mmr: user.mmr,
                rank,
                gamesPlayed: user.gamesPlayed,
                gamesWon: user.gamesWon
            }
        });
    } catch (error) {
        res.json({ success: false, error: 'Login failed' });
    }
});

// Socket.IO Connection
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('authenticate', (data) => {
        try {
            const decoded = jwt.verify(data.token, JWT_SECRET);
            const user = users.get(decoded.username.toLowerCase());
            
            if (user) {
                socket.username = user.username;
                socket.user = user;
                activeSockets.set(user.username, socket);

                socket.emit('authenticated', {
                    username: user.username,
                    balance: user.balance,
                    mmr: user.mmr,
                    rank: getRank(user.mmr),
                    gamesPlayed: user.gamesPlayed,
                    gamesWon: user.gamesWon
                });

                console.log(`User authenticated: ${user.username}`);
            } else {
                // Use auth_error so the client knows to redirect to login
                socket.emit('auth_error', { message: 'Session expired. Please log in again.' });
            }
        } catch (error) {
            socket.emit('error', { message: 'Invalid token' });
        }
    });
    
    // FIXED: Added mode parameter
    socket.on('find_match', (data) => {
        try {
            const { betAmount, mode } = data;
            const user = socket.user;
            
            if (!user) {
                socket.emit('error', { message: 'Not authenticated' });
                return;
            }
            
            if (betAmount < 10 || betAmount > 500) {
                socket.emit('error', { message: 'Bet must be between $10 and $500' });
                return;
            }
            
            if (user.balance < betAmount) {
                socket.emit('error', { message: 'Insufficient balance' });
                return;
            }
            
            // FIXED: Validate mode
            const validModes = ['best_of_3', 'blitz'];
            if (!mode || !validModes.includes(mode)) {
                socket.emit('error', { message: 'Invalid game mode' });
                return;
            }
            
            // Check if already in queue
            const alreadyInQueue = matchmakingQueue.find(p => p.username === user.username);
            if (alreadyInQueue) {
                socket.emit('error', { message: 'Already in matchmaking' });
                return;
            }
            
            const mmrRange = [user.mmr - 200, user.mmr + 200];
            
            // FIXED: Match only with same mode
            const matchIndex = matchmakingQueue.findIndex(p => 
                p.betAmount === betAmount &&
                p.mode === mode &&
                p.mmr >= mmrRange[0] &&
                p.mmr <= mmrRange[1] &&
                p.username !== user.username
            );
            
            if (matchIndex !== -1) {
                // Match found!
                const opponent = matchmakingQueue.splice(matchIndex, 1)[0];
                const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                const match = {
                    id: matchId,
                    mode: mode,  // FIXED: Store mode in match
                    players: [
                        { 
                            username: user.username, 
                            socketId: socket.id, 
                            mmr: user.mmr,
                            betAmount,
                            guesses: [],
                            solved: false,
                            solveTime: null
                        },
                        { 
                            username: opponent.username, 
                            socketId: opponent.socketId, 
                            mmr: opponent.mmr,
                            betAmount,
                            guesses: [],
                            solved: false,
                            solveTime: null
                        }
                    ],
                    targetWord: getRandomWord(),
                    pot: betAmount * 2,
                    startTime: Date.now(),
                    status: 'active'
                };
                
                activeMatches.set(matchId, match);
                socket.matchId = matchId;
                
                const opponentSocket = activeSockets.get(opponent.username);
                if (opponentSocket) {
                    opponentSocket.matchId = matchId;
                }
                
                // Notify both players
                const player1Data = {
                    matchId,
                    mode: mode,  // FIXED: Include mode
                    opponent: {
                        username: opponent.username,
                        mmr: opponent.mmr,
                        rank: getRank(opponent.mmr)
                    },
                    pot: match.pot
                };
                
                const player2Data = {
                    matchId,
                    mode: mode,  // FIXED: Include mode
                    opponent: {
                        username: user.username,
                        mmr: user.mmr,
                        rank: getRank(user.mmr)
                    },
                    pot: match.pot
                };
                
                socket.emit('match_found', player1Data);
                if (opponentSocket) {
                    opponentSocket.emit('match_found', player2Data);
                }
                
                // Start match after brief delay
                setTimeout(() => {
                    socket.emit('match_start', { 
                        targetWord: match.targetWord,
                        mode: mode  // FIXED: Send mode to client
                    });
                    if (opponentSocket) {
                        opponentSocket.emit('match_start', { 
                            targetWord: match.targetWord,
                            mode: mode  // FIXED: Send mode to client
                        });
                    }
                }, 1000);
                
            } else {
                // No match found, add to queue
                matchmakingQueue.push({
                    username: user.username,
                    socketId: socket.id,
                    betAmount,
                    mode: mode,  // FIXED: Store mode in queue
                    mmr: user.mmr,
                    rank: getRank(user.mmr),
                    mmrRange
                });
                
                socket.emit('matchmaking', { 
                    message: 'Searching for opponent...',
                    mode: mode  // FIXED: Echo mode back
                });
            }
        } catch (error) {
            console.error('Find match error:', error);
            socket.emit('error', { message: 'Matchmaking failed' });
        }
    });
    
    socket.on('submit_guess', (data) => {
        try {
            const match = activeMatches.get(socket.matchId);
            if (!match || match.status !== 'active') {
                socket.emit('error', { message: 'No active match' });
                return;
            }
            
            const player = match.players.find(p => p.username === socket.username);
            if (!player || player.solved) return;
            
            const guess = data.word.toUpperCase();
            
            // Validate guess
            if (guess.length !== 5) {
                socket.emit('error', { message: 'Guess must be 5 letters' });
                return;
            }
            
            // Evaluate guess
            const evaluation = evaluateGuess(guess, match.targetWord);
            player.guesses.push({ word: guess, evaluation });
            
            // Check if solved
            const solved = evaluation.every(e => e === 'correct');
            if (solved) {
                player.solved = true;
                player.solveTime = Date.now() - match.startTime;
            }
            
            // Send result to player
            socket.emit('guess_result', {
                guess: { word: guess, evaluation },
                solved
            });
            
            // Send to opponent
            const opponentSocket = activeSockets.get(
                match.players.find(p => p.username !== socket.username).username
            );
            if (opponentSocket) {
                opponentSocket.emit('opponent_guess', {
                    guess: { word: guess, evaluation },
                    solved
                });
            }
            
            // Check if match should end
            if (solved) {
                // First to solve wins immediately
                endMatch(socket.matchId);
            } else if (player.guesses.length >= 6) {
                // This player exhausted all guesses — end only when both are done
                const bothFinished = match.players.every(p => p.solved || p.guesses.length >= 6);
                if (bothFinished) {
                    endMatch(socket.matchId);
                }
            }
        } catch (error) {
            console.error('Submit guess error:', error);
            socket.emit('error', { message: 'Failed to submit guess' });
        }
    });
    
    // Handle both names (frontend uses 'cancel_search')
    function handleCancelMatchmaking() {
        const index = matchmakingQueue.findIndex(p => p.socketId === socket.id);
        if (index !== -1) {
            matchmakingQueue.splice(index, 1);
        }
    }
    socket.on('cancel_search', handleCancelMatchmaking);
    socket.on('cancel_matchmaking', handleCancelMatchmaking);
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Remove from queue
        const queueIndex = matchmakingQueue.findIndex(p => p.socketId === socket.id);
        if (queueIndex !== -1) {
            matchmakingQueue.splice(queueIndex, 1);
        }
        
        // Handle active match
        if (socket.matchId) {
            const match = activeMatches.get(socket.matchId);
            if (match && match.status === 'active') {
                const opponent = match.players.find(p => p.username !== socket.username);
                if (opponent) {
                    endMatch(socket.matchId, opponent.username);
                }
            }
        }
        
        if (socket.username) {
            activeSockets.delete(socket.username);
        }
    });
});

function evaluateGuess(guess, target) {
    const result = new Array(5).fill('absent');
    const targetLetters = target.split('');
    const guessLetters = guess.split('');
    
    // First pass: mark correct positions
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            result[i] = 'correct';
            targetLetters[i] = null;
            guessLetters[i] = null;
        }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] !== null) {
            const targetIndex = targetLetters.indexOf(guessLetters[i]);
            if (targetIndex !== -1) {
                result[i] = 'present';
                targetLetters[targetIndex] = null;
            }
        }
    }
    
    return result;
}

function endMatch(matchId, forfeitWinner = null) {
    const match = activeMatches.get(matchId);
    if (!match) return;
    
    match.status = 'ended';
    
    const [player1, player2] = match.players;
    
    let winner, loser;
    
    if (forfeitWinner) {
        winner = match.players.find(p => p.username === forfeitWinner);
        loser = match.players.find(p => p.username !== forfeitWinner);
    } else {
        // Determine winner
        const p1Solved = player1.solved;
        const p2Solved = player2.solved;
        
        if (p1Solved && !p2Solved) {
            winner = player1;
            loser = player2;
        } else if (p2Solved && !p1Solved) {
            winner = player2;
            loser = player1;
        } else if (p1Solved && p2Solved) {
            // Both solved, faster wins
            winner = player1.solveTime < player2.solveTime ? player1 : player2;
            loser = winner === player1 ? player2 : player1;
        } else {
            // Neither solved, fewer guesses wins
            winner = player1.guesses.length < player2.guesses.length ? player1 : player2;
            loser = winner === player1 ? player2 : player1;
        }
    }
    
    // Update balances and stats
    const winnerUser = users.get(winner.username.toLowerCase());
    const loserUser = users.get(loser.username.toLowerCase());
    
    if (winnerUser && loserUser) {
        const mmrChange = calculateMMRChange(winner.mmr, loser.mmr, true);
        
        // Each player's bet was never deducted upfront, so the winner earns
        // the opponent's bet and the loser loses their own bet.
        winnerUser.balance += loser.betAmount;
        winnerUser.mmr += mmrChange;
        winnerUser.gamesPlayed++;
        winnerUser.gamesWon++;

        loserUser.balance -= loser.betAmount;
        loserUser.mmr -= mmrChange;
        loserUser.gamesPlayed++;
        
        console.log(`Match ended: ${winner.username} defeats ${loser.username} (+${mmrChange} WMR)`);
        
        // Notify players
        const winnerSocket = activeSockets.get(winner.username);
        const loserSocket = activeSockets.get(loser.username);
        
        if (winnerSocket) {
            winnerSocket.emit('match_end', {
                won: true,
                draw: false,
                targetWord: match.targetWord,
                winnings: loser.betAmount,
                mmrChange: mmrChange,
                newMMR: winnerUser.mmr,
                newRank: getRank(winnerUser.mmr),
                newBalance: winnerUser.balance
            });
            winnerSocket.matchId = null;
        }
        
        if (loserSocket) {
            loserSocket.emit('match_end', {
                won: false,
                draw: false,
                targetWord: match.targetWord,
                winnings: 0,
                mmrChange: -mmrChange,
                newMMR: loserUser.mmr,
                newRank: getRank(loserUser.mmr),
                newBalance: loserUser.balance
            });
            loserSocket.matchId = null;
        }
    }
    
    // Clean up
    setTimeout(() => {
        activeMatches.delete(matchId);
    }, 5000);
}

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok',
        users: users.size,
        activeMatches: activeMatches.size,
        queueSize: matchmakingQueue.length
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Worduel Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/health`);
});
