const { io } = require('socket.io-client');
const TOKEN1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InBsYXllcjEiLCJpYXQiOjE3NzE2OTMzNTl9.tqTGFTdz9nwX-yXGxBfeBk1tS5mJ0R7y54rir-ICfYU';
const TOKEN2 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InBsYXllcjIiLCJpYXQiOjE3NzE2OTMzNTl9.XVrnq-WL9rN02ZeuHn93ZWXlcgdRHPd9Fk85BxuBG0s';

const s1 = io('http://localhost:3000');
const s2 = io('http://localhost:3000');

s1.on('connect', () => { console.log('[P1] connected'); s1.emit('authenticate', { token: TOKEN1 }); });
s2.on('connect', () => { console.log('[P2] connected'); s2.emit('authenticate', { token: TOKEN2 }); });

s1.on('authenticated', (d) => { console.log('[P1] auth ok — balance:$'+d.balance+' mmr:'+d.mmr); s1.emit('find_match', { betAmount: 50, mode: 'best_of_3' }); });
s2.on('authenticated', (d) => { console.log('[P2] auth ok — balance:$'+d.balance+' mmr:'+d.mmr); s2.emit('find_match', { betAmount: 50, mode: 'best_of_3' }); });

s1.on('match_found', (d) => console.log('[P1] match_found vs', d.opponent.username, '| pot $'+d.pot));
s2.on('match_found', (d) => console.log('[P2] match_found vs', d.opponent.username, '| pot $'+d.pot));

s1.on('match_start', (d) => {
    console.log('[P1] match_start — word:', d.targetWord, '| mode:', d.mode);
    setTimeout(() => { console.log('[P1] guessing correct word'); s1.emit('submit_guess', { word: d.targetWord }); }, 200);
});
s2.on('match_start', (d) => {
    console.log('[P2] match_start — mode:', d.mode);
    setTimeout(() => { console.log('[P2] guessing wrong word'); s2.emit('submit_guess', { word: 'CRANE' }); }, 500);
});

s1.on('guess_result', (d) => console.log('[P1] guess_result — solved:', d.solved, 'eval:', d.guess.evaluation.join(',')));
s2.on('guess_result', (d) => console.log('[P2] guess_result — solved:', d.solved));
s1.on('opponent_guess', (d) => console.log('[P1] saw opp guess — solved:', d.solved));
s2.on('opponent_guess', (d) => console.log('[P2] saw opp guess — solved:', d.solved));

s1.on('match_end', (d) => { console.log('[P1] MATCH END — won:'+d.won+' mmrChange:'+d.mmrChange+' newBalance:$'+d.newBalance); });
s2.on('match_end', (d) => { console.log('[P2] MATCH END — won:'+d.won+' mmrChange:'+d.mmrChange+' newBalance:$'+d.newBalance); s1.disconnect(); s2.disconnect(); process.exit(0); });

s1.on('error', (e) => console.error('[P1] error:', e.message));
s2.on('error', (e) => console.error('[P2] error:', e.message));

setTimeout(() => { console.log('TIMEOUT — match_end never fired'); process.exit(1); }, 6000);
