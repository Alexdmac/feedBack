'use strict';

// The Home Song Library shows a random pick of the songs in the player's
// tuning. These tests cover the helpers in static/v3/songs.js that map the
// tuning card's offsets to a library tuning key and pick the random songs.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SONGS_JS = path.join(__dirname, '..', '..', 'static', 'v3', 'songs.js');

function extractBlock(src, startMarker) {
    const start = src.indexOf(startMarker);
    if (start === -1) throw new Error(`extractBlock: '${startMarker}' not found`);
    const openBrace = src.indexOf('{', start);
    let depth = 1;
    let i = openBrace + 1;
    while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    if (depth !== 0) throw new Error(`extractBlock: unbalanced braces after '${startMarker}'`);
    return src.slice(start, i);
}

function loadHelpers() {
    const src = fs.readFileSync(SONGS_JS, 'utf8');
    const body = [
        'function parseTuningOffsets(',
        'function findTuningEntry(',
        'function sampleIndices(',
        'function shuffleInPlace(',
    ].map((m) => extractBlock(src, m)).join('\n');
    const sandbox = { exports: {} };
    vm.createContext(sandbox);
    vm.runInContext(
        body + '\n'
        + 'exports.parseTuningOffsets = parseTuningOffsets;\n'
        + 'exports.findTuningEntry = findTuningEntry;\n'
        + 'exports.sampleIndices = sampleIndices;\n'
        + 'exports.shuffleInPlace = shuffleInPlace;',
        sandbox
    );
    return sandbox.exports;
}

// Deterministic random source (mulberry32) so the shuffle tests are stable.
function seeded(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ENTRIES = [
    { name: 'E Standard', key: 'E Standard', offsets: '0 0 0 0 0 0' },
    { name: 'Eb Standard', key: 'Eb Standard', offsets: '-1 -1 -1 -1 -1 -1' },
    { name: 'Drop D', key: 'Drop D', offsets: '-2 0 0 0 0 0' },
    { name: 'Bad', key: 'Bad', offsets: 'x y' },
];

test('parseTuningOffsets reads strings and arrays, rejects non-integers', () => {
    const h = loadHelpers();
    assert.deepEqual(Array.from(h.parseTuningOffsets('-1 -1 -1 -1 -1 -1')), [-1, -1, -1, -1, -1, -1]);
    assert.deepEqual(Array.from(h.parseTuningOffsets('-2,0,0,0,0,0')), [-2, 0, 0, 0, 0, 0]);
    assert.deepEqual(Array.from(h.parseTuningOffsets([0, 0, 0, 0])), [0, 0, 0, 0]);
    assert.equal(h.parseTuningOffsets(''), null);
    assert.equal(h.parseTuningOffsets(null), null);
    assert.equal(h.parseTuningOffsets('0 0.5 0'), null);
    assert.equal(h.parseTuningOffsets('a b c'), null);
});

test('findTuningEntry prefers an exact match', () => {
    const h = loadHelpers();
    assert.equal(h.findTuningEntry(ENTRIES, [-1, -1, -1, -1, -1, -1]).key, 'Eb Standard');
    assert.equal(h.findTuningEntry(ENTRIES, [-2, 0, 0, 0, 0, 0]).key, 'Drop D');
});

test('findTuningEntry matches on the shared length of 4 or more strings', () => {
    const h = loadHelpers();
    // A 7-string player tuning against 6-string library entries.
    assert.equal(h.findTuningEntry(ENTRIES, [-1, -1, -1, -1, -1, -1, -1]).key, 'Eb Standard');
    // Fewer than 4 shared strings is not a match.
    assert.equal(h.findTuningEntry(ENTRIES, [-1, -1, -1]), null);
});

test('findTuningEntry returns null with no match or bad input', () => {
    const h = loadHelpers();
    assert.equal(h.findTuningEntry(ENTRIES, [-5, -5, -5, -5, -5, -5]), null);
    assert.equal(h.findTuningEntry(ENTRIES, null), null);
    assert.equal(h.findTuningEntry(null, [0, 0, 0, 0, 0, 0]), null);
});

test('sampleIndices returns distinct indices in range', () => {
    const h = loadHelpers();
    const out = Array.from(h.sampleIndices(1237, 24, seeded(7)));
    assert.equal(out.length, 24);
    assert.equal(new Set(out).size, 24);
    assert.ok(out.every((i) => Number.isInteger(i) && i >= 0 && i < 1237));
});

test('sampleIndices clamps the count to the total', () => {
    const h = loadHelpers();
    const out = Array.from(h.sampleIndices(5, 12, seeded(3)));
    assert.deepEqual(out.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4]);
    assert.equal(h.sampleIndices(0, 12, seeded(3)).length, 0);
});

test('shuffleInPlace keeps every item and changes the order', () => {
    const h = loadHelpers();
    const src = Array.from({ length: 20 }, (_, i) => i);
    const out = h.shuffleInPlace(src.slice(), seeded(11));
    assert.deepEqual(out.slice().sort((a, b) => a - b), src);
    assert.notDeepEqual(out, src);
});
