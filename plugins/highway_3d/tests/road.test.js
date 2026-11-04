// Night road background — street-light placement.
//
// The 'road' background style puts a street-light post beside the highway on
// every beat (a taller one on every bar line), at the same z a note at that
// time would sit, so the posts move by SONG time: pause freezes them, seeking
// jumps them, practice speed slows them. The pure placement math lives in a
// self-contained block in screen.js; this test slices it out between its
// marker comments and evaluates it in a bare context. The markers are asserted
// first: move or rename the block and this fails loudly instead of testing
// nothing.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCREEN_JS = path.join(__dirname, '..', 'screen.js');
const START = '    // --- road placement (sliced by tests/road.test.js) ---';
const END = '    // --- end road placement ---';

function load() {
    const src = fs.readFileSync(SCREEN_JS, 'utf8');
    const a = src.indexOf(START);
    const b = src.indexOf(END);
    assert.ok(a >= 0, 'road placement start marker missing from screen.js');
    assert.ok(b > a, 'road placement end marker missing from screen.js');
    assert.equal(src.indexOf(START, a + 1), -1, 'start marker must be unique');
    const block = src.slice(a, b);
    // No globals: the block must not reach for THREE, the DOM or the clock.
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(block +
        '\nthis.ROAD_POST_POOL = ROAD_POST_POOL;' +
        '\nthis._roadMakeSlots = _roadMakeSlots;' +
        '\nthis._roadPlacePosts = _roadPlacePosts;', sandbox);
    return sandbox;
}

// Same semantics as static/highway.js's bsearchTime (bundle.lowerBoundTime).
function lowerBoundTime(arr, time) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].time < time) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}

// 120 BPM, 4/4: a beat every 0.5 s, bar lines (measure >= 0) every 4th beat.
function makeBeats(count, step = 0.5) {
    const beats = [];
    for (let i = 0; i < count; i++) {
        beats.push({ time: i * step, measure: i % 4 === 0 ? i / 4 + 1 : -1 });
    }
    return beats;
}

const TS = 230 * (2.25 / 300);
const BEHIND = 0.5;
const AHEAD = 3.0 + 1;

test('pool has 64 slots per side, preallocated', () => {
    const r = load();
    assert.equal(r.ROAD_POST_POOL, 64);
    const slots = r._roadMakeSlots(r.ROAD_POST_POOL);
    assert.equal(slots.length, 64);
    for (const s of slots) assert.deepEqual(Object.keys(s).sort(), ['isBar', 'z']);
});

test('posts sit at z = -(beat.time - now) * TS', () => {
    const r = load();
    const beats = makeBeats(100);
    const slots = r._roadMakeSlots(r.ROAD_POST_POOL);
    const now = 10.25;
    const n = r._roadPlacePosts(beats, now, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    assert.ok(n > 0);
    const visible = beats.filter((b) => b.time >= now - BEHIND && b.time <= now + AHEAD);
    assert.equal(n, visible.length);
    for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(slots[i].z - (-(visible[i].time - now) * TS)) < 1e-9, `slot ${i} z`);
    }
    // A beat exactly at `now` would sit on the hit line (z = 0); the
    // nearest-future beat is ahead of it (negative z).
    assert.ok(slots[n - 1].z < 0);
});

test('bar lines come from measure >= 0', () => {
    const r = load();
    const beats = makeBeats(40);
    const slots = r._roadMakeSlots(64);
    const n = r._roadPlacePosts(beats, 4.0, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    const visible = beats.filter((b) => b.time >= 3.5 && b.time <= 8.0);
    assert.equal(n, visible.length);
    for (let i = 0; i < n; i++) {
        assert.equal(slots[i].isBar, visible[i].measure >= 0, `beat at ${visible[i].time}`);
    }
    assert.ok(slots.slice(0, n).some((s) => s.isBar), 'window includes a bar line');
    assert.ok(slots.slice(0, n).some((s) => !s.isBar), 'window includes a plain beat');
});

test('culls to [now - BEHIND, now + AHEAD]', () => {
    const r = load();
    const beats = makeBeats(200);
    const slots = r._roadMakeSlots(64);
    const now = 50;
    const n = r._roadPlacePosts(beats, now, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    for (let i = 0; i < n; i++) {
        const t = now - slots[i].z / TS;
        assert.ok(t >= now - BEHIND - 1e-9 && t <= now + AHEAD + 1e-9, `t=${t} inside window`);
    }
    // 0.5 s spacing across a 4.5 s window, both ends inclusive: 10 beats.
    assert.equal(n, 10);
    // Past the end of the chart: nothing to place.
    assert.equal(r._roadPlacePosts(beats, 1000, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64), 0);
});

test('without lowerBoundTime it falls back to a linear scan with the same result', () => {
    const r = load();
    const beats = makeBeats(200);
    const a = r._roadMakeSlots(64), b = r._roadMakeSlots(64);
    const na = r._roadPlacePosts(beats, 33.3, TS, BEHIND, AHEAD, lowerBoundTime, a, 64);
    const nb = r._roadPlacePosts(beats, 33.3, TS, BEHIND, AHEAD, undefined, b, 64);
    assert.equal(na, nb);
    for (let i = 0; i < na; i++) {
        assert.equal(a[i].z, b[i].z);
        assert.equal(a[i].isBar, b[i].isBar);
    }
});

test('zero posts when beats are empty or missing', () => {
    const r = load();
    const slots = r._roadMakeSlots(64);
    assert.equal(r._roadPlacePosts([], 0, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64), 0);
    assert.equal(r._roadPlacePosts(null, 0, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64), 0);
    assert.equal(r._roadPlacePosts(undefined, 0, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64), 0);
});

test('caps at the pool size', () => {
    const r = load();
    // A beat every 10 ms: 450 beats in the window, far more than the pool.
    const beats = makeBeats(2000, 0.01);
    const slots = r._roadMakeSlots(64);
    const n = r._roadPlacePosts(beats, 5, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    assert.equal(n, 64);
    assert.equal(slots.length, 64, 'never grows the slot array');
});

test('reuses the preallocated slots and allocates nothing new', () => {
    const r = load();
    const beats = makeBeats(100);
    const slots = r._roadMakeSlots(64);
    const before = slots.slice();
    for (let f = 0; f < 120; f++) {
        r._roadPlacePosts(beats, 5 + f / 60, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    }
    assert.equal(slots.length, 64);
    for (let i = 0; i < 64; i++) {
        assert.equal(slots[i], before[i], `slot ${i} is the same object`);
        assert.deepEqual(Object.keys(slots[i]).sort(), ['isBar', 'z'], `slot ${i} gained no fields`);
    }
    // The beats array is read-only to the placement code.
    assert.deepEqual(beats, makeBeats(100));
});

test('moves by song time: same time in, same posts out; time advance moves them toward the camera', () => {
    const r = load();
    const beats = makeBeats(100);
    const a = r._roadMakeSlots(64), b = r._roadMakeSlots(64);
    // Paused: two frames at the same song time are identical.
    const n1 = r._roadPlacePosts(beats, 12.1, TS, BEHIND, AHEAD, lowerBoundTime, a, 64);
    const n2 = r._roadPlacePosts(beats, 12.1, TS, BEHIND, AHEAD, lowerBoundTime, b, 64);
    assert.equal(n1, n2);
    for (let i = 0; i < n1; i++) assert.equal(a[i].z, b[i].z);
    // Advance 0.1 s: a post for the same beat moves +0.1 * TS (toward z > 0).
    r._roadPlacePosts(beats, 12.2, TS, BEHIND, AHEAD, lowerBoundTime, b, 64);
    const beatT = 13.0;
    const za = a.find((s) => Math.abs(s.z - (-(beatT - 12.1) * TS)) < 1e-9);
    const zb = b.find((s) => Math.abs(s.z - (-(beatT - 12.2) * TS)) < 1e-9);
    assert.ok(za && zb, 'beat at 13.0 placed in both frames');
    assert.ok(Math.abs((zb.z - za.z) - 0.1 * TS) < 1e-9);
});
