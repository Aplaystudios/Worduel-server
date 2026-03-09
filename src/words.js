// Valid 5-letter words for guess validation.
// solutions.txt  — 2,314 Wordle answers (also valid guesses)
// guesses.txt    — 10,656 additional allowed guesses (not solutions)
// Union = 12,970 valid guesses total.

const fs = require('fs');
const path = require('path');

function loadWords(filename) {
    return fs.readFileSync(path.join(__dirname, filename), 'utf8')
        .split('\n')
        .map(w => w.trim().toUpperCase())
        .filter(w => w.length === 5);
}

const solutions = loadWords('solutions.txt');
const guesses   = loadWords('guesses.txt');

module.exports = new Set([...solutions, ...guesses]);
