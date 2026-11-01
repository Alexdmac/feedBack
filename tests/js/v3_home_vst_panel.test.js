'use strict';

// The Home page has a VST panel (a shelf of plugin pictures) and a hero
// whose cards scale to fill the panel. These tests cover the pure helpers in
// static/v3/dashboard.js: the tile list and its order, the bundle path
// compare, the initials on the pedal face, the fixed pedal photo per plugin
// and the hero scale.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DASHBOARD_JS = path.join(__dirname, '..', '..', 'static', 'v3', 'dashboard.js');

function extractBlock(src, startMarker) {
    const start = src.indexOf(startMarker);
    if (start === -1) throw new Error(`extractBlock: '${startMarker}' not found`);
    const openBrace = src.indexOf('{', start);
    let depth = 1;
    let i = openBrace + 1;
    while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    if (depth !== 0) throw new Error(`extractBlock: unbalanced braces after '${startMarker}'`);
    return src.slice(start, i);
}

function extractConst(src, name) {
    const m = src.match(new RegExp('const ' + name + ' = [^;]+;'));
    if (!m) throw new Error(`extractConst: '${name}' not found`);
    return m[0];
}

function loadHelpers() {
    const src = fs.readFileSync(DASHBOARD_JS, 'utf8');
    const consts = ['HERO_FILL_W', 'HERO_FILL_H', 'HERO_ZOOM_MIN', 'HERO_ZOOM_MAX', 'VST_ONLY']
        .map((n) => extractConst(src, n)).join('\n');
    const names = ['heroZoom', 'vstKey', 'vstPathKey', 'vstPlugins', 'vstShown', 'vstShortName',
        'vstInitials', 'vstHash', 'vstSkin'];
    const body = names.map((n) => extractBlock(src, 'function ' + n + '(')).join('\n');
    const sandbox = { exports: {} };
    vm.createContext(sandbox);
    vm.runInContext(
        consts + '\n' + body + '\n' +
        names.map((n) => 'exports.' + n + ' = ' + n + ';').join('\n') + '\n' +
        'exports.HERO_FILL_W = HERO_FILL_W; exports.HERO_FILL_H = HERO_FILL_H;\n' +
        'exports.HERO_ZOOM_MIN = HERO_ZOOM_MIN; exports.HERO_ZOOM_MAX = HERO_ZOOM_MAX;',
        sandbox
    );
    return sandbox.exports;
}

const h = loadHelpers();

// The helpers run in their own realm, so copy their arrays into this one
// before a deep compare.
const names = (list) => Array.from(list, (p) => p.name);

function plugin(name, manufacturer, p, isInstrument) {
    return { name, manufacturer, path: p, isInstrument: !!isInstrument, format: 'VST3' };
}

test('vstPlugins: one tile per maker and name, the shortest path wins', () => {
    const bundle = 'C:\\Program Files\\Common Files\\VST3\\Serum.vst3';
    const list = [
        plugin('Serum', 'Xfer Records', bundle + '\\Contents\\x86_64-win\\Serum.vst3', true),
        plugin('Serum', 'Xfer Records', bundle, true),
        plugin('serum', 'xfer records', bundle + '\\Contents\\x86_64-win\\Serum.vst3', true),
    ];
    const out = h.vstPlugins(list, []);
    assert.equal(out.length, 1);
    assert.equal(out[0].path, bundle);
});

test('vstPlugins: drops entries with no path or name, and Rig Builder stages', () => {
    const list = [
        plugin('Amp', 'RB', 'C:\\dev\\feedBack\\plugins\\rig_builder\\vst\\Amp.vst3'),
        plugin('', 'X', 'C:\\x\\A.vst3'),
        { name: 'NoPath', manufacturer: 'X' },
        null,
        plugin('Room', 'Valhalla', 'C:\\x\\ValhallaRoom.vst3'),
    ];
    assert.deepEqual(names(h.vstPlugins(list, [])), ['Room']);
    assert.equal(h.vstPlugins(null, null).length, 0);
});

test('vstPlugins: recent plugins first, then effects A-Z, then instruments A-Z', () => {
    const list = [
        plugin('Zebra', 'u-he', 'C:\\x\\Zebra2.vst3', true),
        plugin('reverb', 'B', 'C:\\x\\Reverb.vst3'),
        plugin('Chorus', 'A', 'C:\\x\\Chorus.vst3'),
        plugin('Analog Lab', 'Arturia', 'C:\\x\\Analog Lab.vst3', true),
        plugin('Delay', 'C', 'C:\\x\\Delay.vst3'),
    ];
    assert.deepEqual(names(h.vstPlugins(list, [])),
        ['Chorus', 'Delay', 'reverb', 'Analog Lab', 'Zebra']);
    const recent = [h.vstKey(list[0]), 'gone|plugin', h.vstKey(list[4]), h.vstKey(list[0])];
    assert.deepEqual(names(h.vstPlugins(list, recent)),
        ['Zebra', 'Delay', 'Chorus', 'reverb', 'Analog Lab']);
});

test('vstShown: only the Archetype plugins, in list order, or all when there are none', () => {
    const list = [
        plugin('Archetype Tim Henson X', 'Neural DSP', 'C:/x/Archetype Tim Henson X.vst3'),
        plugin('Parallax X', 'Neural DSP', 'C:/x/Parallax X.vst3'),
        plugin('archetype Gojira', 'Neural DSP', 'C:/x/Archetype Gojira.vst3'),
        plugin('ArchetypeLike', 'Other', 'C:/x/ArchetypeLike.vst3'),
        plugin('Serum', 'Xfer Records', 'C:/x/Serum.vst3', true),
    ];
    assert.deepEqual(names(h.vstShown(list)), ['Archetype Tim Henson X', 'archetype Gojira']);
    const none = [list[1], list[3], list[4]];
    assert.deepEqual(names(h.vstShown(none)), ['Parallax X', 'ArchetypeLike', 'Serum']);
});

test('vstShortName: drops the Archetype word that every tile repeats', () => {
    assert.equal(h.vstShortName('Archetype Cory Wong X'), 'Cory Wong X');
    assert.equal(h.vstShortName('Archetype  Gojira'), 'Gojira');
    assert.equal(h.vstShortName('Archetype'), 'Archetype');
    assert.equal(h.vstShortName('Serum'), 'Serum');
    assert.equal(h.vstShortName(undefined), '');
    assert.equal(h.vstInitials(h.vstShortName('Archetype Tim Henson X')), 'TH');
    assert.equal(h.vstInitials(h.vstShortName('Archetype Plini')), 'Pl');
});

test('vstPathKey: the bundle folder, with one slash style and one case', () => {
    const bundle = 'c:\\program files\\common files\\vst3\\serum.vst3';
    assert.equal(h.vstPathKey('C:\\Program Files\\Common Files\\VST3\\Serum.vst3'), bundle);
    assert.equal(h.vstPathKey('C:/Program Files/Common Files/VST3/Serum.vst3/Contents/x86_64-win/Serum.vst3'), bundle);
    assert.equal(h.vstPathKey('C:\\Plugins\\Old.dll'), 'c:\\plugins\\old.dll');
    assert.equal(h.vstPathKey(null), '');
});

test('vstInitials: two words give two capitals, one word gives its start', () => {
    assert.equal(h.vstInitials('Valhalla Room'), 'VR');
    assert.equal(h.vstInitials('ValhallaRoom'), 'VR');
    assert.equal(h.vstInitials('Pro-Q 3'), 'PQ');
    // A last version tag does not count.
    assert.equal(h.vstInitials('Nolly X'), 'No');
    assert.equal(h.vstInitials('Cory Wong X'), 'CW');
    assert.equal(h.vstInitials('Kontakt 7'), 'Ko');
    assert.equal(h.vstInitials('X'), 'X');
    assert.equal(h.vstInitials('3'), '3');
    assert.equal(h.vstInitials('Serum'), 'Se');
    assert.equal(h.vstInitials('SERUM'), 'Se');
    assert.equal(h.vstInitials('OTT'), 'OTT');
    assert.equal(h.vstInitials('--'), '?');
    assert.equal(h.vstInitials(undefined), '?');
});

test('vstSkin: the same plugin always gets the same photo from the list', () => {
    const skins = ['a.png', 'b.png', 'c.png', 'd.png', 'e.png'];
    const p = plugin('Room', 'Valhalla', 'C:\\x\\ValhallaRoom.vst3');
    const first = h.vstSkin(p, skins);
    assert.ok(skins.includes(first));
    for (let i = 0; i < 5; i++) assert.equal(h.vstSkin({ ...p, path: 'D:\\other' + i }, skins), first);
    assert.equal(h.vstSkin(p, []), null);
    assert.equal(h.vstSkin(p, undefined), null);
    // FNV-1a gives an unsigned 32-bit value.
    assert.equal(h.vstHash(''), 0x811c9dc5);
    assert.ok(h.vstHash('valhalla|room') >= 0);
    // The hash spreads 40 names over the 5 photos.
    const used = new Set();
    for (let i = 0; i < 40; i++) used.add(h.vstSkin(plugin('Plugin ' + i, 'Maker', 'C:\\p' + i), skins));
    assert.equal(used.size, skins.length);
});

test('heroZoom: the dock fills the width or the height, whichever comes first', () => {
    // A wide panel: the height sets the scale.
    const tall = h.heroZoom(400, 100, 2000, 300);
    assert.equal(tall, Math.round((300 * h.HERO_FILL_H / 100) * 1000) / 1000);
    // A narrow panel: the width sets the scale.
    const narrow = h.heroZoom(400, 100, 600, 1000);
    assert.equal(narrow, Math.round((600 * h.HERO_FILL_W / 400) * 1000) / 1000);
    // The scale stays in its limits.
    assert.equal(h.heroZoom(400, 100, 100, 50), h.HERO_ZOOM_MIN);
    assert.equal(h.heroZoom(10, 10, 4000, 4000), h.HERO_ZOOM_MAX);
    // No size yet (a hidden panel or an empty dock): no scale.
    assert.equal(h.heroZoom(0, 100, 800, 300), 1);
    assert.equal(h.heroZoom(400, 100, 0, 0), 1);
});
