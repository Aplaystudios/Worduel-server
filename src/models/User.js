const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username:              { type: String, required: true, unique: true },
    password:              { type: String, default: null },
    googleId:              { type: String, default: null },
    balance:               { type: Number, default: 1000 },
    mmr:                   { type: Number, default: 1000 },
    gamesPlayed:           { type: Number, default: 0 },
    gamesWon:              { type: Number, default: 0 },
    createdAt:             { type: Number, default: () => Date.now() },
    lastDailyRewardAt:     { type: Number, default: null },
    lastMatchBet:          { type: Number, default: 0 },
    lastMatchWon:          { type: Boolean, default: false },
    lastMatchWinnings:     { type: Number, default: 0 },
    consolationClaimed:    { type: Boolean, default: false },
    doubleWinningsClaimed: { type: Boolean, default: false },
}, { versionKey: false });

module.exports = mongoose.model('User', userSchema);
