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
const { pathToFileURL } = require('node:url');

const SCREEN_JS = path.join(__dirname, '..', 'screen.js');
const THREE_JS = path.join(__dirname, '..', '..', '..', 'static', 'vendor', 'three', 'three.module.min.js');
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
        '\nthis._roadCityDark = _roadCityDark;' +
        '\nthis.ROAD_FW_RISE = ROAD_FW_RISE;' +
        '\nthis.ROAD_FW_KIND_SPARKLE = ROAD_FW_KIND_SPARKLE;' +
        '\nthis._fwShellFor = _fwShellFor;' +
        '\nthis._fwMakeBuf = _fwMakeBuf;' +
        '\nthis._fwLaunch = _fwLaunch;' +
        '\nthis._fwStep = _fwStep;' +
        '\nthis._fwShouldStep = _fwShouldStep;' +
        '\nthis._fwClear = _fwClear;' +
        '\nthis._fwPathY = _fwPathY;' +
        '\nthis.ROAD_FW_POOL = ROAD_FW_POOL;' +
        '\nthis.ROAD_FW_ROCKETS = ROAD_FW_ROCKETS;' +
        '\nthis.ROAD_FIN_FIRST = ROAD_FIN_FIRST;' +
        '\nthis.ROAD_FIN_SPREAD = ROAD_FIN_SPREAD;' +
        '\nthis.ROAD_FIN_BIG_AT = ROAD_FIN_BIG_AT;' +
        '\nthis._roadLastNoteT = _roadLastNoteT;' +
        '\nthis._roadFinaleCount = _roadFinaleCount;' +
        '\nthis._roadFinaleAt = _roadFinaleAt;' +
        '\nthis._roadFinaleDue = _roadFinaleDue;' +
        '\nthis._roadFinaleEnd = _roadFinaleEnd;' +
        '\nthis._fwFinaleShell = _fwFinaleShell;' +
        '\nthis.ROAD_BRIDGE_MIN_S = ROAD_BRIDGE_MIN_S;' +
        '\nthis.ROAD_BRIDGE_POOL = ROAD_BRIDGE_POOL;' +
        '\nthis._roadIsBridgeName = _roadIsBridgeName;' +
        '\nthis._roadBridgeSpans = _roadBridgeSpans;' +
        '\nthis._roadMakeBridgeSlots = _roadMakeBridgeSlots;' +
        '\nthis._roadPlaceBridges = _roadPlaceBridges;' +
        '\nthis._roadBridgeMask = _roadBridgeMask;' +
        '\nthis.ROAD_BRIDGE_TOWER_OFF_S = ROAD_BRIDGE_TOWER_OFF_S;' +
        '\nthis.ROAD_BRIDGE_CABLES = ROAD_BRIDGE_CABLES;' +
        '\nthis.ROAD_BRIDGE_BACKSTAYS = ROAD_BRIDGE_BACKSTAYS;' +
        '\nthis.ROAD_BRIDGE_CABLE_DT = ROAD_BRIDGE_CABLE_DT;' +
        '\nthis._roadBridgeTowerT = _roadBridgeTowerT;' +
        '\nthis._roadCableDt = _roadCableDt;' +
        '\nthis._roadCableAnchorT = _roadCableAnchorT;' +
        '\nthis.ROAD_REFL_POOL = ROAD_REFL_POOL;' +
        '\nthis._roadMakeReflBuf = _roadMakeReflBuf;' +
        '\nthis._roadReflectLayout = _roadReflectLayout;', sandbox);
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

test('_roadQualityStep: wake probes stop after two failures in front; a minute of good Full resets them', () => {
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
    // A pass alone doesn't clear them (it may give out at once); a minute
    // of good Full does.
    q.wait = 1e6;
    assert.equal(r._roadQualityStep(q, 1 / 60, true, 50, false, wake), 'probe');
    assert.equal(evs(runQ(r, q, 6, 60, { wake, until: 'pass' })), 'pass');
    assert.equal(q.presentFails, 2);
    assert.equal(evs(runQ(r, q, 61, 60, { wake })), '');
    assert.equal(q.presentFails, 0);
    assert.equal(q.betterFails, 0);
});

test('_roadQualityStep: a 50 Hz display climbs back to Full (the bars fit what Lite reaches)', () => {
    const r = load();
    const q = r._roadMakeQuality('auto');
    assert.equal(evs(runQ(r, q, 30, 50)), '', 'Full holds at 50 Hz');
    assert.equal(evs(runQ(r, q, 12, 30, { until: 'drop' })), 'drop', 'a slow spell drops it');
    // Lite is capped by the display too: 50.
    const e = runQ(r, q, 120, 50);
    assert.equal(evs(e), 'probe,pass', 'the next try holds at 50');
    assert.ok(q.ceil > 49 && q.ceil < 51, `display limit ${q.ceil}`);
    assert.equal(evs(runQ(r, q, 300, 50)), '', 'and Full stays');
    // At 60 Hz the bars are the usual 50 / 55: a 52 fps Full still fails a probe.
    const w = r._roadMakeQuality('auto');
    runQ(r, w, 8, 40, { until: 'drop' });
    runQ(r, w, 15.1, 60, { until: 'probe' });
    assert.equal(evs(runQ(r, w, 5, 52, { until: 'fail' })), 'fail');
});

test('_roadQualityStep: a slow spell that comes and goes cannot make Auto flap', () => {
    const r = load();
    // A hog 20 s on / 25 s off: Full 40 / 60, Lite 45 / 60, for 15 minutes.
    const q = r._roadMakeQuality('auto');
    let t = 0;
    const out = [];
    while (t < 900) {
        const hog = (t % 45) < 20;
        const fps = q.lite ? (hog ? 45 : 60) : (hog ? 40 : 60);
        const dt = 1 / fps;
        t += dt;
        const ev = r._roadQualityStep(q, dt, true, 50, false, 0);
        if (ev) out.push(ev);
    }
    const drops = out.filter((x) => x === 'drop').length;
    assert.ok(drops <= 8, `${drops} drops in 15 min (${out.join(',')})`);
    // Lighter and heavier passages in the song (30 s each): Full 60 / 35, Lite 60 / 45.
    const c = r._roadMakeQuality('auto');
    t = 0;
    const out2 = [];
    while (t < 900) {
        const heavy = Math.floor(t / 30) % 2 === 1;
        const fps = c.lite ? (heavy ? 45 : 60) : (heavy ? 35 : 60);
        t += 1 / fps;
        const ev = r._roadQualityStep(c, 1 / fps, true, 50, false, 0);
        if (ev) out2.push(ev);
    }
    const drops2 = out2.filter((x) => x === 'drop').length;
    assert.ok(drops2 <= 8, `${drops2} drops in 15 min (${out2.join(',')})`);
});

test('_roadQualityStep: brief returns to the window stop waking Full on a weak machine', () => {
    const r = load();
    // Full 40, Lite 60. The player pops in for 2 s, then away for 8 s, for 10 minutes.
    const q = r._roadMakeQuality('auto');
    runQ(r, q, 8, 40, { until: 'drop' });
    let wake = 0, t = 0, probes = 0;
    while (t < 600) {
        const front = (t % 10) < 2;
        if (front && (t % 10) < 1 / 60 + 1e-9) wake++;
        const fps = q.lite ? 60 : 40;
        t += 1 / fps;
        const ev = r._roadQualityStep(q, 1 / fps, true, 50, !front, wake);
        if (ev === 'probe' && q.why === 'wake') probes++;
    }
    assert.ok(probes <= 4, `${probes} wake probes`);
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

// --- fireworks (streak rockets) ---------------------------------------------

// One rocket from beside the road to a burst at y = 400, unit scale.
function launch(r, b, streak, mult, lite, seed = 7) {
    return r._fwLaunch(b, 200, 0, -400, 300, 400, -1200, 1, r._fwShellFor(streak, mult, lite),
        1, 0.2, 0.6, 0.1, 0.9, 1, seed);
}
function fwRun(r, b, secs, fps, floorY = 100) {
    let bursts = 0;
    const dt = 1 / fps;
    for (let t = 0; t < secs - 1e-9; t += dt) bursts += r._fwStep(b, dt, floorY);
    return bursts;
}
function liveCount(b) {
    let n = 0;
    for (let i = 0; i < b.n; i++) if (b.kind[i] !== 0) n++;
    return n;
}

test('_fwShellFor: milestones grow the shell; Lite trims it; bad input is safe', () => {
    const r = load();
    const s25 = r._fwShellFor(25, 3, false), s50 = r._fwShellFor(50, 4, false);
    const s100 = r._fwShellFor(100, 4, false), s200 = r._fwShellFor(200, 4, false);
    assert.deepEqual([s25.n, s50.n, s100.n, s200.n], [48, 72, 96, 96]);
    assert.equal(s25.colors, 0, '25: one colour');
    assert.equal(s50.colors, 1, '50: two colours');
    assert.ok(s100.willow && s100.core && !s100.inner, '100: willow with a white core');
    assert.ok(s200.inner, '200: a second shell inside');
    assert.ok(s50.bright > s25.bright, 'a higher multiplier is brighter');
    const lite = r._fwShellFor(200, 4, true);
    assert.equal(lite.n, 24);
    assert.ok(!lite.willow && !lite.core && !lite.inner && !lite.trail);
    for (const bad of [NaN, undefined, null, -3, 'x']) {
        const sh = r._fwShellFor(bad, bad, false);
        assert.equal(sh.n, 48);
        assert.ok(Number.isFinite(sh.bright));
    }
});

test('_fwStep: a rocket climbs for ROAD_FW_RISE s, bursts once, and the shell dies out', () => {
    const r = load();
    const b = r._fwMakeBuf(512, 6);
    assert.equal(launch(r, b, 50, 4, false), 0);
    assert.equal(fwRun(r, b, r.ROAD_FW_RISE - 0.05, 60), 0, 'no burst during the climb');
    // The head is on its path: out and up, the climb slowing.
    const head = b.rk[0].head;
    assert.ok(b.pos[head * 3 + 1] > 300 && b.pos[head * 3 + 1] < 400);
    assert.ok(b.pos[head * 3] > 200 && b.pos[head * 3 + 2] < -400);
    assert.equal(fwRun(r, b, 0.1, 60), 1, 'one burst');
    assert.equal(b.rk[0].on, false);
    let sparks = 0;
    for (let i = 0; i < b.n; i++) if (b.kind[i] === 2) sparks++;
    assert.equal(sparks, 72, 'the whole shell');
    assert.equal(fwRun(r, b, 4, 60), 0, 'and no second burst');
    assert.equal(b.live, 0, 'everything has died out');
    assert.equal(liveCount(b), 0);
    assert.equal(b.top, 0, 'the draw range shrinks back to nothing');
    assert.equal(r._fwPathY(0, 400, 0), 0);
    assert.equal(r._fwPathY(0, 400, 1), 400);
    assert.ok(r._fwPathY(0, 400, 0.5) > 200, 'the climb slows toward the top');
});

test('_fwStep: the floor kills falling sparks but spares the rocket trail near the ground', () => {
    const r = load();
    const b = r._fwMakeBuf(512, 6);
    launch(r, b, 100, 4, false);
    fwRun(r, b, 0.2, 60, 100);
    let sparkles = 0;
    for (let i = 0; i < b.n; i++) if (b.kind[i] === r.ROAD_FW_KIND_SPARKLE) sparkles++;
    assert.ok(sparkles >= 4, `rocket trail below the floor survives (${sparkles})`);
    fwRun(r, b, 3, 60, 100);
    for (let i = 0; i < b.n; i++) {
        if (b.kind[i] === 0 || b.kind[i] === r.ROAD_FW_KIND_SPARKLE) continue;
        assert.ok(b.pos[i * 3 + 1] >= 100, `point ${i} below the floor`);
    }
    // Dead slots are not drawn.
    for (let i = 0; i < b.n; i++) if (b.kind[i] === 0) assert.equal(b.size[i], 0);
});

// Steps a and c side by side; returns per-point kill info for a: which
// points died before their life ran out, and how bright they were the
// step before.
function fwTwin(r, a, c, secs, fps, floorA, bandA, zA, floorC, bandC, zC, each) {
    const dt = 1 / fps;
    const prevKind = new Int8Array(a.n), prevAge = new Float32Array(a.n), prevLum = new Float32Array(a.n);
    const early = [];
    for (let t = 0; t < secs - 1e-9; t += dt) {
        for (let i = 0; i < a.n; i++) {
            prevKind[i] = a.kind[i]; prevAge[i] = a.age[i];
            prevLum[i] = a.col[i * 3] + a.col[i * 3 + 1] + a.col[i * 3 + 2];
        }
        r._fwStep(a, dt, floorA, bandA, zA);
        r._fwStep(c, dt, floorC, bandC, zC);
        for (let i = 0; i < a.n; i++) {
            const k = prevKind[i];
            if (k === 0 || k === 1 || k === r.ROAD_FW_KIND_SPARKLE) continue;
            const died = a.kind[i] === 0 || a.age[i] < prevAge[i];
            if (died && prevAge[i] + dt < a.life[i] - 1e-6) {
                const base = a.base[i * 3] + a.base[i * 3 + 1] + a.base[i * 3 + 2];
                early.push(base > 0 ? prevLum[i] / base : 0);
            }
        }
        if (each) each(t);
    }
    return early;
}

test('_fwStep: the floor really kills sparks, softly: faded out over the band before they die', () => {
    const r = load();
    // A twin with no floor shows the sparks do fall past it.
    const a = r._fwMakeBuf(512, 6), c = r._fwMakeBuf(512, 6);
    launch(r, a, 50, 4, false, 3);
    launch(r, c, 50, 4, false, 3);
    let below = 0, fewer = false;
    const early = fwTwin(r, a, c, 4, 60, 250, 70, Infinity, -1e9, 0, Infinity, () => {
        for (let i = 0; i < c.n; i++) {
            if (c.kind[i] === 0 || c.kind[i] === 1 || c.kind[i] === r.ROAD_FW_KIND_SPARKLE) continue;
            if (c.pos[i * 3 + 1] < 250) below++;
        }
        if (a.live < c.live) fewer = true;
        for (let i = 0; i < a.n; i++) {
            if (a.kind[i] === 0 || a.kind[i] === 1 || a.kind[i] === r.ROAD_FW_KIND_SPARKLE) continue;
            assert.ok(a.pos[i * 3 + 1] >= 250, `point ${i} below the floor`);
        }
    });
    assert.ok(below > 100, `without a floor the sparks fall past it (${below} point-frames)`);
    assert.ok(fewer, 'the floor took some');
    assert.ok(early.length > 10, `sparks died at the floor (${early.length})`);
    // With the band each was already (nearly) dark when it died...
    const worst = Math.max(...early);
    assert.ok(worst < 0.1, `a spark died at ${worst.toFixed(3)} of its colour`);
    // ...without it they are cut off bright.
    const h = r._fwMakeBuf(512, 6), h2 = r._fwMakeBuf(512, 6);
    launch(r, h, 50, 4, false, 3);
    launch(r, h2, 50, 4, false, 3);
    const hard = fwTwin(r, h, h2, 4, 60, 250, 0, Infinity, -1e9, 0, Infinity);
    assert.ok(Math.max(...hard) > 0.3, 'a hard floor cuts sparks off bright');
});

test('_fwStep: sparks coming nearer than zMax die; the rocket and its trail are spared', () => {
    const r = load();
    // The burst is at z -1200 and the launch at z -400: zMax -1100 lies
    // between them.
    const a = r._fwMakeBuf(512, 6), c = r._fwMakeBuf(512, 6);
    launch(r, a, 50, 4, false, 3);
    launch(r, c, 50, 4, false, 3);
    let near = 0, trail = 0;
    fwTwin(r, a, c, 3, 60, -1e9, 0, -1100, -1e9, 0, Infinity, (t) => {
        for (let i = 0; i < c.n; i++) {
            if (c.kind[i] === 0 || c.kind[i] === r.ROAD_FW_KIND_SPARKLE || c.kind[i] === 1) continue;
            if (c.pos[i * 3 + 2] > -1100) near++;
        }
        for (let i = 0; i < a.n; i++) {
            const k = a.kind[i];
            if (k === 0) continue;
            if (k === r.ROAD_FW_KIND_SPARKLE || k === 1) { if (a.pos[i * 3 + 2] > -1100) trail++; continue; }
            assert.ok(a.pos[i * 3 + 2] <= -1100, `point ${i} nearer than zMax`);
        }
    });
    assert.ok(near > 50, `without the guard sparks come nearer (${near} point-frames)`);
    assert.ok(trail > 20, `the climb nearer than zMax is still drawn (${trail})`);
});

test('_fwShouldStep: steps only with something alive, while playing or after the end', () => {
    const r = load();
    assert.equal(r._fwShouldStep(0, true, false), false);
    assert.equal(r._fwShouldStep(0, false, true), false);
    assert.equal(r._fwShouldStep(5, true, false), true);
    assert.equal(r._fwShouldStep(5, false, true), true);
    assert.equal(r._fwShouldStep(5, false, false), false, 'paused');
    assert.equal(r._fwShouldStep(5, undefined, undefined), false);
});

// _bgRoadUpdateFireworks with a stand-in geometry: the host keeps calling
// it while paused (~10 fps, real dt), so the gate must hold.
function loadFwUpdate() {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const block = src.slice(src.indexOf(START), src.indexOf(END));
    const consts = src.match(/\n    const ROAD_FW_FLOOR_LIFT[^\n]*\n    const ROAD_FW_FLASH_S[^\n]*\n/);
    assert.ok(consts, 'firework floor constants not found');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext('const K = 0.0075; const TS = 230 * K;\n' + block + consts[0]
        + 'function _bgRoadLaunchRocket() {}\n'
        + sliceFn(src, '    function _bgRoadUpdateFireworks(') + '\n'
        + 'this.update = _bgRoadUpdateFireworks; this.launch = _fwLaunch; this.shell = _fwShellFor;'
        + 'this.makeBuf = () => _fwMakeBuf(512, 6);', sandbox);
    return sandbox;
}

test('_bgRoadUpdateFireworks: a paused song freezes its rockets though dt keeps coming; after the end they run', () => {
    const f = loadFwUpdate();
    const nop = { needsUpdate: false };
    const s = {
        fwBuf: f.makeBuf(), fwKey: 'a', fwFlash: 0, fwDirty: false, fwMoving: false,
        fwFloorY: -1e9, fwZMax: Infinity,
        fw: { geometry: { setDrawRange() {}, attributes: { position: nop, aColor: nop, aSize: nop } } },
    };
    const chart = { songKey: 'a', back: false, ended: false, fwN: 0, fwQ: null };
    f.launch(s.fwBuf, 200, 0, -400, 300, 400, -1200, 1, f.shell(50, 4, false), 1, 0.2, 0.6, 0.1, 0.9, 1, 7);
    for (let i = 0; i < 30; i++) f.update(s, chart, true, false, 1 / 60);
    assert.equal(s.fwMoving, true);
    const before = Array.from(s.fwBuf.pos);
    for (let i = 0; i < 20; i++) f.update(s, chart, false, false, 0.1);
    assert.equal(s.fwMoving, false, 'paused');
    assert.deepEqual(Array.from(s.fwBuf.pos), before, 'nothing moved in 2 s of paused frames');
    chart.ended = true;
    for (let i = 0; i < 6; i++) f.update(s, chart, false, false, 0.1);
    assert.equal(s.fwMoving, true, 'the song has ended');
    assert.notDeepEqual(Array.from(s.fwBuf.pos), before);
    chart.ended = false;
    chart.songKey = 'b';
    f.update(s, chart, true, false, 1 / 60);
    assert.equal(s.fwBuf.live, 0, 'a new song clears them');
    assert.equal(s.fwMoving, false);
});

test('fireworks floor wiring: the floor at the ground, no nearer than the board\'s far end', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    assert.match(src, /fwFloorY: groundY \+ ROAD_FW_FLOOR_LIFT, fwZMax: -AHEAD \* TS,/);
    assert.match(src, /if \(moving\) \{\n\s*if \(_fwStep\(fb, dt, s\.fwFloorY, ROAD_FW_FLOOR_BAND, s\.fwZMax\) > 0\)/);
    assert.equal(src.split('_fwStep(fb,').length, 2, 'one step call');
    assert.match(src, /const ROAD_FW_FLOOR_LIFT = 10 \* K, ROAD_FW_FLOOR_BAND = 70 \* K;/);
});

// Trail points that appeared in the last step (new kind, or a slot reused).
function countNew(b, kind, prevKind, prevAge) {
    let n = 0;
    for (let i = 0; i < b.n; i++) if (b.kind[i] === kind && (prevKind[i] !== kind || b.age[i] < prevAge[i])) n++;
    return n;
}
function fwEmitted(r, b, secs, fps, kind, hitchAt) {
    const prevKind = new Int8Array(b.n), prevAge = new Float32Array(b.n);
    let n = 0;
    const dt = 1 / fps;
    let hitched = false;
    for (let t = 0; t < secs - 1e-9;) {
        const step = hitchAt != null && !hitched && t >= hitchAt ? 0.1 : dt;
        if (step !== dt) hitched = true;
        prevKind.set(b.kind); prevAge.set(b.age);
        r._fwStep(b, step, -1e9);
        n += countNew(b, kind, prevKind, prevAge);
        t += step;
    }
    return n;
}

test('_fwStep: willow trails keep their spacing at any frame rate', () => {
    const r = load();
    const counts = [30, 50, 60, 144, 240].map((fps) => {
        const b = r._fwMakeBuf(r.ROAD_FW_POOL, 6);
        launch(r, b, 100, 4, false, 9);
        return [fps, fwEmitted(r, b, 4, fps, 3)];
    });
    const ref = counts[2][1];
    assert.ok(ref > 500, `a willow drops trail points (${ref})`);
    for (const [fps, n] of counts) {
        assert.ok(Math.abs(n - ref) / ref < 0.04, `${fps} fps: ${n} trail points vs ${ref} at 60`);
    }
});

test('_fwStep: a slow frame spreads the rocket trail along the climb instead of stacking it', () => {
    const r = load();
    const SP = r.ROAD_FW_KIND_SPARKLE;
    const counts = [];
    for (const [fps, hitch] of [[20, null], [30, null], [60, null], [144, null], [60, 0.3]]) {
        const b = r._fwMakeBuf(512, 6);
        launch(r, b, 25, 3, false, 4);
        const prevKind = new Int8Array(b.n), prevAge = new Float32Array(b.n);
        const dt = 1 / fps;
        let n = 0, multi = 0, hitched = false;
        for (let t = 0; t < 0.8 - 1e-9;) {
            const step = hitch != null && !hitched && t >= hitch ? 0.1 : dt;
            if (step !== dt) hitched = true;
            prevKind.set(b.kind); prevAge.set(b.age);
            r._fwStep(b, step, -1e9);
            t += step;
            // The sparkles this step owed: each on its own spot along the
            // climb, each with its own drift.
            const fresh = [];
            for (let i = 0; i < b.n; i++) if (b.kind[i] === SP && (prevKind[i] !== SP || b.age[i] < prevAge[i])) fresh.push(i);
            n += fresh.length;
            if (fresh.length > 1) multi++;
            const tag = `${fps} fps${hitch ? ' with a 0.1 s hitch' : ''}`;
            for (let x = 0; x < fresh.length; x++) {
                for (let y = x + 1; y < fresh.length; y++) {
                    const i = fresh[x] * 3, j = fresh[y] * 3;
                    const d = Math.hypot(b.pos[i] - b.pos[j], b.pos[i + 1] - b.pos[j + 1], b.pos[i + 2] - b.pos[j + 2]);
                    // The head covers ~27 units of z per ROAD_FW_TRAIL_DT here.
                    assert.ok(d > 5, `${tag}: sparkles ${fresh[x]} and ${fresh[y]} stacked (${d.toFixed(2)} apart)`);
                    assert.ok(Math.abs(b.vel[i] - b.vel[j]) > 1e-6, `${tag}: sparkles ${fresh[x]} and ${fresh[y]} drift together`);
                }
            }
        }
        if (fps <= 30 || hitch) assert.ok(multi > 0, `${fps} fps: some steps owe several sparkles`);
        counts.push(n);
    }
    // About one per ROAD_FW_TRAIL_DT of climb, whatever the frame rate.
    for (const n of counts) assert.ok(Math.abs(n - counts[2]) <= 2, `trail sparkles ${counts.join(', ')}`);
});

// The launch functions with the real three.js camera maths: does every
// burst land where the view can see it?
function loadLaunch() {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const block = src.slice(src.indexOf(START), src.indexOf(END));
    const fwConsts = src.match(/\n    const ROAD_FW_NDC_Y[^\n]*\n    const ROAD_FW_Y_MIN[^\n]*\n    const ROAD_FW_REACH_MIN[^\n]*\n/);
    assert.ok(fwConsts, 'firework camera constants not found');
    const consts = src.match(/\n    const ROAD_FIN_X_MIN[\s\S]*?const ROAD_FIN_HOLD_MAX = 4;[^\n]*\n/);
    assert.ok(consts, 'finale constants not found');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext('const K = 0.0075; const TS = 230 * K;\n' + block + fwConsts[0] + consts[0]
        + sliceFn(src, '    function _bgRoadFwBurstY(') + '\n'
        + sliceFn(src, '    function _bgRoadFwFitX(') + '\n'
        + sliceFn(src, '    function _bgRoadLaunchRocket(') + '\n'
        + sliceFn(src, '    function _bgRoadLaunchFinaleRocket(') + '\n'
        + 'this.rocket = _bgRoadLaunchRocket; this.finale = _bgRoadLaunchFinaleRocket; this.clear = _fwClear;'
        + 'this.makeBuf = () => _fwMakeBuf(ROAD_FW_POOL, ROAD_FW_ROCKETS);', sandbox);
    return sandbox;
}
async function launchView(f, aspect) {
    const T = await import(pathToFileURL(THREE_JS).href);
    const K = 0.0075, TS = 230 * K;
    const cam = new T.PerspectiveCamera(70, aspect, 0.01, 670 * K * 3);
    cam.position.set(0, 120 * K, 110 * K);
    cam.lookAt(0, 0, -230 * K);
    cam.updateMatrixWorld();
    const root = new T.Group();
    root.updateMatrixWorld();
    const s = {
        cam, root, fwV: new T.Vector3(), tmpColor: new T.Color(), fwBuf: f.makeBuf(), fwCount: 0, seed: 5,
        postX: 160 * K, groundY: 0, zFar: -4 * TS, skylineZ: -4 * TS - 600 * K,
    };
    const ndc = (x, y, z) => new T.Vector3(x, y, z).applyMatrix4(root.matrixWorld).project(cam);
    // Each launch's burst point, read off the rocket and cleared again.
    const burst = (fire) => {
        fire();
        const r = s.fwBuf.rk[0];
        const out = { x: r.x1, y: r.y1, z: r.z1, x0: r.x0, p: ndc(r.x1, r.y1, r.z1) };
        f.clear(s.fwBuf);
        return out;
    };
    return { s, burst };
}

test('rocket bursts fit the view: a narrow pane pulls them in, a wide one lets them spread', async () => {
    const f = loadLaunch();
    const runs = {};
    for (const aspect of [0.6, 16 / 9]) {
        const { s, burst } = await launchView(f, aspect);
        const ms = [], fin = [];
        for (let i = 0; i < 24; i++) ms.push(burst(() => f.rocket(s, 50, 4, 0x00f0ff, 0xff2ec4, false)));
        for (let i = 0; i < 12; i++) fin.push(burst(() => f.finale(s, i, i === 11, null, false)));
        runs[aspect] = { ms, fin };
        for (const b of ms) {
            assert.ok(Math.abs(b.p.x) <= 0.6 + 1e-3, `aspect ${aspect.toFixed(2)}: milestone at x ${b.p.x.toFixed(3)}`);
            assert.ok(b.p.y >= 0.66 - 0.01 && b.p.y <= 0.76 + 0.01, `aspect ${aspect.toFixed(2)}: milestone at y ${b.p.y.toFixed(3)}`);
            // Still out from the launch line, away from the road.
            assert.ok(Math.sign(b.x) === Math.sign(b.x0) && Math.abs(b.x) >= Math.abs(b.x0) - 1e-9);
        }
        for (const b of fin) {
            assert.ok(Math.abs(b.p.x) <= 0.7 + 1e-3, `aspect ${aspect.toFixed(2)}: finale at x ${b.p.x.toFixed(3)}`);
            assert.ok(b.p.y > 0.4 && b.p.y < 0.9, `aspect ${aspect.toFixed(2)}: finale at y ${b.p.y.toFixed(3)}`);
        }
    }
    const narrow = runs[0.6], wide = runs[16 / 9];
    // Same seeds, so the same picks: the narrow pane only ever pulls in.
    let pulled = 0;
    narrow.ms.forEach((b, i) => {
        assert.ok(Math.abs(b.x) <= Math.abs(wide.ms[i].x) + 1e-9);
        if (Math.abs(b.x) < Math.abs(wide.ms[i].x) - 1e-6) pulled++;
    });
    assert.ok(pulled >= 6, `the narrow pane pulled ${pulled} of 24 milestone bursts in`);
    const spread = (list) => Math.max(...list.map((b) => Math.abs(b.x)));
    assert.ok(spread(wide.ms) > spread(narrow.ms) * 1.3, 'milestones spread wider at 16:9');
    assert.ok(spread(wide.fin) > spread(narrow.fin) * 1.3, 'the finale spreads wider at 16:9');
    assert.ok(Math.abs(wide.fin[11].x) < 1e-9, 'the big willow goes up the middle');
});

test('_fwStep: paused (dt 0) freezes everything; the same seed gives the same burst', () => {
    const r = load();
    const a = r._fwMakeBuf(512, 6), c = r._fwMakeBuf(512, 6);
    launch(r, a, 100, 4, false, 11);
    launch(r, c, 100, 4, false, 11);
    fwRun(r, a, 1.2, 60);
    fwRun(r, c, 1.2, 60);
    assert.deepEqual(Array.from(a.pos), Array.from(c.pos));
    const before = Array.from(a.pos);
    assert.equal(r._fwStep(a, 0, 100), 0);
    assert.equal(r._fwStep(a, NaN, 100), 0);
    assert.deepEqual(Array.from(a.pos), before, 'nothing moves while paused');
    const d = r._fwMakeBuf(512, 6);
    launch(r, d, 100, 4, false, 12);
    fwRun(r, d, 1.2, 60);
    assert.notDeepEqual(Array.from(d.pos), before, 'another seed, another burst');
});

test('_fwLaunch / _fwStep: a full pool degrades gracefully; _fwClear empties it', () => {
    const r = load();
    const b = r._fwMakeBuf(64, 2);
    assert.equal(launch(r, b, 200, 4, false), 0);
    assert.equal(launch(r, b, 200, 4, false), 1);
    assert.equal(launch(r, b, 200, 4, false), -1, 'every rocket busy');
    fwRun(r, b, 2, 60);
    assert.ok(b.live <= b.n && b.live === liveCount(b), `live ${b.live}`);
    r._fwClear(b);
    assert.equal(b.live, 0);
    assert.equal(b.top, 0);
    assert.equal(liveCount(b), 0);
    assert.ok(b.rk.every((x) => !x.on));
    assert.equal(launch(r, b, 25, 3, true), 0, 'usable again');
    fwRun(r, b, 1, 60);
    let sparks = 0;
    for (let i = 0; i < b.n; i++) if (b.kind[i] === 2) sparks++;
    assert.equal(sparks, 24, 'Lite shell');
});

test('road wiring: milestones become rockets on the night road, which fly on after the song ends', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    // A rocket replaces the 2D burst on the road with Streak feedback on.
    assert.match(src, /if \(d\.fxType === 'milestone'\) \{[\s\S]{0,300}?if \(bgMountedStyleId === 'road' && bgState && _streakFx\) _bgQueueRocket\(d\.streak, d\.mult\);\n\s*else _fxSpawnBurst\(nowMs\);/);
    // The handoff: kill on a backward seek, the ended latch, the queue, and
    // the queue cleared after the style ran (outside the pinned mood block).
    assert.match(src, /_bgChart\.back = _bgBack;\n\s*_bgChart\.ended = _bgEnded;\n\s*_bgChart\.fwN = _bgFwN;\n\s*_bgChart\.fwQ = _bgFwQ;\n\s*_bgChart\.hits = _bgHits;/);
    assert.match(src, /catch \(e\) \{ console\.error\('\[3D-Hwy\] bg update threw', _bgEffectiveStyleId\(\), e\); \}\n\s*_bgFwN = 0;/);
    assert.match(src, /if \(_bgBack \|\| \(_bgPlay && !_bgWasPlaying\)\) _bgEnded = false;/);
    assert.match(src, /_bgOnEnded = \(\) => \{ _bgEnded = true; _bgFinaleHold\(\); \};\n\s*window\.feedBack\.on\('song:ended', _bgOnEnded\);/);
    assert.match(src, /window\.feedBack\.off\('song:ended', _bgOnEnded\)/);
    // The road runs the fireworks before the skyline (burst flash) and
    // before the no-beats early return.
    const upd = src.indexOf('_bgRoadUpdateFireworks(s, chart, playing, lite, dt);');
    assert.ok(upd > 0 && upd < src.indexOf('_bgRoadUpdateSkyline(s, bands, chart);   // first'));
    assert.ok(upd < src.indexOf("if (n === 0) {\n                    if (s.shown !== 0) {"));
    // Built in build() (so the stage stamp gives it the background order),
    // drawn with an empty range when idle so the shader compiles at mount.
    const build = src.slice(src.indexOf('        road: {\n            build('), src.indexOf('            update(s, bands, dt, t, chart) {'));
    assert.match(build, /s\.fw = new T\.Points\(g, m\);/);
    assert.match(build, /g\.setDrawRange\(0, 0\);/);
    assert.doesNotMatch(build, /s\.fw\.visible = false/);
    // Frames keep coming while rockets fly after the song ends.
    assert.match(src, /needsContinuousFrames\(\) \{[\s\S]{0,900}?bgMountedStyleId === 'road' && bgState && bgState\.fwMoving\) return true;/);
});

// --- arrival finale ---------------------------------------------------------

test('_roadLastNoteT: last onset plus its sustain (capped), over notes and chords, clamped to the song end', () => {
    const r = load();
    assert.ok(Number.isNaN(r._roadLastNoteT([], [], 100)), 'no notes');
    assert.ok(Number.isNaN(r._roadLastNoteT(null, undefined, 0)));
    assert.equal(r._roadLastNoteT([{ t: 10 }, { t: 50, sus: 0.4 }], [], 0), 50.4);
    // A long hold counts 1.5 s at most; an earlier long note can still be last.
    assert.equal(r._roadLastNoteT([{ t: 50, sus: 9 }], [], 0), 51.5);
    assert.equal(r._roadLastNoteT([{ t: 49.9, sus: 1 }, { t: 50 }], [], 0), 50.9);
    // A chord's sustain is its longest note's.
    assert.equal(r._roadLastNoteT([{ t: 40 }], [{ t: 45, notes: [{ sus: 0.2 }, { sus: 0.7 }] }], 0), 45.7);
    assert.equal(r._roadLastNoteT([{ t: 46 }], [{ t: 45, notes: [{ sus: 0.2 }] }], 0), 46);
    // Unsorted input and bad entries are fine.
    assert.equal(r._roadLastNoteT([{ t: 60 }, null, { t: NaN }, { t: 20, sus: -3 }], [{ t: 'x' }, {}], 0), 60);
    // Clamped to half a second before the declared end, so it always fires first.
    assert.equal(r._roadLastNoteT([{ t: 99.8, sus: 1 }], [], 100), 99.5);
    assert.equal(r._roadLastNoteT([{ t: 80 }], [], 100), 80);
});

test('_roadFinaleCount: 3 in Lite, 6 in free play, 5 to 8 by how hot the run was', () => {
    const r = load();
    assert.equal(r._roadFinaleCount(1, 0, true, true), 3);
    assert.equal(r._roadFinaleCount(1, 0, false, false), 6);
    assert.equal(r._roadFinaleCount(0, 0, true, false), 5);
    assert.equal(r._roadFinaleCount(1, 0, true, false), 8);
    assert.equal(r._roadFinaleCount(1, 1, true, false), 5, 'gloom takes it back');
    let prev = 0;
    for (let h = 0; h <= 1.0001; h += 0.05) {
        const n = r._roadFinaleCount(h, 0, true, false);
        assert.ok(n >= prev && n >= 5 && n <= 8, `heat ${h}`);
        prev = n;
    }
    for (const bad of [NaN, undefined, null, -2, 9]) {
        const n = r._roadFinaleCount(bad, bad, true, false);
        assert.ok(n >= 5 && n <= 8, `bad ${bad} -> ${n}`);
    }
});

test('_roadFinaleAt / _roadFinaleDue / _roadFinaleEnd: an ordered volley over ~5 s, the big willow after it', () => {
    const r = load();
    for (const n of [1, 3, 5, 6, 8]) {
        let prev = -1;
        for (let i = 0; i < n; i++) {
            const t = r._roadFinaleAt(i, n);
            assert.ok(t > prev, `n ${n}: rocket ${i} after the one before`);
            assert.ok(t >= r.ROAD_FIN_FIRST - 1e-9 && t <= r.ROAD_FIN_FIRST + r.ROAD_FIN_SPREAD + 1e-9);
            prev = t;
        }
        assert.ok(r._roadFinaleAt(n, n) > prev, 'the big one comes last');
        assert.equal(r._roadFinaleAt(n, n), r.ROAD_FIN_BIG_AT);
        assert.equal(r._roadFinaleDue(0, n), 0);
        assert.equal(r._roadFinaleDue(100, n), n);
        assert.equal(r._roadFinaleDue(r._roadFinaleAt(n - 1, n), n), n, 'due at its own time');
        assert.ok(r._roadFinaleEnd(n, true) > r._roadFinaleEnd(n, false));
    }
    assert.equal(r._roadFinaleAt(0, 6), r.ROAD_FIN_FIRST);
    assert.ok(Math.abs(r._roadFinaleAt(5, 6) - (r.ROAD_FIN_FIRST + r.ROAD_FIN_SPREAD)) < 1e-9);
    assert.ok(r._roadFinaleEnd(6, false) < 11, 'over in about 10 s');
});

test('_fwFinaleShell: peony, willow and single shells in turn; a slow double willow for the big one; Lite trims', () => {
    const r = load();
    const a = r._fwFinaleShell(0, false, false), b = r._fwFinaleShell(1, false, false), c = r._fwFinaleShell(2, false, false);
    assert.equal(a.colors, 1);
    assert.ok(b.willow && b.core);
    assert.ok(!c.willow && c.colors === 0);
    assert.equal(r._fwFinaleShell(3, false, false).n, a.n, 'it cycles');
    const big = r._fwFinaleShell(6, true, false);
    assert.ok(big.willow && big.inner && big.core && big.n > b.n && big.life > b.life);
    const lite = r._fwFinaleShell(1, true, true);
    assert.equal(lite.n, 24);
    assert.ok(!lite.willow && !lite.inner && !lite.trail);
});

test('the pool holds a hot finale with its big willow and a milestone on top, at 30 and 144 fps', () => {
    const r = load();
    for (const fps of [30, 144]) {
        const b = r._fwMakeBuf(r.ROAD_FW_POOL, r.ROAD_FW_ROCKETS);
        const n = r._roadFinaleCount(1, 0, true, false);
        let next = 0, peak = 0, failed = 0;
        const dt = 1 / fps;
        // A 100 streak milestone right at the trigger, then the volley.
        if (launch(r, b, 100, 4, false) < 0) failed++;
        for (let t = 0; t < r._roadFinaleEnd(n, true) + 0.5; t += dt) {
            while (next <= n && r._roadFinaleAt(next, n) <= t) {
                const sh = r._fwFinaleShell(next, next === n, false);
                if (r._fwLaunch(b, next * 30, 0, -1500, next * 30, 400, -1500, 1, sh, 1, 0.3, 0.6, 0.2, 0.8, 1, next + 1) < 0) failed++;
                next++;
            }
            r._fwStep(b, dt, -1e9);
            if (b.live > peak) peak = b.live;
        }
        assert.equal(failed, 0, `${fps} fps: every rocket found a slot`);
        assert.ok(peak < r.ROAD_FW_POOL, `${fps} fps: peak ${peak} of ${r.ROAD_FW_POOL} points`);
        assert.equal(b.live, 0, `${fps} fps: all gone by the end`);
    }
});

// One function's text out of screen.js, by its signature line.
function sliceFn(src, sig) {
    const a = src.indexOf(sig);
    assert.ok(a > 0, `${sig} not found`);
    const open = src.indexOf('{', a);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1);
    }
    throw new Error('unbalanced');
}

// _bgRoadUpdateFinale runs outside the pure block (it launches through the
// camera helpers), so it is sliced on its own with stand-ins for THREE.
function loadFinale() {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const fnText = (sig) => {
        const a = src.indexOf(sig);
        assert.ok(a > 0, `${sig} not found`);
        const open = src.indexOf('{', a);
        let depth = 0;
        for (let i = open; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1);
        }
        throw new Error('unbalanced');
    };
    const block = src.slice(src.indexOf(START), src.indexOf(END));
    const consts = src.match(/\n    const ROAD_FIN_X_MIN[\s\S]*?const ROAD_FIN_HOLD_MAX = 4;[^\n]*\n/);
    assert.ok(consts, 'finale constants not found');
    const fwConsts = src.match(/\n    const ROAD_FW_NDC_Y[^\n]*\n    const ROAD_FW_Y_MIN[^\n]*\n/);
    assert.ok(fwConsts, 'firework camera constants not found');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext('const K = 0.0075; const TS = 230 * K;\n' + block + fwConsts[0] + consts[0]
        + fnText('    function _bgRoadFwBurstY(') + '\n'
        + fnText('    function _bgRoadFwFitX(') + '\n'
        + fnText('    function _bgRoadLaunchFinaleRocket(') + '\n'
        + fnText('    function _bgRoadUpdateFinale(') + '\n'
        + 'this.update = _bgRoadUpdateFinale; this.makeMood = _roadMakeMood;'
        + 'this.makeBuf = () => _fwMakeBuf(ROAD_FW_POOL, ROAD_FW_ROCKETS);', sandbox);
    return sandbox;
}
function finaleRoad(f) {
    const v = { set() { return v; }, applyMatrix4() { return v; }, distanceTo() { return 1; } };
    return {
        mood: f.makeMood(), fwBuf: f.makeBuf(), fwCount: 0, fwDirty: false, seed: 5,
        skylineZ: -11, groundY: 0, cam: null, root: null, fwV: v,
        tmpColor: { r: 0, g: 0, b: 0, setHex() { return this; } },
        finLaunched: -1, finBigDone: false, finLift: 0, finLive: false, finBeatIv: 0.5,
    };
}
function finaleRun(f, s, chart, secs, fps, playing = true) {
    const dt = 1 / fps;
    for (let t = 0; t < secs - 1e-9; t += dt) {
        f.update(s, chart, playing, false, dt);
        if (playing || chart.ended) chart.finAge += dt;
    }
}

test('_bgRoadUpdateFinale: wakes the city, clears the weather and fires the volley on schedule', () => {
    const f = loadFinale();
    const s = finaleRoad(f);
    s.mood.heat = 0.1; s.mood.gloom = 1;
    const chart = { finAge: 0, finN: 6, finClean: false, ended: false, beats: null };
    finaleRun(f, s, chart, 1, 60);
    assert.ok(s.fwCount >= 1 && s.fwCount <= 2, `first rockets (${s.fwCount})`);
    finaleRun(f, s, chart, 1.2, 60);
    assert.equal(s.finLift, 1, 'fully awake after 1.5 s');
    assert.equal(s.mood.heat, 1, 'lamps amber');
    assert.equal(s.mood.gloom, 0, 'fog and rain gone within 2 s');
    finaleRun(f, s, chart, 6, 60);
    assert.equal(s.fwCount, 6, 'six rockets, no big willow without a clean run');
    assert.equal(s.finLaunched, 6);
    finaleRun(f, s, chart, 10, 60);
    assert.equal(s.finLive, false, 'over');
    assert.equal(s.mood.heat, 1, 'the city stays lit');
    // A clean judged run earns the big willow; Lite never fires it.
    const c = finaleRoad(f);
    const cc = { finAge: 0, finN: 8, finClean: true, ended: false, beats: null };
    finaleRun(f, c, cc, 8, 60);
    assert.equal(c.fwCount, 9);
    const l = finaleRoad(f);
    const lc = { finAge: 0, finN: 3, finClean: true, ended: false, beats: null };
    for (let t = 0; t < 8; t += 1 / 60) { f.update(l, lc, true, true, 1 / 60); lc.finAge += 1 / 60; }
    assert.equal(l.fwCount, 3);
});

test('_bgRoadUpdateFinale: paused it holds still; after the song ends it runs; off resets it', () => {
    const f = loadFinale();
    const s = finaleRoad(f);
    s.mood.gloom = 1;
    const chart = { finAge: 0, finN: 6, finClean: false, ended: false, beats: [{ time: 10 }, { time: 10.6 }] };
    finaleRun(f, s, chart, 0.5, 60);
    const lift = s.finLift, n = s.fwCount, gloom = s.mood.gloom;
    finaleRun(f, s, chart, 3, 60, false);
    assert.equal(s.finLift, lift, 'the lift waits');
    assert.equal(s.fwCount, n, 'no launches');
    assert.equal(s.mood.gloom, gloom, 'the weather waits');
    assert.equal(s.finLive, false, 'no continuous frames for a paused finale');
    chart.ended = true;
    finaleRun(f, s, chart, 7, 60, false);
    assert.equal(s.fwCount, 6, 'the volley finishes after the song ended');
    assert.ok(Math.abs(s.finBeatIv - 0.6) < 1e-9, 'neon keeps the last beat spacing');
    chart.finAge = -1;
    f.update(s, chart, true, false, 1 / 60);
    assert.equal(s.finLift, 0);
    assert.equal(s.finLaunched, -1);
    assert.equal(s.finLive, false);
});

test('_bgRoadUpdateFinale: a road mounted mid-volley skips the rockets already fired', () => {
    const f = loadFinale();
    const whole = finaleRoad(f);
    const a = { finAge: 0, finN: 7, finClean: true, ended: false, beats: null };
    finaleRun(f, whole, a, 3, 60);
    const before = whole.fwCount;
    // The remount: a fresh road state at the same finale clock.
    const fresh = finaleRoad(f);
    const b = { finAge: a.finAge, finN: 7, finClean: true, ended: false, beats: null };
    f.update(fresh, b, true, false, 1 / 60);
    assert.equal(fresh.fwCount, 0, 'nothing re-fired');
    finaleRun(f, fresh, b, 6, 60);
    assert.equal(before + fresh.fwCount, 8, 'the rest of the volley and the big willow, once each');
});

test('finale wiring: instance trigger, re-arm, exit hold and setting', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    // Fires once per pass when the last note crosses the hit line (or the
    // song ends first), only while playing or after the end, only on the road.
    assert.match(src, /if \(!_bgFinFired && _bgFinOn && style === BG_STYLES\.road && bundle\.isReady\n\s*&& \(_bgEnded \|\| \(_bgPlay && _bgT >= _bgLastNoteT\)\)\) \{/);
    // A seek back before the last note re-arms it; a new song clears it.
    assert.match(src, /if \(_bgBack && !\(_bgT >= _bgLastNoteT\)\) \{ _bgFinFired = false; _bgFinAge = -1; \}/);
    assert.match(src, /_bgFwN = 0;\n\s*_bgFinFired = false;\n\s*_bgFinAge = -1;/);
    // Its clock: wall dt while playing or after the end, frozen on pause.
    assert.match(src, /if \(_bgFinAge >= 0 && \(_bgPlay \|\| _bgEnded\)\) _bgFinAge \+= dt;/);
    // The last note is recomputed when the chart arrays change, never re-arming.
    assert.match(src, /_bgLastNoteT = _roadLastNoteT\(bundle\.notes, bundle\.chords, _bgDurRef\);/);
    // The road overrides the mood before fog and rain are derived.
    const fin = src.indexOf('_bgRoadUpdateFinale(s, chart, playing, lite, dt);   // overrides');
    assert.ok(fin > 0 && fin < src.indexOf('s.fogAmt = _roadSmooth(ROAD_FOG_START'));
    assert.ok(fin > src.indexOf('_roadMoodStep(s.mood, playing ? dt : 0'));
    // Free-play exit hold: taken in our own song:ended handler, gated.
    const hold = src.slice(src.indexOf('function _bgFinaleHold() {'), src.indexOf('function _bgQueueRocket('));
    assert.match(hold, /_ndHasProvider/);
    assert.match(hold, /localStorage\.getItem\('autoplayExit'\) !== '0'/);
    assert.match(hold, /q\.hasNext\(\)/);
    assert.match(hold, /_h3dOverlayUp\(\)/);
    assert.match(hold, /Math\.min\(ROAD_FIN_HOLD_MAX, left\) \* 1000/);
    assert.match(hold, /if \(!\(left > ROAD_FIN_HOLD_MIN\)\) return;/);
    // Continuous frames while the volley runs after the end.
    assert.match(src, /bgMountedStyleId === 'road' && bgState && bgState\.finLive\) return true;/);
    // The setting: default on, a boolean, a setter, a checkbox.
    assert.match(src, /roadQuality: 'auto', finale: true[,}]/);
    assert.match(src, /'streakFx', 'bloom', 'finale'[,\]]/);
    assert.match(src, /window\.h3dBgSetFinale\s*= \(v\) => _bgWriteGlobal\('finale', !!v\);/);
    assert.match(src, /_bgFinOn\s*= _bgReadSetting\(panelKey, 'finale'\);/);
    const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    assert.match(html, /id="h3d-bg-road-finale"[\s\S]{0,200}window\.h3dBgSetFinale\(this\.checked\)/);
    assert.match(html, /localStorage\.getItem\('h3d_bg_finale'\)/);
});

// --- bridges ----------------------------------------------------------------

test('_roadIsBridgeName: starts-with after clean-up, the table from the scope', () => {
    const r = load();
    for (const yes of ['bridge', 'Bridge', 'BRIDGE', 'bridge2', 'Bridge 2', 'bridge(halftime)', 'BRIDGE (half time)',
        'bridge_1', 'brdg', 'middle 8', 'Middle8', 'middle eight', 'Middle_Eight', 'bridgesolo', '  bridge  ']) {
        assert.equal(r._roadIsBridgeName(yes), true, yes);
    }
    for (const no of ['prebridge', 'post-bridge', 'solo/bridge', 'Solo / Bridge', 'Open strings', 'chorus', 'solo',
        'default', '', null, undefined, 'middle', 'brd', 'middle 9']) {
        assert.equal(r._roadIsBridgeName(no), false, String(no));
    }
});

test('_roadBridgeSpans: to the next section, adjacent bridges merge, short ones drop, unsorted is fine', () => {
    const r = load();
    const plain = (a) => Array.from(a, (x) => [x.t0, x.t1]);   // out of the vm realm
    // PonyIcon: two bridge entries in a row become one bridge.
    const pony = [{ time: 0, name: 'intro' }, { time: 110.4, name: 'bridge' }, { time: 119.6, name: 'bridge' },
        { time: 128.8, name: 'preverse' }, { time: 140, name: 'outro' }];
    assert.deepEqual(plain(r._roadBridgeSpans(pony, 200, 1.5)), [[110.4, 128.8]]);
    // Separate bridges stay separate; the last section runs to the song's end.
    const two = [{ time: 10, name: 'Bridge' }, { time: 20, name: 'chorus' }, { time: 50, name: 'bridge2' }];
    assert.deepEqual(plain(r._roadBridgeSpans(two, 70, 1.5)), [[10, 20], [50, 70]]);
    // Song length unknown yet: the last one gets 8 s.
    assert.deepEqual(plain(r._roadBridgeSpans(two, 0, 1.5)), [[10, 20], [50, 58]]);
    // Under 1.5 s: no bridge.
    const short = [{ time: 10, name: 'bridge' }, { time: 11, name: 'verse' }, { time: 30, name: 'middle 8' }, { time: 31.5, name: 'x' }];
    assert.deepEqual(plain(r._roadBridgeSpans(short, 60, 1.5)), [[30, 31.5]]);
    // Unsorted input is sorted on a copy (the caller's array is untouched).
    const mixed = [{ time: 50, name: 'outro' }, { time: 30, name: 'bridge' }, { time: 40, name: 'solo' }];
    assert.deepEqual(plain(r._roadBridgeSpans(mixed, 60, 1.5)), [[30, 40]]);
    assert.equal(mixed[0].time, 50);
    // No bridge, no sections, bad entries.
    assert.equal(r._roadBridgeSpans([{ time: 0, name: 'default' }], 100, 1.5).length, 0);
    assert.equal(r._roadBridgeSpans(null, 100, 1.5).length, 0);
    assert.deepEqual(plain(r._roadBridgeSpans([null, { time: NaN, name: 'bridge' }, { time: 5, name: 'bridge' }], 20, 1.5)), [[5, 20]]);
    // A chart whose only section is a bridge is a bridge for the whole song.
    assert.deepEqual(plain(r._roadBridgeSpans([{ time: 0, name: 'bridge' }], 180, 1.5)), [[0, 180]]);
});

test('_roadPlaceBridges: spans overlapping the window, ends at note z, the cap respected', () => {
    const r = load();
    const spans = [{ t0: 10, t1: 20 }, { t0: 22, t1: 24 }, { t0: 40, t1: 50 }];
    const out = r._roadMakeBridgeSlots(r.ROAD_BRIDGE_POOL);
    assert.equal(r._roadPlaceBridges(spans, 0, TS, 2, 4, out, 3), 0, 'nothing in view yet');
    assert.equal(r._roadPlaceBridges(spans, 7, TS, 2, 4, out, 3), 1, 'coming into view');
    assert.ok(Math.abs(out[0].zN - (-(10 - 7) * TS)) < 1e-9);
    assert.ok(Math.abs(out[0].zF - (-(20 - 7) * TS)) < 1e-9);
    assert.equal(r._roadPlaceBridges(spans, 19, TS, 2, 4, out, 3), 2, 'leaving one, the next one ahead');
    assert.equal(out[0].t0, 10);
    assert.equal(out[1].t0, 22);
    assert.equal(r._roadPlaceBridges(spans, 19, TS, 2, 4, out, 1), 1, 'cap');
    assert.equal(r._roadPlaceBridges(spans, 26.5, TS, 2, 4, out, 3), 0, 'past both, the third not yet');
    assert.equal(r._roadPlaceBridges(spans, NaN, TS, 2, 4, out, 3), 0);
    assert.equal(r._roadPlaceBridges([], 15, TS, 2, 4, out, 3), 0);
});

test('_roadBridgeMask: 0 off the bridge, 1 on it, easing over the ramp at both ends', () => {
    const r = load();
    const zN = 0, zF = -10, ramp = 2;
    assert.equal(r._roadBridgeMask(1, zN, zF, ramp), 0);
    assert.equal(r._roadBridgeMask(-11, zN, zF, ramp), 0);
    assert.equal(r._roadBridgeMask(-5, zN, zF, ramp), 1);
    assert.equal(r._roadBridgeMask(0, zN, zF, ramp), 0);
    assert.equal(r._roadBridgeMask(-10, zN, zF, ramp), 0);
    let prev = 0;
    for (let z = 0; z >= -2; z -= 0.1) {
        const m = r._roadBridgeMask(z, zN, zF, ramp);
        assert.ok(m >= prev - 1e-12 && m <= 1, `rises driving on (${z})`);
        prev = m;
    }
    assert.ok(Math.abs(r._roadBridgeMask(-1, zN, zF, ramp) - r._roadBridgeMask(-9, zN, zF, ramp)) < 1e-12, 'symmetric');
    assert.equal(r._roadBridgeMask(-5, zN, zF, 0), 1, 'no ramp');
    assert.equal(r._roadBridgeMask(NaN, zN, zF, ramp), 0);
});

test('bridge wiring: deck order, valley, fog skip, Lite, setting', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    // Built in build() (the stage stamp), drawn after the asphalt.
    const build = src.slice(src.indexOf('        road: {\n            build('), src.indexOf('            update(s, bands, dt, t, chart) {'));
    assert.match(build, /s\.deck = new T\.InstancedMesh\(deckGeo, s\.deckMat, ROAD_BRIDGE_POOL\);/);
    assert.match(build, /s\.deckMat = mat\(new T\.MeshBasicMaterial\(\{ color: 0x3a3e46, depthWrite: false \}\)\);/);
    assert.match(src, /if \(s\.deck\) s\.deck\.renderOrder = ROAD_DECK_ORDER;/);
    assert.match(src, /const ROAD_DECK_ORDER = -0\.95;/);
    // The ground (and its valley) draws before the asphalt and deck, which write
    // no depth: otherwise the valley's far walls paint over the nearer road.
    assert.match(src, /const ROAD_GROUND_ORDER = -1\.05;/);
    assert.match(src, /s\.hills\[i\]\.mesh\.renderOrder = ROAD_GROUND_ORDER;/);
    // Placed before the hills (valley) and the weather (fog over the valley);
    // Lite keeps the deck and parapets but carves no valley.
    const upd = src.indexOf('_bgRoadUpdateBridge(s, chart, lite);   // before the hills');
    assert.ok(upd > 0 && upd < src.indexOf('_bgRoadUpdateHills(s, lite ? 0 : (chart ? chart.time : 0), !lite);'));
    assert.ok(upd < src.indexOf('_bgRoadUpdateWeather(s, chart, t);'));
    assert.match(src, /if \(s\.brN > 0 && k > 0\) k \*= 1 - _bgRoadBridgeMaskAt\(s, z\);/);
    assert.match(src, /const carve = !!valley && s\.brN > 0;/);
    // The setting reaches the road through the chart.
    assert.match(src, /_bgChart\.bridges = _bgBridgesOn;/);
    assert.match(src, /_bgBridgesOn\s*= _bgReadSetting\(panelKey, 'bridges'\);/);
    assert.match(src, /finale: true, bridges: true \};/);
    assert.match(src, /'finale', 'bridges'\]\);/);
    assert.match(src, /window\.h3dBgSetBridges\s*= \(v\) => _bgWriteGlobal\('bridges', !!v\);/);
    const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    assert.match(html, /id="h3d-bg-road-bridges"[\s\S]{0,200}window\.h3dBgSetBridges\(this\.checked\)/);
    // Disposed with the road.
    assert.match(src, /s\.deck, s\.beams, s\.balusters, s\.rails,\n\s*s\.brTowers, s\.brBeacons, s\.brCables, s\.water, s\.refl\]\) m\?\.dispose\?\.\(\);/);
});

test('_roadBridgeTowerT: towers stand inside each end, clear of the gantries there', () => {
    const r = load();
    const off = r.ROAD_BRIDGE_TOWER_OFF_S;
    assert.equal(off, 0.4);
    assert.ok(Math.abs(r._roadBridgeTowerT(60, 82, 0, off) - 60.4) < 1e-9);
    assert.ok(Math.abs(r._roadBridgeTowerT(60, 82, 1, off) - 81.6) < 1e-9);
    // A short span keeps them a quarter in from each end, never crossed.
    assert.ok(Math.abs(r._roadBridgeTowerT(10, 11.5, 0, off) - 10.375) < 1e-9);
    assert.ok(Math.abs(r._roadBridgeTowerT(10, 11.5, 1, off) - 11.125) < 1e-9);
    for (const len of [1.5, 2, 3, 8, 40]) {
        const a = r._roadBridgeTowerT(0, len, 0, off), b = r._roadBridgeTowerT(0, len, 1, off);
        assert.ok(a > 0 && b < len && a < b, `${len} s: ${a} .. ${b}`);
        assert.ok(a >= Math.min(off, len / 4) - 1e-9 && len - b >= Math.min(off, len / 4) - 1e-9);
    }
});

test('_roadCableAnchorT: stays reach toward the middle, back stays toward the end, all on the span', () => {
    const r = load();
    const off = r.ROAD_BRIDGE_TOWER_OFF_S, n = r.ROAD_BRIDGE_CABLES, nb = r.ROAD_BRIDGE_BACKSTAYS;
    assert.equal(r._roadCableDt(0, 22, off, n, r.ROAD_BRIDGE_CABLE_DT), r.ROAD_BRIDGE_CABLE_DT, 'long span: the widest spacing');
    assert.ok(Math.abs(r._roadCableDt(0, 1.5, off, n, 1) - (0.75 - 0.375) / n) < 1e-9, 'short span: up to the middle');
    assert.equal(r._roadCableDt(0, 1.5, off, 0, 1), 0);
    for (const [t0, t1] of [[60, 82], [10, 11.5], [0, 3], [5, 9]]) {
        const mid = (t0 + t1) / 2;
        for (let e = 0; e < 2; e++) {
            const tt = r._roadBridgeTowerT(t0, t1, e, off);
            let prev = tt;
            for (let k = 0; k < n; k++) {
                const a = r._roadCableAnchorT(t0, t1, e, k, off);
                assert.ok(a >= t0 - 1e-9 && a <= t1 + 1e-9, 'on the span');
                if (e === 0) assert.ok(a > prev && a <= mid + 1e-9, `near pair, stay ${k}: ${a}`);
                else assert.ok(a < prev && a >= mid - 1e-9, `far pair, stay ${k}: ${a}`);
                prev = a;
            }
            prev = tt;
            for (let k = n; k < n + nb; k++) {
                const a = r._roadCableAnchorT(t0, t1, e, k, off);
                if (e === 0) assert.ok(a < prev && a > t0, `near pair, back stay ${k}: ${a}`);
                else assert.ok(a > prev && a < t1, `far pair, back stay ${k}: ${a}`);
                prev = a;
            }
        }
    }
});

test('_roadReflectLayout: per seed, both sides, spread along the road, warm and neon colours', () => {
    const r = load();
    const a = r._roadMakeReflBuf(r.ROAD_REFL_POOL), b = r._roadMakeReflBuf(r.ROAD_REFL_POOL);
    const n = r._roadReflectLayout(1234, r.ROAD_REFL_POOL, 10, a);
    assert.equal(n, r.ROAD_REFL_POOL);
    assert.equal(r._roadReflectLayout(1234, 500, 10, b), r.ROAD_REFL_POOL, 'capped to the buffer');
    assert.deepEqual(Array.from(a.x), Array.from(b.x), 'same seed, same layout');
    let warm = 0, neon = 0, left = 0;
    for (let i = 0; i < n; i++) {
        assert.ok(a.side[i] === 1 || a.side[i] === -1);
        if (a.side[i] < 0) left++;
        assert.ok(a.x[i] >= 0 && a.x[i] < 1 && a.len[i] >= 0 && a.len[i] < 1 && a.phase[i] >= 0 && a.phase[i] < 1);
        assert.ok(a.z[i] >= i / n && a.z[i] < (i + 1) / n, 'stratified along the road');
        assert.ok(a.rate[i] >= 0.5 && a.rate[i] < 1.5);
        assert.ok(a.col[i] >= -1 && a.col[i] < 10);
        if (a.col[i] < 0) warm++; else neon++;
    }
    assert.equal(left, n / 2);
    assert.ok(warm > n * 0.4 && neon > n * 0.2, `warm ${warm}, neon ${neon}`);
    r._roadReflectLayout(99, r.ROAD_REFL_POOL, 10, b);
    assert.notDeepEqual(Array.from(a.x), Array.from(b.x), 'another song, another river');
    r._roadReflectLayout(99, r.ROAD_REFL_POOL, 0, b);
    assert.ok(Array.from(b.col).every((c) => c === -1), 'no neon strips: all warm');
});

// _bgRoadUpdateBridgeDress runs outside the pure block (THREE meshes), so
// it is sliced with recording stand-ins for the meshes and the dummy.
function loadDress() {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const fnText = (sig) => {
        const a = src.indexOf(sig);
        assert.ok(a > 0, `${sig} not found`);
        const open = src.indexOf('{', a);
        let depth = 0;
        for (let i = open; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}' && --depth === 0) return src.slice(a, i + 1);
        }
        throw new Error('unbalanced');
    };
    const line = (re) => {
        const m = src.match(re);
        assert.ok(m, `${re} not found`);
        return m[0];
    };
    const block = src.slice(src.indexOf(START), src.indexOf(END));
    const dress = line(/\n    const ROAD_BR_TOWER_W[\s\S]*?const ROAD_BRIDGE_LAMP_R[^\n]*\n/);
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext('const K = 0.0075; const TS = 230 * K;\n' + block
        + line(/\n    const ROAD_GANTRY_COLOR = [^\n]*\n/)
        + line(/\n    const ROAD_SIGN_FADE_FAR = [^\n]*\n/)
        + line(/\n    const ROAD_SIGN_NEAR_OPACITY = [^\n]*\n/)
        + line(/\n    const ROAD_PARAPET_H = [^\n]*\n/)
        + dress
        + fnText('    function _bgRoadBridgeMaskAt(') + '\n'
        + fnText('    function _bgRoadUpdateBridgeDress(') + '\n'
        + 'this.dress = _bgRoadUpdateBridgeDress; this.place = _roadPlaceBridges;'
        + 'this.slots = _roadMakeBridgeSlots; this.reflBuf = _roadMakeReflBuf; this.layout = _roadReflectLayout;'
        + 'this.c = { K, TS, ROAD_BR_TOWER_H, ROAD_REFL_POOL, ROAD_BRIDGE_POOL, ROAD_BRIDGE_CABLES, ROAD_BRIDGE_BACKSTAYS,'
        + ' ROAD_SIGN_NEAR_OPACITY, ROAD_BR_CABLE_POOL };', sandbox);
    return sandbox;
}
function dressRoad(f) {
    const { K, TS } = f.c;
    const rec = () => ({
        count: 0, at: [], instanceMatrix: { needsUpdate: false },
        setMatrixAt(i, m) { this.at[i] = { ...m }; },
    });
    const d = {
        p: [0, 0, 0], sc: [1, 1, 1], ry: 0, look: null, matrix: null,
        position: { set(x, y, z) { d.p = [x, y, z]; } },
        scale: { set(x, y, z) { d.sc = [x, y, z]; } },
        rotation: { set(_x, y) { d.ry = y; } },
        quaternion: { identity() { d.look = null; } },
        lookAt(x, y, z) { d.look = [x, y, z]; },
        updateMatrix() { d.matrix = { p: d.p.slice(), sc: d.sc.slice(), ry: d.ry, look: d.look && d.look.slice() }; },
    };
    const halfW = 132 * K, zNear = 2 * TS, zFar = -4 * TS;
    const s = {
        dummy: d, zNear, zFar, baseY: 2 * K, cx: 0, cam: { position: { x: 0, z: 110 * K } },
        brTowerX: halfW + 31.5 * K, parapetX: halfW + 27 * K, valleyX: halfW + K,
        brFloorY: -111 * K, waterY: -106 * K, waterX: halfW * 5,
        reflBuf: f.reflBuf(f.c.ROAD_REFL_POOL), nRefl: 0, reflXSpan: halfW * 3.2, reflZNear: zNear * 0.25, reflZFar: zFar * 0.6,
        brSlots: f.slots(f.c.ROAD_BRIDGE_POOL), brN: 0, brSpans: [{ t0: 60, t1: 82 }],
        brTowers: rec(), brBeacons: rec(), brCables: rec(), water: rec(), refl: rec(),
        reflMat: { color: { v: -1, setRGB(r) { this.v = r; } } },
        brCross: [], brCrossMats: [], mood: { heat: 0, gloom: 0 }, intensity: 0.5,
    };
    for (let i = 0; i < f.c.ROAD_BRIDGE_POOL * 2; i++) {
        s.brCross.push({ visible: false, position: { z: 0 } });
        s.brCrossMats.push({ opacity: -1 });
    }
    s.nRefl = f.layout(7, f.c.ROAD_REFL_POOL, 10, s.reflBuf);
    s.at = (now, lite = false) => {
        s.brN = f.place(s.brSpans, now, TS, zNear / TS, 4, s.brSlots, f.c.ROAD_BRIDGE_POOL);
        f.dress(s, now, lite);
        return s;
    };
    return s;
}

test('_bgRoadUpdateBridgeDress: towers, crossbeams, stays and water per span; Lite keeps none', () => {
    const f = loadDress();
    const { K, TS } = f.c;
    const s = dressRoad(f);
    const stays = f.c.ROAD_BRIDGE_CABLES + f.c.ROAD_BRIDGE_BACKSTAYS;
    // 1.6 s before the near towers: one pair, its crossbeam, its stays.
    s.at(58.8);
    assert.equal(s.brN, 1);
    assert.equal(s.brTowers.count, 2);
    assert.equal(s.brBeacons.count, 2);
    assert.equal(s.brCables.count, 2 * stays);
    assert.equal(s.water.count, 2);
    assert.equal(s.brCross.filter((g) => g.visible).length, 1);
    const tz = -(60.4 - 58.8) * TS;
    for (let i = 0; i < 2; i++) {
        const t = s.brTowers.at[i];
        assert.ok(Math.abs(t.p[2] - tz) < 1e-9, 'tower at the span start + 0.4 s');
        assert.ok(Math.abs(Math.abs(t.p[0]) - s.brTowerX) < 1e-9, 'outside the sidewalk');
        assert.equal(t.p[1], s.brFloorY, 'from the valley floor');
        assert.ok(Math.abs(t.p[1] + t.sc[1] - (s.baseY + f.c.ROAD_BR_TOWER_H)) < 1e-9, 'three lamp posts tall');
    }
    assert.ok(Math.abs(s.brCross[0].position.z - tz) < 1e-9);
    // Every stay runs from its tower down to the parapet on the same side:
    // outside the road, so it never crosses the board on screen.
    for (let i = 0; i < s.brCables.count; i++) {
        const c = s.brCables.at[i];
        assert.ok(c.look, 'aimed');
        const side = Math.sign(c.look[0]);
        assert.ok(Math.abs(c.look[0] - side * s.parapetX) < 1e-9, 'anchored on the parapet line');
        const x0 = 2 * c.p[0] - c.look[0];
        assert.ok(Math.abs(x0 - side * s.brTowerX) < 1e-9, 'tied on at the tower');
        assert.ok(c.look[1] <= s.baseY + 9 * K + 1e-9 && 2 * c.p[1] - c.look[1] > s.baseY + 0.5 * f.c.ROAD_BR_TOWER_H);
        assert.ok(c.sc[2] > 0);
    }
    // On the long bridge's middle: no towers, the water stays.
    s.at(70);
    assert.equal(s.brTowers.count, 0);
    assert.equal(s.brCables.count, 0);
    assert.equal(s.water.count, 2);
    assert.equal(s.brCross.filter((g) => g.visible).length, 0, 'crossbeams hidden again');
    // The far towers come into view no more than the road's length ahead.
    s.at(81.6 - 4.05);
    assert.equal(s.brTowers.count, 0, 'past the far end of the road');
    s.at(81.6 - 3.9);
    assert.equal(s.brTowers.count, 2);
    // Lite: deck and parapets only (drawn elsewhere), none of this.
    s.at(58.8, true);
    assert.equal(s.brTowers.count + s.brCables.count + s.water.count + s.refl.count, 0);
    assert.equal(s.brCross.filter((g) => g.visible).length, 0);
    // No bridge in view: nothing.
    s.at(40);
    assert.equal(s.brN, 0);
    assert.equal(s.brTowers.count + s.brCables.count + s.water.count + s.refl.count, 0);
});

test('_bgRoadUpdateBridgeDress: the crossbeam fades like a gantry sign toward the hit line', () => {
    const f = loadDress();
    const s = dressRoad(f);
    const near = f.c.ROAD_SIGN_NEAR_OPACITY;
    s.at(60.4 - 2.5);
    assert.equal(s.brCrossMats[0].opacity, 1, 'solid well ahead');
    s.at(60.4 - 1);
    const mid = s.brCrossMats[0].opacity;
    assert.ok(mid > near && mid < 1, `easing (${mid})`);
    s.at(60.4);
    assert.ok(Math.abs(s.brCrossMats[0].opacity - near) < 1e-9, 'see-through at the hit line');
    s.at(61);
    assert.ok(Math.abs(s.brCrossMats[0].opacity - near) < 1e-9, 'and past it');
});

test('_bgRoadUpdateBridgeDress: reflections only over the water, upright on screen, brightness by heat and gloom', () => {
    const f = loadDress();
    const { K } = f.c;
    const s = dressRoad(f);
    s.at(70);
    const n = s.refl.count;
    assert.ok(n > f.c.ROAD_REFL_POOL / 2, `most of the river shows mid-bridge (${n})`);
    for (let i = 0; i < n; i++) {
        const r = s.refl.at[i];
        assert.ok(Math.abs(r.p[0]) > s.valleyX + 29 * K, 'beside the road, over the valley');
        assert.ok(Math.abs(r.p[1] - (s.waterY + 0.5 * K)) < 1e-9, 'on the water');
        // Aimed at the camera's foot, so the streak stands upright on screen.
        const want = Math.atan2(r.p[0] - s.cam.position.x, r.p[2] - s.cam.position.z);
        assert.ok(Math.abs(r.ry - want) < 1e-9);
        assert.ok(r.sc[2] > 0);
    }
    // They hold still in z while the water scrolls past (they mirror far lights).
    const z0 = s.refl.at[0].p[2];
    s.at(70.5);
    assert.equal(s.refl.at[0].p[2], z0);
    // Entering: only those over the water (past the ramp's midpoint) show.
    s.at(59.5);
    const few = s.refl.count;
    assert.ok(few < n, `entering (${few} of ${n})`);
    for (let i = 0; i < few; i++) assert.ok(s.refl.at[i].p[2] <= -(60 - 59.5) * f.c.TS + 1e-9);
    // Hot run: a glittering river; gloom: a black one.
    s.mood.heat = 0; s.mood.gloom = 0; s.at(70);
    const calm = s.reflMat.color.v;
    s.mood.heat = 1; s.at(70);
    const hot = s.reflMat.color.v;
    s.mood.gloom = 1; s.at(70);
    const gloomy = s.reflMat.color.v;
    assert.ok(hot > calm && calm > gloomy && gloomy < 0.2, `${calm} ${hot} ${gloomy}`);
});

test('bridge dressing wiring: orders, the gantry pattern, Lite, lamp tint, per-song reflections', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    const num = (name) => Number(src.match(new RegExp(`(?:const |, )${name} = (-?[0-9.]+)[,;]`))[1]);
    // Below or beside the road, drawn before it (the asphalt is -1 and writes no depth).
    assert.ok(num('ROAD_GROUND_ORDER') < num('ROAD_WATER_ORDER'));
    assert.ok(num('ROAD_WATER_ORDER') < num('ROAD_REFL_ORDER'));
    assert.ok(num('ROAD_REFL_ORDER') < -1 && -1 < num('ROAD_DECK_ORDER'));
    assert.match(src, /for \(const m of \[s\.brTowers, s\.brBeacons, s\.brCables\]\) if \(m\) m\.renderOrder = ROAD_GROUND_ORDER;/);
    assert.match(src, /if \(s\.water\) s\.water\.renderOrder = ROAD_WATER_ORDER;/);
    assert.match(src, /if \(s\.refl\) s\.refl\.renderOrder = ROAD_REFL_ORDER;/);
    // The crossbeam is the one bridge part over the board: the gantry pattern.
    assert.match(src, /const g = s\.brCross\[i\];\n\s*g\.renderOrder = 0;\n\s*for \(let c = 0; c < g\.children\.length; c\+\+\) g\.children\[c\]\.renderOrder = ROAD_GANTRY_ORDER;/);
    const build = src.slice(src.indexOf('        road: {\n            build('), src.indexOf('            update(s, bands, dt, t, chart) {'));
    assert.match(build, /const cm = mat\(new T\.MeshBasicMaterial\(\{ color: ROAD_GANTRY_COLOR, transparent: true, depthWrite: false \}\)\);/);
    assert.match(build, /mat\(new T\.MeshBasicMaterial\(\{ color: ROAD_WATER_HEX, depthWrite: false \}\)\)/);
    assert.match(build, /s\.reflMat = mat\(new T\.MeshBasicMaterial\(\{ color: 0xffffff, depthWrite: false \}\)\);/);
    // Lite drops it at once, and update() keeps it so.
    const lite = src.slice(src.indexOf('    function _bgRoadEnterLite('), src.indexOf('    function _bgRoadLeaveLite('));
    assert.match(lite, /s\.brTowers, s\.brBeacons, s\.brCables, s\.water, s\.refl\]\)/);
    assert.match(lite, /s\.brCross\[i\]\.visible = false;/);
    assert.match(src, /const n = lite \? 0 : s\.brN;/);
    assert.match(src, /_bgRoadUpdateBridgeDress\(s, now, lite\);\n    \}/);
    // Lamp heads: a colour per head (white at build), tinted on the bridge,
    // all back to white once it has passed; the pools follow.
    assert.match(build, /s\.beatHeads\.setColorAt\(i, s\.headColor\);\n\s*s\.barHeads\.setColorAt\(i, s\.headColor\);/);
    assert.match(src, /const bm = _bgRoadBridgeMaskAt\(s, slot\.z\);/);
    assert.match(src, /if \(tint\) heads\.setColorAt\(hi, hc\);/);
    assert.match(src, /c\.setRGB\(lr \* a \* tr, lg \* a \* tg, lb \* a \* tb\);/);
    assert.match(src, /\} else if \(s\.headTint\) \{[\s\S]{0,200}for \(let i = 0; i < ROAD_POST_POOL \* 2; i\+\+\)/);
    assert.ok(num('ROAD_BRIDGE_LAMP_R') < 1 && num('ROAD_BRIDGE_LAMP_B') === 1, 'cooler, not darker in blue');
    // Reflections are laid out per song with the skyline (the city's neon).
    const sky = src.slice(src.indexOf('    function _bgRoadLayoutSkyline('), src.indexOf('    function _bgRoadNeonHex('));
    assert.match(sky, /_bgRoadLayoutReflections\(s\);\n    \}/);
    assert.match(src, /s\.tmpColor\.setHex\(_bgRoadNeonHex\(i, seed\)\);/);
    // Torn down with the road.
    assert.match(src, /s\.brTowers = s\.brBeacons = s\.brCables = s\.water = s\.refl = s\.reflMat = null;/);
    assert.match(src, /s\.brCross\.length = 0;/);
});
