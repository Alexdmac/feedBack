// Source-level guards for the "Invert strings" setting (RockStar).
//
// The highway's `invertHighway` flag puts the low E string (red) at the
// bottom of the 2D and 3D highways. RockStar turns it on by default and
// shows a switch for it in Settings > Gameplay. These tests lock in:
//   • the default (absent key = inverted; only 'false' turns it off),
//   • setInverted() stores a boolean string,
//   • the switch exists, hydrates from getInverted(), and resets to on.
//
// Like the other highway tests in this directory, these inspect the
// source rather than executing — the createHighway() closure owns
// canvas + WebGL lifecycle that's too heavy for a vm sandbox.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('invertHighway defaults to on when the key is absent', () => {
    const src = read('static/highway.js');
    assert.match(src, /hwState\._inverted\s*=\s*localStorage\.getItem\('invertHighway'\)\s*!==\s*'false'\s*;/);
    assert.doesNotMatch(src, /getItem\('invertHighway'\)\s*===\s*'true'/, 'old opt-in default must be gone');
});

test('setInverted() stores a boolean and writes true/false', () => {
    const src = read('static/highway.js');
    const m = src.match(/setInverted\(v\)\s*\{([\s\S]*?)\n\s*\},/);
    assert.ok(m, 'setInverted() must exist');
    assert.match(m[1], /hwState\._inverted\s*=\s*!!v\s*;/);
    assert.match(m[1], /localStorage\.setItem\('invertHighway',\s*hwState\._inverted\s*\?\s*'true'\s*:\s*'false'\)/);
});

test('Gameplay settings has an Invert strings switch wired to setInverted()', () => {
    const html = read('static/v3/index.html');
    const start = html.indexOf('<div class="fb-tabpanel" data-tab="gameplay">');
    const end = html.indexOf('<div class="fb-tabpanel"', start + 1);
    assert.ok(start !== -1 && end !== -1, 'gameplay panel must exist');
    const panel = html.slice(start, end);
    assert.match(panel, /<input type="checkbox" id="setting-invert-highway" onchange="highway\.setInverted\(this\.checked\)">/);
    assert.match(panel, /Invert strings/);
});

test('loadSettings() hydrates the switch from getInverted()', () => {
    const src = read('static/js/settings.js');
    assert.match(src, /getElementById\('setting-invert-highway'\)/);
    assert.match(src, /invertEl\.checked\s*=\s*window\.highway\.getInverted\(\)/);
});

test('Reset Gameplay Settings clears invertHighway and turns invert back on', () => {
    const src = read('static/v3/settings.js');
    const m = src.match(/gameplay:\s*\{([\s\S]*?)\n\s{8}\},/);
    assert.ok(m, 'RESET_MAP.gameplay must exist');
    assert.match(m[1], /local:\s*\[[^\]]*'invertHighway'/);
    assert.match(m[1], /window\.highway\.setInverted\(true\)/);
});
