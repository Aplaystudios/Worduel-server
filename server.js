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
    }
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
        
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
        const rank = getRank(user.mmr);
        
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
        console.error('Registration error:', error);
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
        
        const token = jwt.sign({ username: user.username }, JWT_SECRET, { expiresIn: '30d' });
        const rank = getRank(user.mmr);
        
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
        console.error('Login error:', error);
        res.json({ success: false, error: 'Login failed' });
    }
});

// WebSocket Connection
io.on('connection', (socket) => {
    console.log('New connection:', socket.id);
    
    socket.on('authenticate', (data) => {
        try {
            const { token } = data;
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = users.get(decoded.username.toLowerCase());
            
            if (!user) {
                socket.emit('auth_error', { message: 'User not found' });
                return;
            }
            
            socket.username = user.username;
            socket.user = user;
            activeSockets.set(socket.username, socket);
            
            socket.emit('authenticated', {
                user: {
                    username: user.username,
                    balance: user.balance,
                    mmr: user.mmr,
                    rank: getRank(user.mmr),
                    gamesPlayed: user.gamesPlayed,
                    gamesWon: user.gamesWon
                }
            });
            
            io.emit('online_count', activeSockets.size);
        } catch (error) {
            console.error('Auth error:', error);
            socket.emit('auth_error', { message: 'Authentication failed' });
        }
    });
    
    socket.on('find_match', (data) => {
        try {
            const { betAmount } = data;
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
            
            // Check if already in queue
            const alreadyInQueue = matchmakingQueue.find(p => p.username === user.username);
            if (alreadyInQueue) {
                socket.emit('error', { message: 'Already in matchmaking' });
                return;
            }
            
            const mmrRange = [user.mmr - 200, user.mmr + 200];
            
            // Try to find a match
            const matchIndex = matchmakingQueue.findIndex(p => 
                p.betAmount === betAmount &&
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
                    opponent: {
                        username: opponent.username,
                        mmr: opponent.mmr,
                        rank: getRank(opponent.mmr)
                    },
                    pot: match.pot
                };
                
                const player2Data = {
                    matchId,
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
                    socket.emit('match_start', { targetWord: match.targetWord });
                    if (opponentSocket) {
                        opponentSocket.emit('match_start', { targetWord: match.targetWord });
                    }
                }, 1000);
                
            } else {
                // No match found, add to queue
                matchmakingQueue.push({
                    username: user.username,
                    socketId: socket.id,
                    mmr: user.mmr,
                    betAmount,
                    timestamp: Date.now()
                });
                
                socket.emit('searching', {
                    betAmount,
                    mmrRange
                });
            }
        } catch (error) {
            console.error('Find match error:', error);
            socket.emit('error', { message: 'Matchmaking failed' });
        }
    });
    
    socket.on('cancel_search', () => {
        const index = matchmakingQueue.findIndex(p => p.username === socket.username);
        if (index !== -1) {
            matchmakingQueue.splice(index, 1);
        }
    });
    
    socket.on('submit_guess', (data) => {
        try {
            const { word } = data;
            const matchId = socket.matchId;
            
            if (!matchId) {
                socket.emit('error', { message: 'Not in a match' });
                return;
            }
            
            const match = activeMatches.get(matchId);
            if (!match || match.status !== 'active') {
                socket.emit('error', { message: 'Match not found or ended' });
                return;
            }
            
            const player = match.players.find(p => p.username === socket.username);
            if (!player) {
                socket.emit('error', { message: 'Player not found in match' });
                return;
            }
            
            if (player.solved) {
                socket.emit('error', { message: 'Already solved' });
                return;
            }
            
            if (word.length !== 5) {
                socket.emit('error', { message: 'Word must be 5 letters' });
                return;
            }
            
            // Evaluate guess
            const evaluation = evaluateGuess(word.toUpperCase(), match.targetWord);
            const guess = { word: word.toUpperCase(), evaluation };
            player.guesses.push(guess);
            
            const solved = evaluation.every(e => e === 'correct');
            if (solved) {
                player.solved = true;
                player.solveTime = Date.now() - match.startTime;
            }
            
            // Send result to player
            socket.emit('guess_result', { guess, solved });
            
            // Notify opponent
            const opponent = match.players.find(p => p.username !== socket.username);
            const opponentSocket = activeSockets.get(opponent.username);
            if (opponentSocket) {
                opponentSocket.emit('opponent_guess', { 
                    guess,
                    solved
                });
            }
            
            // Check if match is over
            const bothSolved = match.players.every(p => p.solved);
            const maxGuesses = match.players.some(p => p.guesses.length >= 6);
            
            if (bothSolved || maxGuesses) {
                endMatch(matchId);
            }
        } catch (error) {
            console.error('Submit guess error:', error);
            socket.emit('error', { message: 'Failed to submit guess' });
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected:', socket.id);
        
        if (socket.username) {
            activeSockets.delete(socket.username);
            
            // Remove from queue
            const queueIndex = matchmakingQueue.findIndex(p => p.username === socket.username);
            if (queueIndex !== -1) {
                matchmakingQueue.splice(queueIndex, 1);
            }
            
            // Handle active match
            if (socket.matchId) {
                const match = activeMatches.get(socket.matchId);
                if (match && match.status === 'active') {
                    const opponent = match.players.find(p => p.username !== socket.username);
                    const opponentSocket = activeSockets.get(opponent.username);
                    
                    if (opponentSocket) {
                        opponentSocket.emit('opponent_disconnected');
                        // Award win to remaining player
                        endMatch(socket.matchId, opponent.username);
                    }
                }
            }
            
            io.emit('online_count', activeSockets.size);
        }
    });
});

function evaluateGuess(guess, target) {
    const result = [];
    const targetLetters = target.split('');
    const used = new Array(5).fill(false);
    
    // First pass: mark correct positions
    for (let i = 0; i < 5; i++) {
        if (guess[i] === targetLetters[i]) {
            result[i] = 'correct';
            used[i] = true;
        } else {
            result[i] = null;
        }
    }
    
    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
        if (result[i] === null) {
            const idx = targetLetters.findIndex((letter, j) => 
                letter === guess[i] && !used[j]
            );
            if (idx !== -1) {
                result[i] = 'present';
                used[idx] = true;
            } else {
                result[i] = 'absent';
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
        
        winnerUser.balance += match.pot;
        winnerUser.mmr += mmrChange;
        winnerUser.gamesPlayed++;
        winnerUser.gamesWon++;
        
        loserUser.balance -= loser.betAmount;
        loserUser.mmr -= mmrChange;
        loserUser.gamesPlayed++;
        
        // Notify players
        const winnerSocket = activeSockets.get(winner.username);
        const loserSocket = activeSockets.get(loser.username);
        
        if (winnerSocket) {
            winnerSocket.emit('match_end', {
                won: true,
                draw: false,
                targetWord: match.targetWord,
                winnings: match.pot,
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
        online: activeSockets.size,
        queue: matchmakingQueue.length,
        matches: activeMatches.size
    });
});

server.listen(PORT, () => {
    console.log(`🎮 Worduel Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
});
