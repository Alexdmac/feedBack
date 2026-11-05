// The user's frame-rate cap ("FPS cap" in Player > Visualization & quality).
// The pacing helpers are pure (static/js/highway-framecap.js), so they run
// here for real; the draw() loop is too heavy for a vm sandbox, so — like
// highway_pause_throttle.test.js — its wiring is pinned at source level.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function extractBlock(src, signature) {
    const start = src.indexOf(signature);
    assert.ok(start !== -1, `signature '${signature}' not found`);
    const open = src.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
    }
    throw new Error(`unbalanced braces after '${signature}'`);
}

const constantsSrc = read('static/js/highway-constants.js');
function constant(name) {
    const m = constantsSrc.match(new RegExp(`export const ${name} = ([0-9.]+);`));
    assert.ok(m, `${name} must be an exported literal in highway-constants.js`);
    return Number(m[1]);
}
const MIN = constant('_MAX_FPS_MIN');
const MAX = constant('_MAX_FPS_MAX');
const SLACK = constant('_FPS_CAP_SLACK_MS');

const capSrc = read('static/js/highway-framecap.js');
const { _sanitizeMaxFps, _frameCapNext } = new Function('_MAX_FPS_MIN', '_MAX_FPS_MAX',
    '"use strict";' + extractBlock(capSrc, 'function _sanitizeMaxFps') + '\n'
    + extractBlock(capSrc, 'function _frameCapNext')
    + '\nreturn { _sanitizeMaxFps, _frameCapNext };')(MIN, MAX);

// Drive the cap at `hz` for `secs`, with optional per-tick jitter (ms).
// Returns how many ticks drew.
function simulate(cap, hz, secs, jitter = () => 0) {
    const iv = 1000 / cap;
    let last = 0;
    let drawn = 0;
    const ticks = Math.round(secs * hz);
    for (let i = 1; i <= ticks; i++) {
        const ts = 1000 + (i * 1000) / hz + jitter(i);
        const next = _frameCapNext(last, ts, iv, SLACK);
        if (Number.isNaN(next)) continue;
        last = next;
        drawn++;
    }
    return drawn;
}

test('constants: the cap range and slack are exported literals, and the count comment is honest', () => {
    assert.equal(MIN, 20);
    assert.equal(MAX, 360);
    assert.equal(SLACK, 1);
    const count = (constantsSrc.match(/^export const /gm) || []).length;
    const said = Number((constantsSrc.match(/These (\d+) are pure literals/) || [])[1]);
    assert.equal(said, count, 'update the "These N are pure literals" comment');
});

test('_sanitizeMaxFps: off for empty or bad input, whole numbers clamped into range', () => {
    for (const v of [null, undefined, '', 'x', NaN, Infinity, -Infinity, 0, -30, '0']) {
        assert.equal(_sanitizeMaxFps(v), 0, `${String(v)} is off`);
    }
    assert.equal(_sanitizeMaxFps('60'), 60);
    assert.equal(_sanitizeMaxFps(59.6), 60);
    assert.equal(_sanitizeMaxFps(10), MIN);
    assert.equal(_sanitizeMaxFps(1000), MAX);
    assert.equal(_sanitizeMaxFps(144), 144);
});

test('_frameCapNext: a cap equal to the display rate draws every frame, even with jitter', () => {
    assert.equal(simulate(60, 60, 10), 600);
    const wobble = (i) => ((i * 7919) % 11) / 10 - 0.5;   // +-0.5 ms, deterministic
    assert.equal(simulate(60, 60, 10, wobble), 600);
    // A panel a hair faster than the cap never drifts into skipping a vsync.
    assert.ok(simulate(60, 60.05, 60) >= 3600);
});

test('_frameCapNext: caps that do not divide the refresh still average the cap', () => {
    const d = simulate(60, 144, 10);
    assert.ok(Math.abs(d - 600) <= 3, `60 on 144 Hz: ${d} in 10 s`);
    const e = simulate(30, 60, 10);
    assert.ok(Math.abs(e - 300) <= 1, `30 on 60 Hz: ${e} in 10 s`);
    const f = simulate(120, 144, 10);
    assert.ok(Math.abs(f - 1200) <= 3, `120 on 144 Hz: ${f} in 10 s`);
    // A cap above the refresh changes nothing.
    assert.equal(simulate(120, 60, 10), 600);
});

test('_frameCapNext: too early waits; a long gap or clock oddity resyncs without a burst', () => {
    const iv = 1000 / 60;
    assert.ok(Number.isNaN(_frameCapNext(1000, 1005, iv, SLACK)), 'too early');
    assert.equal(_frameCapNext(1000, 1000 + iv - 0.5, iv, SLACK), 1000 + iv - 0.5, 'early within slack snaps to now');
    assert.equal(_frameCapNext(1000, 1000 + iv + 3, iv, SLACK), 1000 + iv, 'late stays on the grid');
    assert.equal(_frameCapNext(1000, 5000, iv, SLACK), 5000, 'a hitch resyncs to now');
    assert.equal(_frameCapNext(5000, 1000, iv, SLACK), 1000, 'time going backwards resyncs');
    assert.equal(_frameCapNext(0, 123456, iv, SLACK), 123456, 'the first frame resyncs');
    // After a hitch, the next frame waits a full interval again (no catch-up).
    const after = _frameCapNext(1000, 5000, iv, SLACK);
    assert.ok(Number.isNaN(_frameCapNext(after, after + 5, iv, SLACK)));
});

const highwaySrc = read('static/highway.js');
const draw = extractBlock(highwaySrc, 'function draw()');

test('draw(): the cap runs after the ready gate, before the paused throttle, and commits only a drawn frame', () => {
    const ready = draw.search(/if\s*\(\s*!hwState\.ready\s*\)\s*return;/);
    const cap = draw.indexOf('_frameCapNext(');
    const paused = draw.indexOf('_PAUSED_FRAME_INTERVAL_MS');
    const commit = draw.indexOf('if (!Number.isNaN(_capNext)) hwState._capLastTs = _capNext;');
    const render = draw.search(/_renderer\.draw\s*\(/);
    assert.ok(ready > 0 && cap > ready, 'cap after the ready gate');
    assert.ok(paused > cap, 'cap before the paused throttle');
    assert.ok(commit > paused && commit < render, 'slot committed after the throttle, before the draw');
    assert.match(draw, /const _capTs = arguments\[0\];/, 'paced on the rAF timestamp');
    assert.match(draw, /if \(typeof _capTs === 'number'\)/, 'the direct first call is not capped');
    assert.match(draw, /if \(Number\.isNaN\(_capNext\)\) return;/);
    assert.match(draw, /_capTs - hwState\._capFlagAt > 500/, 'follows the shared setting about twice a second');
    assert.match(draw, /localStorage\.getItem\('highwayMaxFps'\)/);
});

test('api: setMaxFps sanitizes, resyncs and persists; stop() resyncs; the bundle carries the cap', () => {
    const set = extractBlock(highwaySrc, 'setMaxFps(fps)');
    assert.match(set, /if \(!Number\.isFinite\(Number\(fps\)\)\) return;/);
    assert.match(set, /hwState\._maxFps = _sanitizeMaxFps\(fps\);/);
    assert.match(set, /hwState\._capLastTs = 0;/);
    assert.match(set, /localStorage\.setItem\('highwayMaxFps', String\(hwState\._maxFps\)\)/);
    assert.match(set, /hwState\._capFlagAt = Infinity;/, 'unwritable storage keeps the chosen value');
    assert.doesNotMatch(set, /resize\(/, 'a cap changes cadence, not size');
    assert.match(highwaySrc, /getMaxFps\(\) \{ return hwState\._maxFps; \},/);
    assert.match(highwaySrc, /b\.maxFps = hwState\._maxFps;/);
    assert.match(highwaySrc, /hwState\._capLastTs = 0;[^\n]*\n\s*if \(hwState\._capFlagAt !== Infinity\) hwState\._capFlagAt = 0;/);
    // Draw budgets stretch under a cap below 60 so render scale doesn't drop for nothing.
    const k = extractBlock(highwaySrc, 'function _drawBudgetScale()');
    assert.match(k, /c > 0 && c < 60 \? Math\.min\(2, 60 \/ c\) : 1/);
});

test('ui: the FPS cap control exists and session hydration is guarded', () => {
    const html = read('static/v3/index.html');
    assert.match(html, /id="max-fps-select"/);
    assert.match(html, /highway\.setMaxFps && highway\.setMaxFps\(parseInt\(this\.value, 10\)\)/);
    for (const v of ['0', '120', '60', '30']) assert.match(html, new RegExp(`<option value="${v}"`));
    const session = read('static/js/session.js');
    assert.match(session, /max-fps-select/);
    assert.match(session, /getMaxFps/);
});
