// Pins the Neck size setting in plugins/highway_3d/screen.js.
//
// One device-wide multiplier (100-160%) on the string gap, the strings and the
// note gems, so approaching notes read bigger. It is easy to half-break in a
// way that still "looks fine" at the default 100%:
//   * a size that no longer scales (a `let` turned back into a `const`, or a
//     new draw path that hard-codes 4 * K for the string gap);
//   * a panel that changes the module sizes but keeps gems built at the old
//     size (pooled meshes share gNote / gNoteGrad / the ghost rim, so those
//     must be resized in place, not rebuilt);
//   * the board / road sliding when the gems grow (the board plane is pinned
//     to the 100% gem height on purpose, so the road never remounts).
//
// The pure parts (clamp, apply, setter) and _syncNeckSize are sliced out of
// the real source and run; the wiring is pinned at source level, same as the
// other tests/js/ files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const SCREEN_JS = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'screen.js');
const SETTINGS_HTML = path.join(__dirname, '..', '..', 'plugins', 'highway_3d', 'settings.html');
const THREE_JS = path.join(__dirname, '..', '..', 'static', 'vendor', 'three', 'three.module.min.js');
const K = 0.0075;

function src() {
    return fs.readFileSync(SCREEN_JS, 'utf8').replace(/\r\n/g, '\n');
}

// Evaluate the module-level size block (base constants -> setter) against a
// localStorage stub. Returns the live bindings through getters.
function loadSizes(stored) {
    const s = src();
    const a = s.indexOf('    const STR_THICK_BASE = 0.25 * K;');
    const b = s.indexOf('    let FRET_TUBE_RADIUS = STR_THICK_BASE * 0.75;');
    const c = s.indexOf('    const S_GAP_BASE = 4 * K;');
    const d = s.indexOf('    const NW_BASE = 5 * K, NH_BASE = 3 * K, ND_BASE = 0.25 * K;');
    const e = s.indexOf('    let BEND_HALFSTEP_WORLD_Y = S_GAP_BASE * 0.8;');
    const endMark = '        _bgEmitChange(\'neckSize\');\n    };\n';
    const f = s.indexOf(endMark, e);
    for (const [name, i] of Object.entries({ a, b, c, d, e, f })) {
        assert.notEqual(i, -1, `neck-size slice marker ${name} not found in screen.js`);
    }
    const lineAt = (i) => s.slice(i, s.indexOf('\n', i) + 1);
    const block = s.slice(a, s.indexOf('\n', a) + 1)      // STR_THICK_BASE + let STR_THICK
        + lineAt(s.indexOf('    let STR_THICK = STR_THICK_BASE;'))
        + lineAt(b) + lineAt(c) + lineAt(s.indexOf('    let S_GAP = S_GAP_BASE;'))
        + lineAt(d) + lineAt(s.indexOf('    let NW = NW_BASE, NH = NH_BASE, ND = ND_BASE;'))
        + s.slice(e, f + endMark.length);
    const storage = new Map();
    if (stored !== undefined) storage.set('highway_3d.neckSize', stored);
    const emitted = [];
    const sandbox = {
        K,
        localStorage: {
            getItem: (k) => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v)),
        },
        window: {},
        _bgEmitChange: (key) => emitted.push(key),
    };
    vm.createContext(sandbox);
    vm.runInContext(block + `
        globalThis.__api = {
            get m() { return _h3dNeckSize; },
            get S_GAP() { return S_GAP; }, get NW() { return NW; }, get NH() { return NH; }, get ND() { return ND; },
            get STR_THICK() { return STR_THICK; }, get FRET_TUBE_RADIUS() { return FRET_TUBE_RADIUS; },
            get BEND() { return BEND_HALFSTEP_WORLD_Y; },
            clamp: _h3dClampNeckSize,
        };`, sandbox);
    return { api: sandbox.__api, window: sandbox.window, storage, emitted };
}

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-12, `${msg}: ${a} vs ${b}`);
// Geometry lives in Float32 buffers: compare to ~7 significant digits.
const nearF = (a, b, msg) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.abs(b), `${msg}: ${a} vs ${b}`);

test('with nothing stored the sizes are today\'s look (100%)', () => {
    const { api, window } = loadSizes();
    assert.equal(api.m, 1);
    near(api.S_GAP, 4 * K, 'string gap');
    near(api.NW, 5 * K, 'gem width'); near(api.NH, 3 * K, 'gem height'); near(api.ND, 0.25 * K, 'gem depth');
    near(api.STR_THICK, 0.25 * K, 'string thickness');
    near(api.FRET_TUBE_RADIUS, 0.25 * K * 0.75, 'fret wire radius');
    near(api.BEND, 4 * K * 0.8, 'bend half-step');
    assert.equal(window.h3dGetNeckSize(), 1);
});

test('a stored size scales the gaps, gems and strings together', () => {
    const { api } = loadSizes('1.3');
    assert.equal(api.m, 1.3);
    near(api.S_GAP, 4 * K * 1.3, 'string gap');
    near(api.NW, 5 * K * 1.3, 'gem width'); near(api.NH, 3 * K * 1.3, 'gem height'); near(api.ND, 0.25 * K * 1.3, 'gem depth');
    // Strings thicken faster than the rest (1 + 2*(m-1)); frets only follow the gaps.
    near(api.STR_THICK, 0.25 * K * 1.6, 'string thickness');
    near(api.FRET_TUBE_RADIUS, 0.25 * K * 0.75 * 1.3, 'fret wire radius');
    near(api.BEND, api.S_GAP * 0.8, 'bend half-step follows the gap');
});

test('stored values are clamped to 100-160% in whole percent', () => {
    for (const [stored, want] of [['5', 1.6], ['0.5', 1], ['abc', 1], ['', 1], ['1.234', 1.23], ['1.6', 1.6], ['-2', 1]]) {
        assert.equal(loadSizes(stored).api.m, want, `stored ${JSON.stringify(stored)}`);
    }
    const { api } = loadSizes();
    assert.equal(api.clamp(null), 1);
    assert.equal(api.clamp(undefined), 1);
    assert.equal(api.clamp(NaN), 1);
    assert.equal(api.clamp(1.449999), 1.45);
});

test('h3dSetNeckSize persists the clamped value and broadcasts once', () => {
    const { api, window, storage, emitted } = loadSizes();
    window.h3dSetNeckSize(1.45);
    assert.equal(storage.get('highway_3d.neckSize'), '1.45');
    assert.equal(api.m, 1.45);
    near(api.NH, 3 * K * 1.45, 'gem height after set');
    assert.deepEqual(emitted, ['neckSize']);
    // Same size again: nothing to rebuild, no broadcast.
    window.h3dSetNeckSize('1.45');
    assert.deepEqual(emitted, ['neckSize']);
    // Out of range is clamped before it is stored.
    window.h3dSetNeckSize(9);
    assert.equal(storage.get('highway_3d.neckSize'), '1.6');
    assert.equal(api.m, 1.6);
    window.h3dSetNeckSize('nonsense');
    assert.equal(storage.get('highway_3d.neckSize'), '1');
    assert.equal(api.m, 1);
    near(api.S_GAP, 4 * K, 'back to 100%');
    assert.deepEqual(emitted, ['neckSize', 'neckSize', 'neckSize']);
});

test('the setter applies live, never via a page reload', () => {
    const setter = src().match(/window\.h3dSetNeckSize\s*=\s*v\s*=>\s*\{[\s\S]*?\n    \};/);
    assert.ok(setter, 'h3dSetNeckSize assignment must be present');
    assert.doesNotMatch(setter[0], /location\.reload/);
});

test('the scaled sizes stay rebindable (let, not const)', () => {
    const s = src();
    for (const decl of [
        /\n    let STR_THICK = STR_THICK_BASE;/,
        /\n    let FRET_TUBE_RADIUS = STR_THICK_BASE \* 0\.75;/,
        /\n    let S_GAP = S_GAP_BASE;/,
        /\n    let NW = NW_BASE, NH = NH_BASE, ND = ND_BASE;/,
        /\n    let BEND_HALFSTEP_WORLD_Y = S_GAP_BASE \* 0\.8;/,
    ]) assert.match(s, decl);
    assert.doesNotMatch(s, /\bconst\s+(S_GAP|STR_THICK|NW|NH|ND|FRET_TUBE_RADIUS|BEND_HALFSTEP_WORLD_Y)\s*=/,
        'a scaled size was declared const again - Neck size could not move it');
});

test('the board, road and lanes stay put while the gems grow', () => {
    // The board plane sits at the 100% gem height, so a bigger gem never
    // changes where the board (and the road built around it) is.
    const s = src();
    assert.doesNotMatch(s, /S_BASE\s*-\s*NH\s*\//, 'board Y must use NH_BASE, not the scaled NH');
    const fixed = s.match(/S_BASE - NH_BASE \/ 2 - (2|1\.5) \* K/g) || [];
    assert.ok(fixed.length >= 4, `expected the road, board plane, lanes and beat line on NH_BASE, saw ${fixed.length}`);
});

test('each panel resizes its built-once geometry when the size moves', () => {
    const s = src();
    assert.match(s, /gNote = new T\.BoxGeometry\(NW, NH, ND\);\n\s*_neckForGeo = _h3dNeckSize;/,
        'initScene must record the size the gems were built at');
    assert.match(s, /ghostFrameGeo = mkGhostFrameGeometry\(\);/, 'the ghost rim geometry must be kept for resizing');
    assert.match(s, /new T\.Mesh\(ghostFrameGeo, mat\)/);
    assert.match(s, /if \(changedKey === 'neckSize'\) \{\s*(\/\/[^\n]*\n\s*)*_syncNeckSize\(\);\s*return;/,
        'the settings listener must resize this panel on a neckSize broadcast');
    assert.match(s, /if \(_neckForGeo !== _h3dNeckSize\) _syncNeckSize\(\);\n\s*if \(_invertedCached !== _invertedForBoard/,
        'draw() must catch up a panel that missed the broadcast (e.g. while hidden)');
});

test('_syncNeckSize scales the shared gem geometry in place and rebuilds the board', async () => {
    const T = await import(pathToFileURL(THREE_JS).href);
    const s = src();
    const start = s.indexOf('        function _syncNeckSize() {');
    assert.notEqual(start, -1, '_syncNeckSize not found');
    const end = s.indexOf('\n        }\n', start);
    const fnSrc = s.slice(start, end + '\n        }\n'.length);

    const NW = 5 * K, NH = 3 * K, ND = 0.25 * K;
    const gNote = new T.BoxGeometry(NW, NH, ND);
    const grad = new T.BoxGeometry(NW, NH, ND);
    const colors = new Float32Array(grad.attributes.position.count * 3).map((_, i) => (i % 7) / 7);
    grad.setAttribute('color', new T.BufferAttribute(colors.slice(), 3));
    const ghost = new T.BoxGeometry(NW * 1.1, NH * 1.1, ND * 2.8);
    const ctx = { gNote, gNoteGrad: [grad, undefined], ghostFrameGeo: ghost, fretG: {}, _neckForGeo: 1, _h3dNeckSize: 1, builds: 0 };
    vm.createContext(ctx);
    vm.runInContext('var buildBoard = () => { builds++; };\n' + fnSrc.replace('function _syncNeckSize', 'globalThis._syncNeckSize = function'), ctx);
    const size = (g) => { g.computeBoundingBox(); const v = new T.Vector3(); g.boundingBox.getSize(v); return v; };

    ctx._syncNeckSize();
    assert.equal(ctx.builds, 0, 'unchanged size must be a no-op');

    ctx._h3dNeckSize = 1.6;
    ctx._syncNeckSize();
    assert.equal(ctx.builds, 1, 'board rebuilt once for the new gaps');
    assert.equal(ctx._neckForGeo, 1.6);
    for (const [g, w, h, d, name] of [[gNote, NW, NH, ND, 'gem'], [grad, NW, NH, ND, 'gradient gem'], [ghost, NW * 1.1, NH * 1.1, ND * 2.8, 'ghost rim']]) {
        const v = size(g);
        nearF(v.x, w * 1.6, `${name} width`); nearF(v.y, h * 1.6, `${name} height`); nearF(v.z, d * 1.6, `${name} depth`);
    }
    assert.deepEqual(Array.from(grad.attributes.color.array), Array.from(colors), 'gradient colours ride along untouched');

    // Back down: sizes return to the 100% build (ratio, not absolute).
    ctx._h3dNeckSize = 1;
    ctx._syncNeckSize();
    assert.equal(ctx.builds, 2);
    const v = size(gNote);
    nearF(v.x, NW, 'gem width back at 100%'); nearF(v.y, NH, 'gem height back at 100%');
});

test('Settings shows a 100-160% Neck size slider wired to the setter', () => {
    const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
    const input = html.match(/<input type="range" id="h3d-neck-size"[^>]*>/);
    assert.ok(input, 'Neck size slider missing from settings.html');
    assert.match(input[0], /min="100"/);
    assert.match(input[0], /max="160"/);
    assert.match(input[0], /window\.h3dSetNeckSize\(this\.value \/ 100\)/);
    assert.match(html, /id="h3d-neck-size-label">100%</);
});
