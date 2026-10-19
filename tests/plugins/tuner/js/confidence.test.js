'use strict';

// Confidence meter + tuning history (ported from Trace Tuner): the YIN worker's
// confidence computation and the pure helpers in utils/insights.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { _yinDetect, _yinConfidence } = require('../../../../plugins/tuner/workers/yin.js');
const insights = require('../../../../plugins/tuner/utils/insights.js');

const SAMPLE_RATE = 44100;
const FRAME = 4096;

function sine(freq, n = FRAME, amplitude = 0.8) {
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = amplitude * Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE);
    return buf;
}

// Deterministic white noise (LCG) so the test is reproducible.
function noise(n = FRAME, amplitude = 0.5) {
    const buf = new Float32Array(n);
    let seed = 12345;
    for (let i = 0; i < n; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buf[i] = amplitude * ((seed / 0x7fffffff) * 2 - 1);
    }
    return buf;
}

// ── _yinConfidence ───────────────────────────────────────────────────────────

test('_yinConfidence is 1 - CMNDF, clamped to 0..1', () => {
    assert.equal(_yinConfidence(0), 1);
    assert.equal(_yinConfidence(1), 0);
    assert.ok(Math.abs(_yinConfidence(0.15) - 0.85) < 1e-9);
    assert.equal(_yinConfidence(-0.2), 1, 'negative CMNDF clamps to 1');
    assert.equal(_yinConfidence(1.7), 0, 'CMNDF above 1 clamps to 0');
});

test('_yinConfidence maps non-finite input to 0', () => {
    assert.equal(_yinConfidence(NaN), 0);
    assert.equal(_yinConfidence(Infinity), 0);
    assert.equal(_yinConfidence(undefined), 0);
});

// ── _yinDetect confidence ────────────────────────────────────────────────────

test('clean sine reports high confidence', () => {
    for (const f of [82.41, 110, 196, 329.63]) {
        const r = _yinDetect(sine(f), SAMPLE_RATE);
        assert.ok(r.confidence > 0.9, `${f} Hz: confidence ${r.confidence}`);
        assert.ok(r.confidence <= 1);
    }
});

test('white noise reports lower confidence than a clean tone', () => {
    const tone = _yinDetect(sine(110), SAMPLE_RATE);
    const hiss = _yinDetect(noise(), SAMPLE_RATE);
    assert.ok(hiss.confidence >= 0 && hiss.confidence <= 1, `in range: ${hiss.confidence}`);
    assert.ok(hiss.confidence < 0.5, `noise confidence ${hiss.confidence}`);
    assert.ok(tone.confidence > hiss.confidence);
});

test('a tone buried in noise sits between the two', () => {
    const tone = sine(110, FRAME, 0.5);
    const hiss = noise(FRAME, 0.35);
    const mixed = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i++) mixed[i] = tone[i] + hiss[i];
    const clean = _yinDetect(sine(110), SAMPLE_RATE).confidence;
    const noisy = _yinDetect(mixed, SAMPLE_RATE).confidence;
    const pure = _yinDetect(noise(), SAMPLE_RATE).confidence;
    assert.ok(noisy < clean, `noisy ${noisy} < clean ${clean}`);
    assert.ok(noisy > pure, `noisy ${noisy} > noise ${pure}`);
});

test('silence reports zero confidence', () => {
    assert.equal(_yinDetect(new Float32Array(FRAME), SAMPLE_RATE).confidence, 0);
});

// ── insights helpers ─────────────────────────────────────────────────────────

test('smoothConfidence moves toward the new value, faster upward', () => {
    const up = insights.smoothConfidence(0, 1);
    const down = 1 - insights.smoothConfidence(1, 0);
    assert.ok(up > 0 && up < 1);
    assert.ok(up > down, 'rises faster than it falls');
    assert.equal(insights.smoothConfidence(NaN, 2), 0.6, 'inputs are clamped');
});

test('confidenceColor ramps from slate to the accent blue', () => {
    assert.equal(insights.confidenceColor(0), 'rgb(64,78,96)');
    assert.equal(insights.confidenceColor(1), 'rgb(64,128,224)');
    assert.equal(insights.confidenceColor(5), 'rgb(64,128,224)');
});

test('centsToY maps 0 to the centre and clamps to the range', () => {
    assert.equal(insights.centsToY(0, 56), 28);
    assert.equal(insights.centsToY(50, 56), 0);
    assert.equal(insights.centsToY(-50, 56), 56);
    assert.equal(insights.centsToY(400, 56), 0);
});

test('low-confidence or non-finite frames are gaps, not points', () => {
    assert.equal(insights.isHistoryPoint(3, 0.95), true);
    assert.equal(insights.isHistoryPoint(3, 0.2), false);
    assert.equal(insights.isHistoryPoint(NaN, 0.95), false);
    assert.equal(insights.isHistoryPoint(null, 0.95), false);
});

test('history ring records points, gaps, and wraps oldest-first', () => {
    const h = insights.createHistory(4);
    h.push(1, 0.9, 110);
    h.push(5, 0.1, 110);   // low confidence → gap
    h.push(-2, 0.95, 110);
    assert.ok(Number.isNaN(h.at(0).cents), 'unfilled slots are gaps');
    assert.equal(h.at(1).cents, 1);
    assert.ok(Number.isNaN(h.at(2).cents), 'low-confidence frame is a gap');
    assert.equal(h.at(3).cents, -2);
    h.push(4, 0.9, 110);
    h.push(6, 0.9, 110);   // wraps: oldest (the 1) drops off
    assert.deepEqual([0, 1, 2, 3].map((i) => h.centsAt(i)).map((v) => (Number.isNaN(v) ? null : v)), [null, -2, 4, 6]);
    h.clear();
    assert.ok([0, 1, 2, 3].every((i) => Number.isNaN(h.centsAt(i))));
});

test('pointsConnect breaks on target change, gaps, and big jumps', () => {
    const p = (cents, target = 110) => ({ cents, target });
    assert.equal(insights.pointsConnect(p(2), p(5)), true);
    assert.equal(insights.pointsConnect(p(2), p(5, 146.83)), false, 'different target');
    assert.equal(insights.pointsConnect(p(-20), p(20)), false, '40-cent jump');
    assert.equal(insights.pointsConnect(p(NaN), p(5)), false, 'gap');
    assert.equal(insights.pointsConnect(null, p(5)), false);
});

test('loadPrefs defaults to showing both when storage is unavailable', () => {
    assert.deepEqual(insights.loadPrefs(), { showConfidence: true, showHistory: true });
});
