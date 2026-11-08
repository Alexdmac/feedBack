// Night road lyrics: words painted on the asphalt beside the highway.
//
// The pure layout lives in screen.js's road placement block (the same block
// tests/road.test.js slices out): words from the chart's syllables, the frets
// the highway uses, where each word is painted and how lit it is. This file
// slices that block and evaluates it in a bare context (no THREE, no DOM),
// then checks the wiring in screen.js / settings.html by source.

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
    assert.ok(a >= 0 && b > a, 'road placement markers missing from screen.js');
    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(src.slice(a, b) +
        '\nthis._roadLyricWords = _roadLyricWords;' +
        '\nthis._roadLyricBusy = _roadLyricBusy;' +
        '\nthis._roadLyricLayout = _roadLyricLayout;' +
        '\nthis._roadLyricGlow = _roadLyricGlow;' +
        '\nthis._roadLowerBy = _roadLowerBy;' +
        '\nthis.ROAD_LYRIC_LINE_GAP_S = ROAD_LYRIC_LINE_GAP_S;', sandbox);
    return sandbox;
}
const R = load();

// Plain data in, plain data out (the sandbox's arrays are another realm's).
const plain = (v) => JSON.parse(JSON.stringify(v));

// laneBoundsFromAnchor's rule: fret f, width w -> wires f-1 .. f+w-1.
const boundsOf = (a) => (a ? { dMin: Math.max(0, a.fret - 1), dMax: Math.min(24, a.fret + a.width - 1) } : null);

// --- words ---------------------------------------------------------------------

test('words: syllables join on "-", lines end on "+", text is upper-cased road paint', () => {
    const words = plain(R._roadLyricWords([
        { t: 1.0, d: 0.2, w: 'Can' },
        { t: 1.3, d: 0.1, w: 'an-' },
        { t: 1.45, d: 0.1, w: 'y-' },
        { t: 1.6, d: 0.3, w: 'one+' },
        { t: 2.2, d: 0.2, w: '﻿I\'ve' },
        { t: 2.5, d: 0.2, w: 'done+' },
    ]));
    assert.deepEqual(words.map((w) => w.text), ['CAN', 'ANYONE', "I'VE", 'DONE']);
    assert.deepEqual(words.map((w) => w.line), [true, false, true, false]);
    // A joined word runs from its first syllable to the end of its last.
    assert.equal(words[1].t, 1.3);
    assert.ok(Math.abs(words[1].end - 1.9) < 1e-9);
});

test('words: a long pause starts a new line; empty tokens and bad times are skipped', () => {
    const words = plain(R._roadLyricWords([
        { t: 0, d: 0.5, w: 'one' },
        { t: 0.6, d: 0.2, w: '' },
        { t: NaN, d: 0.2, w: 'bad' },
        { t: 0.9, d: 0.2, w: 'two' },
        { t: 0.9 + 0.2 + R.ROAD_LYRIC_LINE_GAP_S + 0.1, d: 0.2, w: 'three' },
    ]));
    assert.deepEqual(words.map((w) => w.text), ['ONE', 'TWO', 'THREE']);
    assert.deepEqual(words.map((w) => w.line), [true, false, true]);
    assert.deepEqual(plain(R._roadLyricWords(null)), []);
    assert.deepEqual(plain(R._roadLyricWords([])), []);
});

test('words: a token that is only "+" still ends the line', () => {
    const words = plain(R._roadLyricWords([
        { t: 0, d: 0.2, w: 'hey' },
        { t: 0.3, d: 0.1, w: '+' },
        { t: 0.5, d: 0.2, w: 'you' },
    ]));
    assert.deepEqual(words.map((w) => [w.text, w.line]), [['HEY', true], ['YOU', true]]);
});

// --- busy frets ------------------------------------------------------------------

test('busy: the anchor in force at t0, later anchors in the window, notes and live sustains', () => {
    const anchors = [{ time: 0, fret: 5, width: 4 }, { time: 10, fret: 12, width: 4 }];
    const out = { dMin: 0, dMax: 0 };
    // Only the first anchor: wires 4..8.
    assert.deepEqual(plain(R._roadLyricBusy(anchors, [], [], 2, 3, boundsOf, out)), { dMin: 4, dMax: 8 });
    // A window reaching the second anchor covers both lanes.
    assert.deepEqual(plain(R._roadLyricBusy(anchors, [], [], 9, 11, boundsOf, out)), { dMin: 4, dMax: 15 });
    // A note outside the lane widens it; an open string does not.
    const notes = [{ t: 2.5, f: 2, s: 0 }, { t: 2.6, f: 0, s: 1 }];
    assert.deepEqual(plain(R._roadLyricBusy(anchors, notes, [], 2, 3, boundsOf, out)), { dMin: 1, dMax: 8 });
    // A sustain that started before the window still lies in it...
    const held = [{ t: 0.5, f: 17, sus: 3, s: 0 }];
    assert.deepEqual(plain(R._roadLyricBusy(anchors, held, [], 2, 3, boundsOf, out)), { dMin: 4, dMax: 17 });
    // ...one that ended before it does not.
    const done = [{ t: 0.5, f: 17, sus: 1, s: 0 }];
    assert.deepEqual(plain(R._roadLyricBusy(anchors, done, [], 2, 3, boundsOf, out)), { dMin: 4, dMax: 8 });
    // Chord notes count at the chord's time.
    const chords = [{ t: 2.2, notes: [{ s: 0, f: 3 }, { s: 1, f: 20 }] }];
    assert.deepEqual(plain(R._roadLyricBusy(anchors, [], chords, 2, 3, boundsOf, out)), { dMin: 2, dMax: 20 });
    // Nothing at all: null.
    assert.equal(R._roadLyricBusy([], [], [], 2, 3, boundsOf, out), null);
});

// --- layout ------------------------------------------------------------------------

// A 24-fret road 2.4 wide (0.1 per fret), letters 0.1 per cap height.
const TS = 1.725;
function opts(extra) {
    return Object.assign({
        roadLo: 0, roadHi: 2.4, em: 0.1, depth: 0.26, ts: TS, gapS: 0.05, padS: 0.15,
        gap: 0.05, edge: 0.02, space: 0.45, minScale: 0.55,
        measure: (s) => s.length * 0.6,   // 0.6 cap heights a letter
        laneKey: () => 0,
    }, extra || {});
}
// Busy frets from a list of [t0, t1, lo, hi] spans in world x.
function busyFrom(spans) {
    const box = { lo: 0, hi: 0 };
    return (t0, t1) => {
        let lo = Infinity, hi = -Infinity;
        for (const [a, b, l, h] of spans) {
            if (b < t0 || a > t1) continue;
            lo = Math.min(lo, l); hi = Math.max(hi, h);
        }
        if (!(hi >= lo)) return null;
        box.lo = lo; box.hi = hi;
        return box;
    };
}
const W = (text, t, line = false, end = t + 0.2) => ({ text, t, end, line });

test('layout: each word is painted where it is sung, on the open side, against the lane', () => {
    // Lane on the right (frets 15..19 = x 1.5..1.9): the left is open.
    const busy = busyFrom([[0, 100, 1.5, 1.9]]);
    const pl = plain(R._roadLyricLayout([W('IT', 1, true), W('BRINGS', 1.5), W('ME', 2), W('DOWN', 2.5)], busy, opts()));
    assert.equal(pl.length, 4);
    for (const p of pl) {
        assert.equal(p.tp, p.t, 'its row starts when it is sung');
        // Right-aligned against the lane's left edge, minus the gap.
        assert.ok(Math.abs((p.x + p.w / 2) - (1.5 - 0.05)) < 1e-9);
        assert.ok(Math.abs(p.w - p.text.length * 0.6 * 0.1) < 1e-9);
        assert.ok(Math.abs(p.d - 0.26) < 1e-9);
    }
});

test('layout: the open side is the one with more room (Alex: right busy, left open)', () => {
    // Lane on the left (frets 3..7): the right is open; text starts past the lane.
    const pl = plain(R._roadLyricLayout([W('HEAVY', 1, true)], busyFrom([[0, 100, 0.3, 0.7]]), opts()));
    assert.ok(Math.abs((pl[0].x - pl[0].w / 2) - (0.7 + 0.05)) < 1e-9);
});

test('layout: words sung too close together share a row, left to right', () => {
    const busy = busyFrom([[0, 100, 1.5, 1.9]]);
    // Rows last 0.26 / TS + 0.05 s; 'ALL' and 'YOUR' come sooner.
    const pl = plain(R._roadLyricLayout([W('AND', 1, true), W('ALL', 1.05), W('YOUR', 1.1), W('WEIGHT', 2)], busy, opts()));
    assert.deepEqual(pl.map((p) => p.tp), [1, 1, 1, 2]);
    assert.ok(pl[0].x < pl[1].x && pl[1].x < pl[2].x, 'reads left to right');
    // The shared row still ends against the lane.
    assert.ok(Math.abs((pl[2].x + pl[2].w / 2) - 1.45) < 1e-9);
    // Gaps between words are `space` cap heights.
    assert.ok(Math.abs((pl[1].x - pl[1].w / 2) - (pl[0].x + pl[0].w / 2) - 0.045) < 1e-9);
});

test('layout: a new line never joins the previous row; a full row pushes the word to the next row', () => {
    const busy = busyFrom([[0, 100, 1.5, 1.9]]);
    let pl = plain(R._roadLyricLayout([W('ONE', 1, true), W('TWO', 1.05, true)], busy, opts()));
    const rowS = 0.26 / TS + 0.05;
    assert.equal(pl[0].tp, 1);
    assert.ok(Math.abs(pl[1].tp - (1 + rowS)) < 1e-9, 'next free row, a little late');
    // Room on the left is 1.43; 22 letters (1.32) leave no room for ' XYZ' (0.225).
    pl = plain(R._roadLyricLayout([W('ABCDEFGHIJKLMNOPQRSTUV', 1, true), W('XYZ', 1.02)], busy, opts()));
    assert.equal(pl[0].tp, 1);
    assert.ok(Math.abs(pl[1].tp - (1 + rowS)) < 1e-9);
});

test('layout: when the lane changes, the next line crosses to the side with more room', () => {
    // Lane right until t 5, then left.
    const busy = busyFrom([[0, 5, 1.5, 1.9], [5, 100, 0.3, 0.7]]);
    const laneKey = (t) => (t < 5 ? 1 : 2);
    const pl = plain(R._roadLyricLayout([W('LEFT', 1, true), W('RIGHT', 6, true)], busy, opts({ laneKey })));
    assert.ok(pl[0].x < 1.5, 'first line on the left');
    assert.ok(pl[1].x - pl[1].w / 2 >= 0.7 + 0.05 - 1e-9, 'next line on the right');
});

test('layout: same lane, same side, even if the other side grows', () => {
    // The busy span drifts right but the anchor lane (laneKey) is unchanged:
    // the line stays put while its side still fits.
    const busy = busyFrom([[0, 5, 1.0, 1.4], [5, 100, 1.2, 1.4]]);
    const pl = plain(R._roadLyricLayout([W('A', 1, true), W('B', 6, true)], busy, opts()));
    // First: left (1.0 - 0.02 - 0.05 = 0.93 room vs right 0.93 room -> right
    // only when strictly larger), so check both on the same side.
    assert.equal(Math.sign(pl[0].x - 1.2), Math.sign(pl[1].x - 1.3));
});

test('layout: mid-line, a word crosses over only when its side has no room', () => {
    // Lane moves left mid-line, leaving no room on the left.
    const busy = busyFrom([[0, 2, 1.5, 1.9], [2, 100, 0.05, 0.4]]);
    const laneKey = (t) => (t < 2 ? 1 : 2);
    const pl = plain(R._roadLyricLayout([W('ON', 1, true), W('THE', 3), W('ROAD', 4)], busy, opts({ laneKey })));
    assert.ok(pl[0].x < 1.5);
    assert.ok(pl[1].x > 0.4 && pl[2].x > 0.4, 'moved right: the left has no room');
});

test('layout: a word too wide for the room shrinks; one that fits nowhere is left out', () => {
    // Lane in the middle: 0.85 room each side (0.02 edge, 0.05 gap).
    const busy = busyFrom([[0, 100, 0.92, 1.48]]);
    let pl = plain(R._roadLyricLayout([W('SUPERCALIFRAGILISTIC', 1, true)], busy, opts()));   // 20 letters = 1.2
    assert.equal(pl.length, 1);
    assert.ok(pl[0].w <= 0.85 + 1e-9);
    assert.ok(Math.abs(pl[0].d - 0.26 * pl[0].w / 1.2) < 1e-9, 'depth shrinks with it');
    // 40 letters = 2.4 > 0.85 / 0.55: left out; the next word still lays out.
    pl = plain(R._roadLyricLayout([W('X'.repeat(40), 1, true), W('OK', 3)], busy, opts()));
    assert.deepEqual(pl.map((p) => p.text), ['OK']);
});

test('layout: with nothing busy, rows sit centred on the road', () => {
    const pl = plain(R._roadLyricLayout([W('SOLO', 1, true)], () => null, opts()));
    assert.ok(Math.abs(pl[0].x - 1.2) < 1e-9);
});

test('layout: placements come out in row-time order', () => {
    const busy = busyFrom([[0, 100, 1.5, 1.9]]);
    const words = [];
    for (let i = 0; i < 60; i++) words.push(W('W' + i, i * 0.07, i % 8 === 0));
    const pl = plain(R._roadLyricLayout(words, busy, opts()));
    for (let i = 1; i < pl.length; i++) assert.ok(pl[i].tp >= pl[i - 1].tp);
    // _roadLowerBy finds the window's first row.
    const i0 = R._roadLowerBy(pl, 'tp', 2);
    assert.ok(pl[i0].tp >= 2 && (i0 === 0 || pl[i0 - 1].tp < 2));
});

// --- glow ---------------------------------------------------------------------------

test('glow: lights as the word starts, holds while sung, fades after', () => {
    assert.equal(R._roadLyricGlow(0.5, 1, 1.5), 0);
    assert.ok(R._roadLyricGlow(0.97, 1, 1.5) > 0 && R._roadLyricGlow(0.97, 1, 1.5) < 1);
    assert.equal(R._roadLyricGlow(1, 1, 1.5), 1);
    assert.equal(R._roadLyricGlow(1.5, 1, 1.5), 1);
    assert.ok(R._roadLyricGlow(1.7, 1, 1.5) > 0 && R._roadLyricGlow(1.7, 1, 1.5) < 1);
    assert.equal(R._roadLyricGlow(3, 1, 1.5), 0);
    // A very short word still glows a moment.
    assert.equal(R._roadLyricGlow(1.15, 1, 1.01), 1);
    assert.equal(R._roadLyricGlow(NaN, 1, 1.5), 0);
});

// --- wiring ---------------------------------------------------------------------------

test('wiring: setting, chart fields, banner hidden on the road, update and teardown', () => {
    const src = fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
    assert.match(src, /bridges: true, roadLyrics: true \};/);
    assert.match(src, /'bridges', 'roadLyrics'\]\);/);
    assert.match(src, /window\.h3dBgSetRoadLyrics\s*= \(v\) => _bgWriteGlobal\('roadLyrics', !!v\);/);
    assert.match(src, /_bgRoadLyricsOn\s*= _bgReadSetting\(panelKey, 'roadLyrics'\);/);
    // The player's Lyrics switch and the setting both gate the paint.
    assert.match(src, /_bgChart\.lyrics = _bgRoadLyricsOn && bundle\.lyricsVisible \? bundle\.lyrics : null;/);
    assert.match(src, /_bgChart\.notes = bundle\.notes;/);
    assert.match(src, /_bgChart\.chords = bundle\.chords;/);
    // The setting applies live (a flag flip, no rebuild).
    assert.match(src, /changedKey === 'roadLyrics'\) \{\n\s*\/\/ Flag flips don't need a mesh rebuild/);
    // The banner hides while the road shows the lyrics.
    assert.match(src, /const _lyrOnRoad = _bgRoadLyricsOn && bgMountedStyleId === 'road' && !!bgState;/);
    assert.match(src, /if \(bundle\.lyricsVisible && bundle\.lyrics\?\.length && !_lyrOnRoad\) \{/);
    // Updated every frame before the road's early return (no beats).
    const upd = src.indexOf('                _bgRoadUpdateLyrics(s, chart);');
    assert.ok(upd > 0 && upd < src.indexOf('                if (n === 0) {\n                    if (s.shown !== 0) {'));
    // Over the board, under the notes; textures freed with the road.
    assert.match(src, /s\.lyrPaint\[i\]\.renderOrder = ROAD_LYRIC_ORDER;/);
    assert.match(src, /for \(let i = 0; i < s\.lyrTex\.length; i\+\+\) s\.lyrTex\[i\]\.dispose\(\);/);
    const html = fs.readFileSync(path.join(__dirname, '..', 'settings.html'), 'utf8');
    assert.match(html, /id="h3d-bg-road-lyrics"[\s\S]{0,200}window\.h3dBgSetRoadLyrics\(this\.checked\)/);
    assert.match(html, /localStorage\.getItem\('h3d_bg_roadLyrics'\)/);
});
