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
        '\nthis._roadWindowCount = _roadWindowCount;', sandbox);
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
