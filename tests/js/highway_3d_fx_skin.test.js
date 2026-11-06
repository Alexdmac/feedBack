// The 3D highway's streak FX (tier-up ring, milestone burst, score pops)
// take their colours from notedetect's scoring skin. notedetect stores the
// skin under 'slopsmith_notedetect_skin'; the renderer used to read only
// 'feedBack_notedetect_skin', a key nothing writes, so every skin drew neon.
// Runs the real palette block from screen.js against a fake localStorage.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const src = fs.readFileSync(path.join(root, 'plugins', 'highway_3d', 'screen.js'), 'utf8').replace(/\r\n/g, '\n');

function blockEnd(text, from) {
    const open = text.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) return i + 1;
    }
    throw new Error('unbalanced braces');
}

const start = src.indexOf('        const _FX_PALETTES = {');
const fn = src.indexOf('        function _fxResolvePalette(', start);
assert.ok(start > 0 && fn > start, 'palette block not found');
const block = src.slice(start, blockEnd(src, fn));

function load(store, opts = {}) {
    const localStorage = {
        getItem(k) {
            if (opts.blocked) throw new Error('SecurityError');
            return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
        },
    };
    const ctx = vm.createContext({ localStorage });
    vm.runInContext(block + '\nthis.api = { resolve: _fxResolvePalette, get: () => _fxPalette, P: _FX_PALETTES };', ctx);
    return ctx.api;
}

test('reads the key notedetect actually writes', () => {
    for (const skin of ['neon', 'esports', 'metal']) {
        const api = load({ slopsmith_notedetect_skin: skin });
        api.resolve();
        assert.equal(api.get(), api.P[skin], skin);
    }
    // notedetect's own storage key, so the two can't drift apart again.
    const nd = fs.readFileSync(path.join(root, 'plugins', 'note_detect', 'screen.js'), 'utf8');
    const m = nd.match(/const ND_SKIN_STORAGE_KEY = '([^']+)';/);
    assert.ok(m, 'notedetect skin key not found');
    assert.ok(block.includes(`'${m[1]}'`), `the renderer must read ${m[1]}`);
});

test('falls back to the feedBack_ spelling, then neon; bad values are ignored', () => {
    const a = load({ feedBack_notedetect_skin: 'metal' });
    a.resolve();
    assert.equal(a.get(), a.P.metal);
    const b = load({ slopsmith_notedetect_skin: 'esports', feedBack_notedetect_skin: 'metal' });
    b.resolve();
    assert.equal(b.get(), b.P.esports, 'the key notedetect writes wins');
    for (const v of ['', 'bogus', 'constructor', '__proto__', 'toString']) {
        const c = load({ slopsmith_notedetect_skin: v });
        c.resolve();
        assert.equal(c.get(), c.P.neon, `${v} -> neon`);
    }
    const d = load({}, { blocked: true });
    d.resolve();
    assert.equal(d.get(), d.P.neon, 'blocked storage -> neon');
});

test('a skin event wins over storage (setSkin whose write failed)', () => {
    const api = load({ slopsmith_notedetect_skin: 'neon' });
    api.resolve('metal');
    assert.equal(api.get(), api.P.metal);
    const blocked = load({}, { blocked: true });
    blocked.resolve('esports');
    assert.equal(blocked.get(), blocked.P.esports);
    api.resolve('nope');
    assert.equal(api.get(), api.P.neon, 'an invalid event skin falls back to storage');
    assert.match(src, /_fxOnSkin = \(e\) => _fxResolvePalette\(e && e\.detail && e\.detail\.skin\);/);
});
