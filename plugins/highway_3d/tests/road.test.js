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
        '\nthis._roadPlacePosts = _roadPlacePosts;' +
        '\nthis._roadPostPattern = _roadPostPattern;' +
        '\nthis._roadDashPhase = _roadDashPhase;' +
        '\nthis._roadMakeLaneBuf = _roadMakeLaneBuf;' +
        '\nthis._roadBuildLanes = _roadBuildLanes;' +
        '\nthis.ROAD_SIGN_POOL = ROAD_SIGN_POOL;' +
        '\nthis._roadMakeSignSlots = _roadMakeSignSlots;' +
        '\nthis._roadPlaceSigns = _roadPlaceSigns;' +
        '\nthis._roadHashStr = _roadHashStr;' +
        '\nthis._roadNoise2 = _roadNoise2;' +
        '\nthis._roadMakeTowerBuf = _roadMakeTowerBuf;' +
        '\nthis._roadTowerLayout = _roadTowerLayout;' +
        '\nthis._roadWindowLayout = _roadWindowLayout;' +
        '\nthis._roadWindowCount = _roadWindowCount;' +
        '\nthis.ROAD_MOOD_IDLE = ROAD_MOOD_IDLE;' +
        '\nthis._roadMakeMood = _roadMakeMood;' +
        '\nthis._roadResetMood = _roadResetMood;' +
        '\nthis._roadMoodStep = _roadMoodStep;' +
        '\nthis._roadSmooth = _roadSmooth;' +
        '\nthis._roadMakeQuality = _roadMakeQuality;' +
        '\nthis._roadQualityStep = _roadQualityStep;' +
        '\nthis._roadAutoMinFps = _roadAutoMinFps;' +
        '\nthis._roadAutoCooldown = _roadAutoCooldown;' +
        '\nthis.ROAD_AUTO_WAKE_FAILS = ROAD_AUTO_WAKE_FAILS;' +
        '\nthis._roadWindowFrac = _roadWindowFrac;' +
        '\nthis._roadCityLit = _roadCityLit;' +
        '\nthis._roadCityDark = _roadCityDark;', sandbox);
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

// --- lanes (step 1b): every fret position is a highway lane ---

const PERIOD = 60 * (2.25 / 300);

test('dash phase advances with song time and wraps at the period', () => {
    const r = load();
    const p0 = r._roadDashPhase(1.0, TS, PERIOD);
    assert.ok(p0 >= 0 && p0 < PERIOD);
    // A small advance moves the phase by dt * TS (toward the player).
    const dt = 0.01;
    const p1 = r._roadDashPhase(1.0 + dt, TS, PERIOD);
    const step = ((p1 - p0) % PERIOD + PERIOD) % PERIOD;
    assert.ok(Math.abs(step - dt * TS) < 1e-9);
    // One full period of song time later the pattern is the same.
    const tPeriod = PERIOD / TS;
    assert.ok(Math.abs(r._roadDashPhase(1.0 + tPeriod, TS, PERIOD) - p0) < 1e-9);
    for (let t = 0; t < 30; t += 0.37) {
        const p = r._roadDashPhase(t, TS, PERIOD);
        assert.ok(p >= 0 && p < PERIOD, `t=${t} phase in range`);
    }
});

test('dash phase is frozen while paused and handles negative time', () => {
    const r = load();
    assert.equal(r._roadDashPhase(12.345, TS, PERIOD), r._roadDashPhase(12.345, TS, PERIOD));
    const pn = r._roadDashPhase(-0.3, TS, PERIOD);
    assert.ok(pn >= 0 && pn < PERIOD);
    const expected = ((-0.3 * TS) % PERIOD + PERIOD) % PERIOD;
    assert.ok(Math.abs(pn - expected) < 1e-12);
    assert.equal(r._roadDashPhase(0, TS, PERIOD), 0);
});

// Same rules as screen.js getChartAnchorAt / laneBoundsFromAnchor (NFRETS 24).
function getAnchorAt(arr, t) {
    if (!arr || !arr.length) return null;
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid].time <= t) lo = mid + 1;
        else hi = mid;
    }
    return lo === 0 ? arr[0] : arr[lo - 1];
}
function boundsOf(anc) {
    if (!anc) return null;
    let fStart = Math.round(Number(anc.fret));
    if (!Number.isFinite(fStart) || fStart < 1) fStart = 1;
    let w = Number(anc.width);
    if (!Number.isFinite(w)) w = 4;
    w = Math.max(1, Math.round(w));
    const fLast = Math.min(24, fStart + w - 1);
    return { dMin: Math.max(0, fStart - 1), dMax: Math.min(24, fLast) };
}
function lanes(buf, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push([buf.dMin[i], buf.dMax[i], buf.isCur[i]]);
    return out;
}
function jumps(buf) {
    const out = [];
    for (let i = 0; i < buf.nJumps; i++) {
        out.push({ z: buf.jz[i], from: [buf.jFromMin[i], buf.jFromMax[i]], to: [buf.jToMin[i], buf.jToMax[i]] });
    }
    return out;
}

test('no anchors means no lanes and no lane changes', () => {
    const r = load();
    const buf = r._roadMakeLaneBuf(32);
    for (const a of [null, undefined, []]) {
        assert.equal(r._roadBuildLanes(a, 5, TS, BEHIND, AHEAD, getAnchorAt, boundsOf, buf, 32), 0);
        assert.equal(buf.nJumps, 0);
    }
});

test('lanes: distinct spans in the window, current lane flagged, lane in force before the window included', () => {
    const r = load();
    const buf = r._roadMakeLaneBuf(32);
    const anchors = [
        { time: 0, fret: 1, width: 4 },    // (0,4) in force at the window start
        { time: 9, fret: 5, width: 4 },    // (4,8) current at now=10
        { time: 11, fret: 1, width: 4 },   // back to (0,4): duplicate span
        { time: 12, fret: 7, width: 5 },   // (6,11)
        { time: 20, fret: 12, width: 4 },  // outside the window
    ];
    const now = 10;
    const n = r._roadBuildLanes(anchors, now, TS, 1.5, AHEAD, getAnchorAt, boundsOf, buf, 32);
    // Window [8.5, 14]: anchor @0 is in force at 8.5, then 9, 11, 12.
    assert.deepEqual(lanes(buf, n), [[0, 4, false], [4, 8, true], [6, 11, false]]);
    const js = jumps(buf);
    assert.equal(js.length, 3);
    assert.deepEqual(js.map((j) => [j.from, j.to]), [[[0, 4], [4, 8]], [[4, 8], [0, 4]], [[0, 4], [6, 11]]]);
    for (const [j, t] of [[js[0], 9], [js[1], 11], [js[2], 12]]) {
        assert.ok(Math.abs(j.z - (-(t - now) * TS)) < 1e-9, `jump at ${t}`);
    }
});

test('lane changes only where the span changes', () => {
    const r = load();
    const buf = r._roadMakeLaneBuf(32);
    const anchors = [
        { time: 0, fret: 3, width: 4 },
        { time: 1, fret: 3, width: 4 },   // same span: no lane change
        { time: 2, fret: 3, width: 5 },   // one fret wider: a distinct lane
        { time: 3, fret: 3, width: 5 },
    ];
    const n = r._roadBuildLanes(anchors, 1.5, TS, BEHIND, AHEAD, getAnchorAt, boundsOf, buf, 32);
    assert.deepEqual(lanes(buf, n), [[2, 6, true], [2, 7, false]]);
    const js = jumps(buf);
    assert.equal(js.length, 1);
    assert.ok(Math.abs(js[0].z - (-(2 - 1.5) * TS)) < 1e-9);
    // Before the first anchor, the first anchor still defines the lane.
    const n2 = r._roadBuildLanes(anchors, -2, TS, BEHIND, 1, getAnchorAt, boundsOf, buf, 32);
    assert.deepEqual(lanes(buf, n2), [[2, 6, true]]);
    assert.equal(buf.nJumps, 0);
});

test('lanes respect the cap and reuse the buffer', () => {
    const r = load();
    const buf = r._roadMakeLaneBuf(4);
    const arrays = [buf.dMin, buf.dMax, buf.isCur, buf.jz, buf.jFromMin, buf.jFromMax, buf.jToMin, buf.jToMax];
    // A new span every 0.1 s: ~45 in the window, far over the cap.
    const anchors = [];
    for (let i = 0; i < 200; i++) anchors.push({ time: i * 0.1, fret: 1 + (i % 20), width: 4 });
    for (let f = 0; f < 30; f++) {
        const n = r._roadBuildLanes(anchors, 5 + f / 60, TS, BEHIND, AHEAD, getAnchorAt, boundsOf, buf, 4);
        assert.equal(n, 4);
        assert.equal(buf.nJumps, 4);
    }
    const n = r._roadBuildLanes(anchors, 5, TS, BEHIND, AHEAD, getAnchorAt, boundsOf, buf, 2);
    assert.equal(n, 2);
    assert.equal(buf.nJumps, 2);
    const after = [buf.dMin, buf.dMax, buf.isCur, buf.jz, buf.jFromMin, buf.jFromMax, buf.jToMin, buf.jToMax];
    for (let i = 0; i < arrays.length; i++) {
        assert.equal(after[i], arrays[i], 'same array object');
        assert.equal(after[i].length, 4, 'never grows');
    }
});

// --- step 2: section signs, hills, skyline ---

const SECTIONS = [
    { time: 0, name: 'intro' }, { time: 8, name: 'verse' }, { time: 16, name: 'chorus' },
    { time: 24, name: 'verse' }, { time: 32, name: 'solo' }, { time: 40, name: 'outro' },
];

test('signs sit at z = -(section.time - now) * TS with their section index', () => {
    const r = load();
    assert.equal(r.ROAD_SIGN_POOL, 6);
    const slots = r._roadMakeSignSlots(r.ROAD_SIGN_POOL);
    const now = 15;
    const n = r._roadPlaceSigns(SECTIONS, now, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6);
    assert.equal(n, 1);
    assert.equal(slots[0].index, 2);
    assert.ok(Math.abs(slots[0].z - (-(16 - now) * TS)) < 1e-9);
    // At the section start the gantry is exactly over the hit line.
    r._roadPlaceSigns(SECTIONS, 16, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6);
    assert.ok(Math.abs(slots[0].z) < 1e-12);
});

test('signs are culled to [now - behind, now + ahead]', () => {
    const r = load();
    const slots = r._roadMakeSignSlots(6);
    // 8.4: 'verse' at 8 is 0.4 s behind (kept); 'chorus' at 16 is too far ahead.
    let n = r._roadPlaceSigns(SECTIONS, 8.4, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6);
    assert.equal(n, 1);
    assert.equal(slots[0].index, 1);
    // 8.6: 'verse' is 0.6 s behind (gone), nothing ahead within 4 s.
    n = r._roadPlaceSigns(SECTIONS, 8.6, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6);
    assert.equal(n, 0);
    // Without a lower-bound helper the linear scan gives the same answer.
    n = r._roadPlaceSigns(SECTIONS, 8.4, TS, BEHIND, AHEAD, null, slots, 6);
    assert.equal(n, 1);
    assert.equal(slots[0].index, 1);
});

test('signs: empty input places nothing', () => {
    const r = load();
    const slots = r._roadMakeSignSlots(6);
    assert.equal(r._roadPlaceSigns([], 1, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6), 0);
    assert.equal(r._roadPlaceSigns(null, 1, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6), 0);
    assert.equal(r._roadPlaceSigns(SECTIONS, 1, TS, BEHIND, AHEAD, lowerBoundTime, null, 6), 0);
});

test('signs respect the cap', () => {
    const r = load();
    const slots = r._roadMakeSignSlots(6);
    const dense = [];
    for (let i = 0; i < 40; i++) dense.push({ time: i * 0.25, name: 's' + i });
    assert.equal(r._roadPlaceSigns(dense, 5, TS, BEHIND, AHEAD, lowerBoundTime, slots, 6), 6);
    assert.equal(r._roadPlaceSigns(dense, 5, TS, BEHIND, AHEAD, lowerBoundTime, slots, 3), 3);
    assert.equal(slots.length, 6, 'never grows');
});

test('_roadHashStr is deterministic and separates strings', () => {
    const r = load();
    const a = r._roadHashStr('song.sloppak\u00000');
    assert.equal(a, r._roadHashStr('song.sloppak\u00000'));
    assert.ok(Number.isInteger(a) && a >= 0 && a < 2 ** 32);
    const seen = new Set();
    for (const k of ['', 'a', 'b', 'ab', 'ba', 'song.sloppak\u00000', 'song.sloppak\u00001', 'other.sloppak\u00000']) {
        seen.add(r._roadHashStr(k));
    }
    assert.equal(seen.size, 8);
});

test('_roadNoise2 is deterministic, bounded, seeded and continuous', () => {
    const r = load();
    const seed = 12345;
    let differ = 0;
    for (let i = 0; i < 400; i++) {
        const x = i * 0.37 - 50, z = i * 0.91 - 120;
        const v = r._roadNoise2(x, z, seed);
        assert.equal(v, r._roadNoise2(x, z, seed));
        assert.ok(v >= -1 && v <= 1, `in range: ${v}`);
        if (Math.abs(v - r._roadNoise2(x, z, seed + 1)) > 1e-6) differ++;
        // Continuity: a step of 0.001 lattice cells moves the value very little.
        assert.ok(Math.abs(r._roadNoise2(x + 0.001, z, seed) - v) < 0.01);
        assert.ok(Math.abs(r._roadNoise2(x, z + 0.001, seed) - v) < 0.01);
    }
    assert.ok(differ > 350, 'different seeds give a different landscape');
    // Not constant.
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 200; i++) { const v = r._roadNoise2(i * 1.3, i * 0.7, seed); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    assert.ok(hi - lo > 0.8);
});

test('_roadTowerLayout is seeded, respects n and the ranges', () => {
    const r = load();
    const a = r._roadMakeTowerBuf(48), b = r._roadMakeTowerBuf(48), c = r._roadMakeTowerBuf(48);
    assert.equal(r._roadTowerLayout(7, 48, a), 48);
    assert.equal(r._roadTowerLayout(7, 48, b), 48);
    assert.equal(r._roadTowerLayout(8, 48, c), 48);
    assert.deepEqual([...a.x], [...b.x]);
    assert.deepEqual([...a.h], [...b.h]);
    assert.notDeepEqual([...a.h], [...c.h]);
    for (let i = 0; i < 48; i++) {
        assert.ok(a.x[i] >= -1400 && a.x[i] <= 1400, 'x');
        assert.ok(a.w[i] >= 30 && a.w[i] <= 90, 'w');
        assert.ok(a.h[i] >= 60 && a.h[i] <= 360, 'h');
        assert.ok(a.d[i] > 0 && a.d[i] <= a.w[i], 'd');
        assert.ok(a.z[i] >= -60 && a.z[i] <= 0, 'z');
    }
    const small = r._roadMakeTowerBuf(48);
    assert.equal(r._roadTowerLayout(7, 10, small), 10);
    assert.equal(small.h[10], 0, 'only n towers written');
    assert.equal(r._roadTowerLayout(7, 100, r._roadMakeTowerBuf(48)), 48, 'capped at the buffer');
});

test('_roadWindowLayout fits the pool and is seeded', () => {
    const r = load();
    const tb = r._roadMakeTowerBuf(48);
    const nt = r._roadTowerLayout(99, 48, tb);
    const mk = () => ({ x: new Array(800).fill(0), y: new Array(800).fill(0), z: new Array(800).fill(0) });
    const w1 = mk(), w2 = mk();
    const n1 = r._roadWindowLayout(99, tb, nt, w1, 800);
    const n2 = r._roadWindowLayout(99, tb, nt, w2, 800);
    assert.equal(n1, n2);
    assert.ok(n1 > 200 && n1 <= 800, `window count ${n1}`);
    assert.deepEqual(w1.x.slice(0, n1), w2.x.slice(0, n1));
    for (let i = 0; i < n1; i++) assert.ok(w1.y[i] > 0 && w1.y[i] < 360);
});

test('_roadWindowCount: 0 at the start, all at the end, monotonic', () => {
    const r = load();
    assert.equal(r._roadWindowCount(0, 800), 0);
    assert.equal(r._roadWindowCount(1, 800), 800);
    assert.equal(r._roadWindowCount(-1, 800), 0);
    assert.equal(r._roadWindowCount(2, 800), 800);
    assert.equal(r._roadWindowCount(NaN, 800), 0);
    assert.equal(r._roadWindowCount(0.5, 0), 0);
    let prev = 0;
    for (let i = 0; i <= 100; i++) {
        const n = r._roadWindowCount(i / 100, 800);
        assert.ok(n >= prev, `monotonic at ${i}`);
        prev = n;
    }
    assert.ok(r._roadWindowCount(2 / 3, 800) >= 0.8 * 800, 'most are lit by the last third');
});

// --- street lights on two of every three beats (counted from each bar line) ---

function postPattern(r, beats, now, skip = 3) {
    const slots = r._roadMakeSlots(64);
    const n = r._roadPlacePosts(beats, now, TS, BEHIND, AHEAD, lowerBoundTime, slots, 64);
    const keep = new Array(64).fill(null);
    const kept = r._roadPostPattern(beats, now, BEHIND, lowerBoundTime, n, skip, keep);
    // Map each placed slot back to its beat time (z = -(time - now) * TS).
    const out = [];
    for (let i = 0; i < n; i++) out.push({ time: Math.round((now - slots[i].z / TS) * 1000) / 1000, isBar: slots[i].isBar, keep: keep[i] });
    return { n, kept, out };
}

test('_roadPostPattern drops beat 3 of every 4/4 bar and keeps every bar line', () => {
    const r = load();
    const beats = makeBeats(200);
    const { n, kept, out } = postPattern(r, beats, 20.1);
    assert.ok(n > 0);
    assert.equal(kept, out.filter((o) => o.keep).length);
    for (const o of out) {
        const inBar = Math.round(o.time / 0.5) % 4;
        assert.equal(o.keep, inBar !== 2, `beat at ${o.time} (in-bar ${inBar})`);
        if (o.isBar) assert.ok(o.keep, 'bar lines always keep their post');
    }
});

test('_roadPostPattern drops a third in 3/4 and two of six in 6/8', () => {
    const r = load();
    for (const per of [3, 6]) {
        const beats = [];
        for (let i = 0; i < 300; i++) beats.push({ time: i * 0.4, measure: i % per === 0 ? i / per + 1 : -1 });
        const { out } = postPattern(r, beats, 40.05);
        for (const o of out) {
            const inBar = Math.round(o.time / 0.4) % per;
            assert.equal(o.keep, inBar % 3 !== 2, `${per} beats/bar, beat at ${o.time}`);
        }
        const keptShare = out.filter((o) => o.keep).length / out.length;
        assert.ok(Math.abs(keptShare - 2 / 3) < 0.1, `${per}/bar keeps about two thirds (${keptShare})`);
    }
});

test('_roadPostPattern: a beat keeps its verdict while the window scrolls', () => {
    const r = load();
    const beats = makeBeats(400);
    const verdict = new Map();
    for (let f = 0; f < 600; f++) {
        const { out } = postPattern(r, beats, 30 + f / 60);
        for (const o of out) {
            if (verdict.has(o.time)) assert.equal(verdict.get(o.time), o.keep, `beat ${o.time} flipped at frame ${f}`);
            else verdict.set(o.time, o.keep);
        }
    }
});

test('_roadPostPattern: no bar lines falls back to the beat index; skip <= 1 keeps all', () => {
    const r = load();
    const beats = [];
    for (let i = 0; i < 100; i++) beats.push({ time: i * 0.5, measure: -1 });
    const { out } = postPattern(r, beats, 10.2);
    for (const o of out) assert.equal(o.keep, Math.round(o.time / 0.5) % 3 !== 2, `beat at ${o.time}`);
    const all = postPattern(r, makeBeats(100), 10.2, 1);
    assert.equal(all.kept, all.n);
    assert.equal(r._roadPostPattern(null, 0, BEHIND, lowerBoundTime, 5, 3, []), 0);
    assert.equal(r._roadPostPattern(makeBeats(10), 0, BEHIND, lowerBoundTime, 0, 3, []), 0);
});

// --- step 3: playing mood and quality level ---------------------------------

// Run the mood for `secs` at `fps`; notes(t0, t1) -> { hits, misses, mult }
// for the notes judged in (t0, t1]. Events are per note, not per frame.
function runMood(r, m, secs, notes, fps = 60) {
    const dt = 1 / fps;
    const n = Math.round(secs * fps);
    for (let f = 0; f < n; f++) {
        const p = notes ? notes(f * dt, (f + 1) * dt) : {};
        r._roadMoodStep(m, dt, p.hits || 0, p.misses || 0, p.mult || 1);
    }
    return m;
}
// How many ticks of a `rate` per second fall in (t0, t1].
function ticks(t0, t1, rate) {
    return Math.floor(t1 * rate + 1e-9) - Math.floor(t0 * rate + 1e-9);
}
const hitsAt = (rate, mult = 1) => (t0, t1) => ({ hits: ticks(t0, t1, rate), mult });
const missesAt = (rate) => (t0, t1) => ({ misses: ticks(t0, t1, rate) });

test('_roadMoodStep: free play (no verdicts) stays a calm clear night', () => {
    const r = load();
    const m = runMood(r, r._roadMakeMood(), 120);
    assert.equal(m.heat, 0);
    assert.equal(m.gloom, 0);
});

test('_roadMoodStep: a run of hits warms up, a high multiplier warms faster', () => {
    const r = load();
    const run = runMood(r, r._roadMakeMood(), 8, hitsAt(4));
    assert.ok(run.heat > 0.2 && run.heat < 0.45, `8 s of clean play is warm, not hot (${run.heat})`);
    const long = runMood(r, r._roadMakeMood(), 30, hitsAt(4));
    assert.ok(long.heat > 0.9, `30 s of clean play is hot (${long.heat})`);
    const x4 = runMood(r, r._roadMakeMood(), 8, hitsAt(4, 4));
    assert.ok(x4.heat > 0.95, `a 4x multiplier is hot within seconds (${x4.heat})`);
    assert.equal(x4.gloom, 0);
});

test('_roadMoodStep: each miss cuts the heat; a few misses in a row bring the weather', () => {
    const r = load();
    const m = runMood(r, r._roadMakeMood(), 10, hitsAt(4, 4));
    const hot = m.heat;
    r._roadMoodStep(m, 1 / 60, 0, 1, 1);
    assert.ok(m.heat < hot * 0.7, `one miss knocks the heat down at once (${hot} -> ${m.heat})`);
    assert.equal(m.run, 0);
    assert.ok(Math.abs(m.gloom - 0.13) < 1e-3, `one miss is one dose of gloom (${m.gloom})`);
    // Four more misses, one every 0.25 s: five in a row is rain (gloom >= 0.55).
    runMood(r, m, 1, missesAt(4));
    assert.ok(m.gloom >= 0.55 && m.gloom < 0.7, `five misses in a row bring rain (${m.gloom})`);
    assert.ok(m.heat < 0.15, `and leave no heat (${m.heat})`);
    // Three misses: fog (from gloom 0.25), no rain.
    const three = r._roadMakeMood();
    runMood(r, three, 0.75, missesAt(4));
    assert.ok(three.gloom > 0.3 && three.gloom < 0.55, `three misses: fog, no rain (${three.gloom})`);
});

test('_roadMoodStep: hits clear the gloom; it also drains slowly on its own', () => {
    const r = load();
    const m = r._roadMakeMood();
    runMood(r, m, 2, missesAt(4));           // eight misses: deep gloom
    assert.ok(m.gloom > 0.9, `eight misses is deep gloom (${m.gloom})`);
    runMood(r, m, 3.5, hitsAt(4));           // fourteen hits
    assert.ok(m.gloom < 0.1, `a few seconds of hits clear it (${m.gloom})`);
    const g = r._roadMakeMood();
    r._roadMoodStep(g, 1 / 60, 0, 3, 1);
    const before = g.gloom;
    runMood(r, g, 5);
    assert.ok(g.gloom < before && g.gloom > 0, 'gloom drains slowly on its own');
});

test('_roadMoodStep: the same playing gives the same mood at 30, 60 and 240 fps', () => {
    // Four notes a second, one in eight missed: the result must not depend
    // on how many frames the screen draws.
    const r = load();
    const notes = (t0, t1) => {
        const all = ticks(t0, t1, 4), miss = ticks(t0, t1, 0.5);
        return { hits: all - miss, misses: miss, mult: 2 };
    };
    const at = (fps) => runMood(r, r._roadMakeMood(), 12, notes, fps);
    const a = at(30), b = at(60), c = at(240);
    for (const [x, y] of [[a, b], [b, c]]) {
        assert.ok(Math.abs(x.heat - y.heat) < 0.03, `heat ${x.heat} vs ${y.heat}`);
        assert.ok(Math.abs(x.gloom - y.gloom) < 0.03, `gloom ${x.gloom} vs ${y.gloom}`);
    }
});

test('_roadMoodStep: paused (dt 0), notes still count but the clocks stand still', () => {
    const r = load();
    const m = runMood(r, r._roadMakeMood(), 10, hitsAt(4));
    const heat = m.heat, quiet = m.quiet, run = m.run;
    for (let i = 0; i < 600; i++) r._roadMoodStep(m, 0, 0, 0, 1);   // ten seconds paused
    assert.equal(m.heat, heat, 'heat holds while paused');
    assert.equal(m.quiet, quiet, 'not "idle" just because the song is paused');
    assert.equal(m.run, run);
    r._roadMoodStep(m, 0, 0, 1, 1);           // a verdict landing right after the pause
    assert.ok(m.gloom > 0.1, 'a miss judged while paused still counts');
    assert.equal(m.run, 0);
});

test('_roadMoodStep: after ROAD_MOOD_IDLE s without verdicts the heat settles', () => {
    const r = load();
    const m = runMood(r, r._roadMakeMood(), 30, hitsAt(4));
    assert.ok(m.heat > 0.9);
    runMood(r, m, r.ROAD_MOOD_IDLE - 0.5);
    assert.ok(m.heat > 0.9, 'a short gap between notes keeps the heat');
    runMood(r, m, 5);
    assert.ok(m.heat < 0.05, `stopping playing cools it (${m.heat})`);
    assert.equal(m.run, 0);
});

test('_roadMoodStep: bad dt and counts are safe, big steps are clamped, values stay in 0..1', () => {
    const r = load();
    const m = r._roadMakeMood();
    for (const dt of [0, -1, NaN, undefined]) r._roadMoodStep(m, dt, 0, 0, 1);
    assert.deepEqual({ ...m }, { ...r._roadMakeMood() });
    for (const bad of [-3, NaN, undefined, null, 'x']) r._roadMoodStep(m, 1 / 60, bad, bad, 1);
    assert.equal(m.gloom, 0);
    assert.ok(Number.isFinite(m.heat) && Number.isFinite(m.run) && Number.isFinite(m.quiet));
    r._roadMoodStep(m, 5, 0, 1e6, 1);
    assert.equal(m.gloom, 1, 'a flood of misses saturates, no overflow');
    for (let i = 0; i < 100; i++) r._roadMoodStep(m, 5, 1e6, 0, 99);
    assert.ok(m.heat <= 1 && m.heat > 0.9);
    assert.equal(m.gloom, 0);
    r._roadResetMood(m);
    assert.deepEqual({ ...m }, { ...r._roadMakeMood() });
});

test('_roadSmooth: 0 below, 1 above, monotonic between', () => {
    const r = load();
    assert.equal(r._roadSmooth(0.25, 0.75, 0), 0);
    assert.equal(r._roadSmooth(0.25, 0.75, 1), 1);
    assert.equal(r._roadSmooth(0.25, 0.75, 0.5), 0.5);
    let prev = -1;
    for (let x = 0; x <= 1.0001; x += 0.01) {
        const v = r._roadSmooth(0.25, 0.75, x);
        assert.ok(v >= prev);
        prev = v;
    }
});

// Feed the Auto watcher `secs` of frames. fps is a number or fps(q) -> number
// (so Full and Lite can run at different rates). Returns the events in order,
// each { ev, why, t } with t = seconds since this call started. opts.until
// stops right after that event, so the next phase starts with no leftover time.
function runQ(r, q, secs, fps, opts = {}) {
    const playing = opts.playing !== false;
    const minFps = opts.minFps || 50;
    const away = !!opts.away;
    const wake = opts.wake | 0;
    const out = [];
    let t = 0;
    while (t < secs - 1e-9) {
        const f = typeof fps === 'function' ? fps(q) : fps;
        const dt = 1 / f;
        t += dt;
        const ev = r._roadQualityStep(q, dt, playing, minFps, away, wake);
        if (ev) {
            out.push({ ev, why: q.why, t });
            if (ev === opts.until) break;
        }
    }
    return out;
}
const evs = (list) => list.map((e) => e.ev).join(',');
// Full at `full` fps, Lite (and the switch frames) at `lite` fps.
const byPhase = (full, lite) => (q) => (q.lite ? lite : full);

test('_roadAutoMinFps: 50 without a cap, 85% of a cap under 59', () => {
    const r = load();
    for (const v of [0, undefined, NaN, -5, null]) assert.equal(r._roadAutoMinFps(v), 50);
    assert.equal(r._roadAutoMinFps(30), 25.5);
    assert.equal(r._roadAutoMinFps(60), 50);
    assert.equal(r._roadAutoMinFps(120), 50);
});

test('_roadAutoCooldown: 15, 30, 60, 120, 240 s of Lite play, capped', () => {
    const r = load();
    assert.deepEqual([0, 1, 2, 3, 4].map(r._roadAutoCooldown), [15, 30, 60, 120, 240]);
    assert.equal(r._roadAutoCooldown(9), 240);
    assert.equal(r._roadAutoCooldown(-1), 15);
    assert.equal(r._roadAutoCooldown(undefined), 15);
});

test('_roadQualityStep: Auto drops to Lite once frames stay under 50 fps', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    assert.equal(q.lite, false);
    assert.equal(evs(runQ(r, q, 6.5, 40)), '', 'not before warm-up + hold');
    assert.equal(evs(runQ(r, q, 2, 40)), 'drop', 'drops exactly once');
    assert.equal(q.lite, true);
    assert.equal(q.phase, 'lite');
});

test('_roadQualityStep: a machine steadily under 10 fps drops too', () => {
    const r = load();
    for (const fps of [8, 4]) {
        const q = r._roadMakeQuality('auto');
        assert.equal(evs(runQ(r, q, 12, fps)), 'drop', `${fps} fps drops`);
        assert.equal(q.lite, true);
    }
});

test('_roadQualityStep: steady 60 fps, short dips, pauses and stalls keep Full', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, q, 20, 60)), '');
    for (let i = 0; i < 5; i++) {
        runQ(r, q, 2, 40);                      // two-second dips
        runQ(r, q, 3, 60);
    }
    assert.equal(q.lite, false, 'dips shorter than the hold do not switch');
    assert.equal(evs(runQ(r, q, 60, 10, { playing: false })), '', 'the host draws paused at 10 fps on purpose');
    for (let i = 0; i < 100; i++) {
        assert.equal(r._roadQualityStep(q, 0.8, true, 50, false, 0), '');   // tab switches, loads
        runQ(r, q, 0.5, 60);
    }
    assert.equal(q.lite, false, 'stalls over half a second are skipped');
});

test('_roadQualityStep: after a drop, Full is tried again after 15 s of Lite play', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, q, 8, 40, { until: 'drop' })), 'drop');
    assert.equal(q.lite, true);
    assert.equal(evs(runQ(r, q, 14.9, 60)), '', 'not before the cooldown');
    const e = runQ(r, q, 0.2, 60);
    assert.equal(evs(e), 'probe');
    assert.equal(e[0].why, 'retry');
    assert.equal(q.lite, false, 'the probe renders Full');
    assert.equal(q.phase, 'probe');
});

test('_roadQualityStep: a probe that holds stays on Full; one that does not goes back to Lite', () => {
    const r = load();
    // Full can do 60 now (the slow spell is over).
    const ok = r._roadMakeQuality('auto');
    runQ(r, ok, 8, 40, { until: 'drop' });
    assert.equal(evs(runQ(r, ok, 15.1, 60, { until: 'probe' })), 'probe');
    assert.equal(ok.phase, 'probe');
    const pass = runQ(r, ok, 6, 60);
    assert.equal(evs(pass), 'pass');
    assert.ok(pass[0].t > 4.9 && pass[0].t < 5.2, `passes after warm-up + 4 s (${pass[0].t})`);
    assert.equal(ok.lite, false);
    assert.equal(ok.phase, 'full');
    assert.equal(evs(runQ(r, ok, 120, 60)), '', 'and stays');
    // Full still only does 45.
    const bad = r._roadMakeQuality('auto');
    runQ(r, bad, 8, 45, { until: 'drop' });
    assert.equal(bad.lite, true);
    assert.equal(evs(runQ(r, bad, 15.1, 60, { until: 'probe' })), 'probe');
    const fail = runQ(r, bad, 4, 45, { until: 'fail' });
    assert.equal(evs(fail), 'fail');
    assert.ok(fail[0].t < 3, `fails within 3 s (${fail[0].t})`);
    assert.equal(bad.lite, true);
    assert.equal(bad.level, 1);
    assert.equal(evs(runQ(r, bad, 29.9, 60)), '', 'the next try waits 30 s');
    assert.equal(evs(runQ(r, bad, 0.2, 60)), 'probe');
});

test('_roadQualityStep: a weak machine backs off and never flaps', () => {
    const r = load();
    // Full 35 fps, Lite 60 fps, for 15 minutes of play.
    const q = r._roadMakeQuality('auto');
    const e = runQ(r, q, 900, byPhase(35, 60));
    const probes = e.filter((x) => x.ev === 'probe').map((x) => x.t);
    assert.equal(e[0].ev, 'drop');
    assert.equal(e.filter((x) => x.ev === 'pass').length, 0, 'Full never sticks');
    assert.ok(probes.length >= 5 && probes.length <= 7, `${probes.length} probes in 15 min`);
    const gaps = [];
    for (let i = 1; i < probes.length; i++) gaps.push(probes[i] - probes[i - 1]);
    for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] >= gaps[i - 1] - 0.5, `gaps grow: ${gaps.map(Math.round)}`);
    assert.ok(gaps[gaps.length - 1] > 235, 'the back-off reaches 240 s');
    // Borderline: 52 fps in Full is fine, no events at all.
    const b = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, b, 600, 52)), '');
    // Full 48 / Lite 60: every probe fails, with growing gaps.
    const c = r._roadMakeQuality('auto');
    const ce = runQ(r, c, 900, byPhase(48, 60));
    assert.equal(ce.filter((x) => x.ev === 'pass').length, 0);
    assert.ok(ce.length <= 16, `bounded: ${ce.length} events`);
});

test('_roadQualityStep: good Full lowers the back-off; a quick re-drop raises it', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    const step = (secs, fps, until) => evs(runQ(r, q, secs, fps, { until }));
    assert.equal(step(8, 40, 'drop'), 'drop'); // first drop of a scene: level stays 0
    assert.equal(q.level, 0);
    assert.equal(step(15.1, 60, 'probe'), 'probe');
    assert.equal(step(3, 45, 'fail'), 'fail');  // -> level 1
    assert.equal(q.level, 1);
    assert.equal(step(30.1, 60, 'probe'), 'probe');
    assert.equal(step(6, 60, 'pass'), 'pass');
    assert.equal(q.phase, 'full');
    assert.equal(q.level, 1);
    assert.equal(step(70, 60), '');            // 60 s of good Full -> level 0
    assert.equal(q.level, 0);
    // A drop within 60 s of a pass raises it.
    assert.equal(step(8, 40, 'drop'), 'drop');
    assert.equal(step(15.1, 60, 'probe'), 'probe');
    assert.equal(step(6, 60, 'pass'), 'pass');
    const before = q.level;
    assert.equal(step(8, 40, 'drop'), 'drop'); // drop again, soon after the pass
    assert.equal(q.lite, true);
    assert.equal(q.level, before + 1);
});

test('_roadQualityStep: back in front tries Full at once, even paused', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 20, 60, { wake: 0 });
    runQ(r, q, 8, 30, { away: true, wake: 0 });    // another app hogs the GPU while we're in the background
    assert.equal(q.lite, true);
    assert.match(String(q.why), /drop/);
    // Back in front: the wake counter moved. The very next step probes,
    // even though the song is paused and it's long before the cooldown.
    assert.equal(r._roadQualityStep(q, 0.1, false, 50, false, 1), 'probe');
    assert.equal(q.why, 'wake');
    assert.equal(q.lite, false);
    // Paused for a minute: nothing is judged, nothing fails.
    assert.equal(evs(runQ(r, q, 60, 10, { playing: false, wake: 1 })), '');
    assert.equal(q.warm, 0);
    // Play again at 60: Full holds.
    assert.equal(evs(runQ(r, q, 6, 60, { wake: 1 })), 'pass');
});

test('_roadQualityStep: a long gap between frames (window was hidden) is a wake too', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 40);
    assert.equal(q.lite, true);
    assert.equal(r._roadQualityStep(q, 0.8, true, 50, false, 0), '', 'a short stall is not');
    assert.equal(r._roadQualityStep(q, 3, true, 50, false, 0), 'probe');
    assert.equal(q.why, 'wake');
});

test('_roadQualityStep: the first wake value is adopted, not taken as a return', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 40, { wake: 7 });
    assert.equal(q.lite, true);
    assert.equal(evs(runQ(r, q, 5, 60, { wake: 7 })), '');
});

test('_roadQualityStep: wake probes stop after two failures in front; a pass resets them', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 40, { wake: 0 });
    let wake = 0;
    for (let i = 0; i < r.ROAD_AUTO_WAKE_FAILS; i++) {
        wake++;
        assert.equal(r._roadQualityStep(q, 1 / 60, true, 50, false, wake), 'probe');
        assert.equal(evs(runQ(r, q, 3, 40, { wake })), 'fail');
    }
    assert.equal(q.presentFails, 2);
    wake++;
    assert.equal(r._roadQualityStep(q, 1 / 60, true, 50, false, wake), '', 'no more wake probes');
    // A failure while away doesn't count against waking.
    const a = r._roadMakeQuality('auto');
    runQ(r, a, 8, 40);
    a.wait = 1e6;                               // force the scheduled retry
    assert.equal(r._roadQualityStep(a, 1 / 60, true, 50, true, 0), 'probe');
    assert.equal(evs(runQ(r, a, 3, 40, { away: true })), 'fail');
    assert.equal(a.presentFails, 0);
    // A pass resets both counters.
    q.wait = 1e6;
    assert.equal(r._roadQualityStep(q, 1 / 60, true, 50, false, wake), 'probe');
    assert.equal(evs(runQ(r, q, 6, 60, { wake })), 'pass');
    assert.equal(q.presentFails, 0);
    assert.equal(q.betterFails, 0);
});

test('_roadQualityStep: Lite getting clearly faster tries Full (a hog went away)', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 25);                          // hog: Full 25
    assert.equal(q.lite, true);
    assert.equal(evs(runQ(r, q, 5, 40)), '', 'steady Lite: nothing');
    const e = runQ(r, q, 3, 60);                // hog gone: Lite jumps to 60
    assert.equal(evs(e), 'probe');
    assert.equal(e[0].why, 'better');
    // Two failed 'better' probes, then no more.
    const b = r._roadMakeQuality('auto');
    runQ(r, b, 8, 25);
    for (let i = 0; i < 2; i++) {
        runQ(r, b, 2.5, 40);                    // sample Lite's reference at 40
        const p = runQ(r, b, 3, 60);
        assert.equal(evs(p), 'probe');
        assert.equal(evs(runQ(r, b, 3, 40)), 'fail');
    }
    assert.equal(b.betterFails, 2);
    runQ(r, b, 2.5, 40);
    assert.equal(evs(runQ(r, b, 3, 60)), '', 'no third better probe (the scheduled retry still comes)');
});

test('_roadQualityStep: judged against a frame-rate cap', () => {
    const r = load();
    const min30 = r._roadAutoMinFps(30);
    const q = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, q, 120, 30, { minFps: min30 })), '', 'a 30 cap alone never drops');
    const s = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, s, 10, 22, { minFps: min30, until: 'drop' })), 'drop', 'under the cap it does');
    assert.equal(evs(runQ(r, s, 15.1, 30, { minFps: min30, until: 'probe' })), 'probe');
    assert.equal(s.phase, 'probe');
    assert.equal(evs(runQ(r, s, 6, 30, { minFps: min30 })), 'pass', 'a probe at the cap passes');
});

test('_roadQualityStep: paused Lite never retries; stalls inside a probe never fail it', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 40, { until: 'drop' });
    assert.equal(evs(runQ(r, q, 600, 10, { playing: false })), '');
    assert.equal(q.wait, 0);
    q.wait = 1e6;
    assert.equal(r._roadQualityStep(q, 1 / 60, true, 50, false, 0), 'probe');
    for (let i = 0; i < 30; i++) assert.equal(r._roadQualityStep(q, 0.9, true, 50, false, 0), '');
    assert.equal(q.phase, 'probe');
});

test('_roadQualityStep: Full and Lite are fixed; unknown modes mean Auto', () => {
    const r = load();
    const full = r._roadMakeQuality('full');
    assert.equal(evs(runQ(r, full, 30, 20)), '');
    assert.equal(full.lite, false);
    const lite = r._roadMakeQuality('lite');
    assert.equal(lite.lite, true);
    assert.equal(evs(runQ(r, lite, 600, 60)), '', 'fixed Lite never probes');
    assert.equal(r._roadQualityStep(lite, 3, true, 50, false, 5), '', 'not even on a wake');
    assert.equal(lite.lite, true);
    assert.equal(r._roadMakeQuality('bogus').mode, 'auto');
    assert.equal(r._roadMakeQuality(undefined).mode, 'auto');
});

test('road wiring: Auto leaves Lite by restoring the neon and the joints, and hears the window', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const leave = src.slice(src.indexOf('    function _bgRoadLeaveLite('), src.indexOf('    function _bgRoadLogQuality('));
    assert.match(leave, /s\.neon\.count = s\.nNeon \| 0;/, 'neon only comes back if restored by hand');
    assert.match(leave, /s\.jointPhase = -1;/, 'the joints skip an unchanged phase');
    assert.match(src, /s\.neon\.count = nn;\n\s*s\.nNeon = nn;/, 'the layout remembers the neon count');
    // The call site reads lite AFTER the step, so a switch lands the same frame.
    assert.match(src, /const qev = _roadQualityStep\([\s\S]{0,200}?\);\n\s*if \(qev === 'drop' \|\| qev === 'fail'\) _bgRoadEnterLite\(s, qev, minFps\);\n\s*else if \(qev === 'probe'\) _bgRoadLeaveLite\(s, minFps\);[\s\S]{0,120}?const lite = s\.quality\.lite;/);
    // The cap and the window state ride the per-frame handoff, ahead of the pinned mood block.
    const cap = src.indexOf('_bgChart.maxFps = bundle.maxFps > 0 ? bundle.maxFps : 0;');
    const hits = src.indexOf('_bgChart.hits = _bgHits;');
    assert.ok(cap > 0 && cap < hits);
    assert.match(src, /_bgChart\.away = _h3dAway;\n\s*_bgChart\.wake = _h3dWakeGen;/);
    assert.match(src, /document\.addEventListener\('visibilitychange', _h3dSyncFront\);/);
    assert.match(src, /window\.addEventListener\('focus', _h3dSyncFront\);/);
});

// --- renderer wiring: verdicts must reach the road's mood ------------------

test('drawNote counts the road mood before the linger / body gates, once per note', () => {
    // A scorer's verdict lands ~0.4 s after the strike, when most gems are
    // past their 0.1 s linger and skip the body block. The first version
    // wrote the mood inside that block, so it almost never fired and the
    // weather never moved in a real song. Pin the count to the verdict
    // resolution, ahead of every gate that depends on _overLinger.
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const fn = src.indexOf('        function drawNote(');
    assert.ok(fn > 0, 'drawNote not found');
    const end = src.indexOf('\n        function ', fn + 10);
    const body = src.slice(fn, end);
    const write = body.indexOf("if (bgMountedStyleId === 'road' && (_ndState === 'miss' || _ndGood)) {");
    assert.ok(write > 0, 'mood count missing from drawNote');
    const block = body.slice(write, write + 900);
    // One key per note (per chord for chord notes), one count per verdict kind:
    // a missed sustain the latch re-reports every frame is still one miss.
    assert.match(block, /const _bgK = Math\.round\(n\.t \* 1e4\) \* 16 \+ \(fromChord \? 15 : \(n\.s & 15\)\);/);
    assert.match(block, /if \(!\(_bgV & _bgBit\)\) \{\n\s*_bgVerdictSeen\.set\(_bgK, _bgV \| _bgBit\);/);
    assert.equal(src.split('_bgMisses++').length, 2, 'one miss count only');
    assert.equal(src.split('_bgHits++').length, 2, 'one hit count only');
    const latch = body.indexOf('if (now >= susEnd) _susVerdictLatch.delete(_sk);');
    assert.ok(latch > 0 && latch < write, 'count comes after the sustain latch has resolved the verdict');
    const gate = body.indexOf('if (!effSkipBody && !arpGhostOnlyMode && !_overLinger) {');
    assert.ok(gate > write, 'count comes before the linger-gated body block');
    // Nothing between the verdict probe and the count may return early.
    const probe = body.indexOf('if (_ndGetNoteState) {');
    assert.ok(probe > 0 && probe < write);
    assert.equal(/\breturn\b/.test(body.slice(probe, write)), false, 'no early return between probe and count');
    // The chart object hands the counts to the style each frame, then zeroes them.
    assert.match(src, /_bgChart\.hits = _bgHits;\n\s*_bgChart\.misses = _bgMisses;\n\s*_bgChart\.mult = _bgMult;\n\s*_bgChart\.playing = [^\n]*\n\s*_bgHits = 0;\n\s*_bgMisses = 0;\n\s*try \{ style\.update\(/);
    // A backward seek forgets the counted notes so replayed notes count again.
    assert.match(src, /if \(_bgBack\) \{\n\s*_bgVerdictSeen\.clear\(\);\n\s*_bgMult = 1;/);
    // Rain falls by wall clock, so the road asks for full-rate frames while it rains.
    assert.match(src, /needsContinuousFrames\(\) \{[\s\S]{0,600}?bgMountedStyleId === 'road' && bgState && bgState\.rain && bgState\.rain\.count > 0\) return true;/);
});

// --- city lights follow the playing ------------------------------------------

test('_roadCityLit: calm play is the progress curve; heat lights the city, gloom darkens it', () => {
    const r = load();
    for (const p of [0, 0.1, 0.4, 0.8, 1]) {
        assert.equal(r._roadCityLit(p, 0, 0), r._roadWindowFrac(p), `calm at ${p}`);
        assert.equal(Math.floor(800 * r._roadCityLit(p, 0, 0) + 1e-9), r._roadWindowCount(p, 800),
            'calm count matches the old progress-only count');
        assert.equal(r._roadCityLit(p, 1, 0), 1, `full heat lights every window at ${p}`);
        assert.equal(r._roadCityLit(p, 1, 1), 0, `deep gloom switches the city off at ${p}`);
        assert.equal(r._roadCityLit(p, 0, 1), 0);
    }
    // A little gloom (the fog's first stage) leaves the lights alone.
    assert.equal(r._roadCityLit(0.5, 0, 0.25), r._roadWindowFrac(0.5));
    assert.equal(r._roadCityDark(0.2), 0);
    assert.equal(r._roadCityDark(0.9), 1);
});

test('_roadCityLit: monotonic in heat (up) and gloom (down), bad inputs are safe', () => {
    const r = load();
    let prev = -1;
    for (let h = 0; h <= 1.0001; h += 0.05) {
        const v = r._roadCityLit(0.3, h, 0);
        assert.ok(v >= prev, `heat ${h}`);
        prev = v;
    }
    prev = 2;
    for (let g = 0; g <= 1.0001; g += 0.05) {
        const v = r._roadCityLit(0.6, 0.5, g);
        assert.ok(v <= prev, `gloom ${g}`);
        prev = v;
    }
    for (const bad of [NaN, undefined, null, -5, 7]) {
        const v = r._roadCityLit(bad, bad, bad);
        assert.ok(v >= 0 && v <= 1, `bad input ${bad} -> ${v}`);
    }
});
