/*
 * fee[dB]ack v0.3.0 — Dashboard / Home (#v3-home).
 *
 * Composes data from the backends built in other prompts: profile (15),
 * song-stats/recent (14), continue (16), library stats + plugins, plus the
 * start of the Song Library (rendered by songs.js's shared cards). Each widget
 * fetches + renders independently and DEGRADES GRACEFULLY — a missing/empty
 * endpoint shows a placeholder, never blocks first paint (design/05 §1).
 * Vanilla JS, fb-* tokens (constitution P-II).
 */
(function () {
    'use strict';
    const sm = window.feedBack;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const enc = encodeURIComponent;
    const JUMP_COUNT = 5;       // tiles in the compact "Jump back in" strip
    // 12 fills whole rows at every grid breakpoint (2 / 3 / 4 / 6 columns).
    const LIBRARY_COUNT = 12;
    const jget = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null; } catch (e) { return null; } };

    function libArtUrl(song) {
        const v = song.mtime ? ('?v=' + Math.floor(song.mtime)) : '';
        return '/api/song/' + enc(song.filename) + '/art' + v;
    }

    // A random library song (for the "Pick a song" card when nothing's been played).
    async function randomSong() {
        const stats = await jget('/api/library/stats');
        const total = (stats && (stats.total_songs ?? stats.total)) || 0;
        if (!total) return null;
        const idx = Math.floor(Math.random() * total);
        const data = await jget('/api/library?size=1&page=' + idx);
        return data && data.songs && data.songs[0] ? data.songs[0] : null;
    }

    function songArt(url, extra) {
        return '<img src="' + esc(url) + '" alt="" class="' + (extra || '') +
            '" onerror="this.style.visibility=\'hidden\'">';
    }

    function tuningChip(name, cls) {
        if (!name) return '';
        return '<span class="' + (cls || '') + ' bg-fb-mid text-black text-xs font-bold px-2 py-1 rounded-sm">' + esc(name) + '</span>';
    }

    // Source format of a song — prefer the server's `format`, fall back to the
    // filename extension. '' = unknown.
    function fmtName(song) {
        let f = ((song && song.format) || '').toLowerCase();
        if (!f) {
            const fn = ((song && song.filename) || '').toLowerCase();
            f = (fn.endsWith('.feedpak') || fn.endsWith('.sloppak')) ? 'sloppak' : '';
        }
        return f === 'sloppak' ? 'FEEDPAK' : f === 'loose' ? 'FOLDER' : '';
    }
    // Inline pill for the hero (Pick/Continue) card, where the art is text-overlaid
    // and a corner badge would collide — sits next to the card's label instead.
    function fmtTag(song) {
        const l = fmtName(song);
        if (!l) return '';
        const c = l === 'FEEDPAK' ? 'bg-fb-primary/20 text-fb-primary' : 'bg-fb-card/80 text-fb-textDim';
        return '<span class="' + c + ' text-[0.5625rem] font-bold px-1.5 py-0.5 rounded tracking-wide shrink-0">' + l + '</span>';
    }

    // ── Continue-Playing resume ──────────────────────────────────────────---
    function resume(filename, lastPosition, arrangement) {
        if (typeof window.playSong !== 'function') return;
        // playSong expects an encoded filename (it decodeURIComponent()s it for
        // the highway WS) and takes the arrangement index as its 2nd arg — pass
        // both so resume reopens the exact arrangement the user left, not the
        // default. It has no start-time arg, so play then best-effort seek once
        // the session is up (constitution: highway WS).
        Promise.resolve(window.playSong(enc(filename), arrangement)).then(() => {
            if (Number.isFinite(lastPosition) && lastPosition > 0 && sm && typeof sm.seek === 'function') {
                setTimeout(() => { try { sm.seek(lastPosition, 'continue-playing'); } catch (e) { /* */ } }, 800);
            }
        });
    }

    // ── Render ───────────────────────────────────────────────────────────---
    async function render() {
        const root = document.getElementById('v3-home');
        if (!root) return;

        // Kick off independent fetches.
        const [cont, libStats, plugins, recent] = await Promise.all([
            jget('/api/session/continue'),
            jget('/api/library/stats'), jget('/api/plugins'), jget('/api/stats/recent?limit=' + JUMP_COUNT),
        ]);

        const songCount = (libStats && (libStats.total_songs ?? libStats.total)) || 0;
        const pluginCount = Array.isArray(plugins)
            ? plugins.filter((p) => (p && (p.status || 'ready') === 'ready')).length : 0;

        // "Jump back in": scored recents, else fall back to recently-added songs
        // so the section is never empty on a fresh profile.
        let recentList = Array.isArray(recent) ? recent.slice(0, JUMP_COUNT) : [];
        if (!recentList.length) {
            const lib = await jget('/api/library?sort=recent&size=' + JUMP_COUNT + '&page=0');
            recentList = ((lib && lib.songs) || []).map((s) => ({
                filename: s.filename, title: s.title, artist: s.artist,
                art_url: libArtUrl(s), best_accuracy: null,
            }));
        }
        // When nothing's been played, the Continue card becomes a random
        // pick-a-song that plays on click.
        const pick = (cont && cont.filename) ? null : await randomSong();

        // Continue card.
        let continueCard;
        if (cont && cont.filename) {
            const dur = cont.duration || 0;
            const segs = 4;
            const filled = dur > 0 ? Math.round((cont.last_position / dur) * segs) : 0;
            const bars = Array.from({ length: segs }, (_, i) =>
                '<span class="flex-1 h-1.5 rounded-full ' + (i < filled ? 'bg-fb-primary' : 'bg-gray-500/40') + '"></span>').join('');
            continueCard =
                '<button id="v3-continue" data-tour="continue" class="group relative text-left rounded-xl overflow-hidden border border-fb-border/50 bg-fb-card v3-continue-fill flex flex-col justify-end">' +
                songArt(cont.art_url, 'absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-70 transition') +
                '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>' +
                tuningChip(cont.tuning_name, 'absolute top-3 right-3') +
                '<div class="relative p-4">' +
                '<div class="flex items-center justify-between gap-2 mb-1"><span class="text-xs uppercase tracking-wider text-fb-textDim">Continue Playing</span>' + fmtTag(cont) + '</div>' +
                '<div class="text-fb-text font-bold truncate">' + esc(cont.title) + '</div>' +
                '<div class="text-sm text-fb-textDim truncate mb-3">' + esc(cont.artist) + '</div>' +
                '<div class="flex gap-1">' + bars + '</div></div>' +
                '<span class="absolute top-3 left-3 text-fb-text/80 group-hover:text-fb-text">▶</span></button>';
        } else if (pick) {
            continueCard =
                '<button id="v3-pick" data-tour="continue" data-fn="' + esc(pick.filename) + '" class="group relative text-left rounded-xl overflow-hidden border border-fb-border/50 bg-fb-card v3-continue-fill flex flex-col justify-end">' +
                songArt(libArtUrl(pick), 'absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-70 transition') +
                '<div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>' +
                tuningChip(pick.tuning_name, 'absolute top-3 right-3') +
                '<div class="relative p-4">' +
                '<div class="flex items-center justify-between gap-2 mb-1"><span class="text-xs uppercase tracking-wider text-fb-textDim">Pick a song</span>' + fmtTag(pick) + '</div>' +
                '<div class="text-fb-text font-bold truncate">' + esc(pick.title) + '</div>' +
                '<div class="text-sm text-fb-textDim truncate">' + esc(pick.artist) + '</div></div>' +
                '<span class="absolute top-3 left-3 text-fb-text/80 group-hover:text-fb-text">▶</span></button>';
        } else {
            continueCard =
                '<div data-tour="continue" class="rounded-xl border border-fb-border/50 bg-fb-card/60 v3-continue-fill flex flex-col items-center justify-center text-center p-4">' +
                '<div class="text-fb-textDim text-sm mb-3">Pick a song to get started</div>' +
                '<button id="v3-continue-pick" class="bg-fb-card hover:bg-fb-card/70 border border-fb-border/50 text-fb-text text-sm px-4 py-2 rounded-md">Browse library</button></div>';
        }

        // "Jump back in": a compact strip under the Continue card, so the right
        // column ends flush with the hero's bottom edge.
        let jumpStrip;
        if (recentList.length) {
            const tiles = recentList.map((r) =>
                '<button data-recent="' + esc(r.filename) + '" data-arr="' + esc(r.arrangement != null ? r.arrangement : '') + '" class="group text-left min-w-0" title="' + esc(r.title) + (r.artist ? ' — ' + esc(r.artist) : '') + '">' +
                '<div class="relative aspect-square rounded-md overflow-hidden bg-fb-card">' +
                songArt(r.art_url, 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105') +
                miniAccuracy(r.best_accuracy) + '</div>' +
                '<div class="v3-jump-title mt-1 text-fb-text truncate">' + esc(r.title) + '</div></button>').join('');
            jumpStrip =
                '<section id="v3-jump" class="rounded-xl border border-fb-border/50 bg-fb-card/60 p-3">' +
                '<h3 class="text-xs uppercase tracking-wider text-fb-textDim mb-2">Jump back in</h3>' +
                '<div class="v3-jump-row grid gap-2">' + tiles + '</div></section>';
        } else {
            jumpStrip =
                '<section id="v3-jump" class="rounded-xl border border-fb-border/50 bg-fb-card/60 p-3">' +
                '<h3 class="text-xs uppercase tracking-wider text-fb-textDim mb-2">Jump back in</h3>' +
                '<p class="text-fb-textDim text-sm">Play a song to see it here.</p></section>';
        }

        // Song Library: songs in the player's current tuning, in random order,
        // filled in after first paint by songs.js (same cards as the Song
        // Library page).
        const librarySection =
            '<section id="v3-home-library" class="mt-10">' +
            '<div class="flex items-end justify-between gap-4 mb-4">' +
            '<div><h3 class="text-2xl font-bold text-fb-text">Song Library</h3>' +
            '<p id="v3-home-library-sub" class="text-sm text-fb-textDim"></p></div>' +
            '<div class="flex items-center gap-4">' +
            '<button id="v3-home-library-shuffle" class="hidden text-sm font-medium text-fb-textDim hover:text-fb-text whitespace-nowrap" title="Show another random pick">⇄ Shuffle</button>' +
            '<button id="v3-home-library-all" class="text-sm font-medium text-fb-primary hover:text-fb-primaryHi whitespace-nowrap">See all songs →</button>' +
            '</div></div>' +
            '<div id="v3-home-library-grid"><p class="text-fb-textDim text-sm">Loading your library…</p></div>' +
            '</section>';

        // The badge hosts must leave the old hero before innerHTML drops it.
        undockBadges();
        root.innerHTML =
            '<div class="max-w-7xl mx-auto px-6 md:px-8 pb-8">' +
            // (Title "Welcome back, {name}!" lives in the topbar header row.)
            // Featured grid: hero + continue
            '<div class="grid lg:grid-cols-3 gap-6">' +
            // The hero holds no text: the artwork, the tuner / profile / tuning
            // cards (moved here from the topbar by dockBadges) and the two
            // actions, as one centered glass dock. The panel does not clip, so
            // the tuning menu can open past its bottom edge.
            '<div id="v3-hero" class="v3-hero lg:col-span-2 relative rounded-xl min-h-[480px] flex items-center justify-center bg-fb-bg">' +
            // Hero artwork (neon note-highway), full-bleed and right-anchored.
            // Placeholder cropped from the design mock — swap
            // static/v3/brand/hero.png for the designer's high-res original
            // (same path) when available.
            '<div class="absolute inset-0 rounded-xl overflow-hidden" aria-hidden="true">' +
            '<img src="/static/v3/brand/hero.png" alt="" class="v3-hero-art" onerror="this.style.display=\'none\'">' +
            '<div class="v3-hero-scrim"></div></div>' +
            '<div class="v3-hero-dock">' +
            '<div id="v3-hero-badges" class="v3-hero-badges"></div>' +
            '<div class="v3-hero-actions">' +
            '<button id="v3-start" class="v3-glass-btn v3-glass-btn--primary">Start Playing</button>' +
            '<button id="v3-lessons-btn" class="v3-glass-btn">Lessons</button>' +
            '</div></div></div>' +
            '<div class="flex flex-col gap-4">' + continueCard + jumpStrip + '</div>' +
            '</div>' +
            // Stats row. The third slot belongs to the career plugin (it
            // replaces the slot's content on v3:dashboard-rendered); the
            // plugin-count stat is the built-in fallback when career is
            // absent or has no state yet.
            '<div class="grid md:grid-cols-3 gap-6 mt-6">' +
            audioRoutingCard() +
            statCard(String(songCount), 'songs', 'text-fb-gold') +
            '<div id="v3-dash-career-slot" class="grid">' +
            statCard(String(pluginCount), 'active', 'text-fb-good') +
            '</div>' +
            '</div>' +
            librarySection +
            '</div>';

        // Wire interactions.
        const startBtn = root.querySelector('#v3-start');
        if (startBtn) startBtn.addEventListener('click', () => {
            if (cont && cont.filename) resume(cont.filename, cont.last_position, cont.arrangement);
            else if (pick) window.playSong && window.playSong(enc(pick.filename));
            else window.showScreen && window.showScreen('v3-songs');
        });
        root.querySelector('#v3-continue')?.addEventListener('click', () => resume(cont.filename, cont.last_position, cont.arrangement));
        root.querySelector('#v3-pick')?.addEventListener('click', () => window.playSong && window.playSong(enc(pick.filename)));
        root.querySelector('#v3-continue-pick')?.addEventListener('click', () => window.showScreen && window.showScreen('v3-songs'));
        root.querySelector('#v3-lessons-btn')?.addEventListener('click', () => window.showScreen && window.showScreen('v3-lessons'));
        root.querySelector('#v3-home-library-all')?.addEventListener('click', () => openLibrary(_libraryTuningKey));
        root.querySelector('#v3-home-library-shuffle')?.addEventListener('click', () => renderLibrary(root));
        root.querySelectorAll('[data-recent]').forEach((b) =>
            b.addEventListener('click', () => {
                if (!window.playSong) return;
                // /api/stats/recent rows are arrangement-specific — reopen the
                // arrangement that was actually played, not the default.
                const arr = b.getAttribute('data-arr');
                window.playSong(enc(b.getAttribute('data-recent')), arr === '' || arr == null ? undefined : Number(arr));
            }));

        dockBadges();
        renderLibrary(root);

        // Let prompt 18 enhance the audio-routing card once it exists.
        if (window.v3AudioRouting && typeof window.v3AudioRouting.render === 'function') {
            try { window.v3AudioRouting.render(document.getElementById('v3-audio-routing')); } catch (e) { /* */ }
        }
        // Signal that #v3-home has been (re)built, so the first-run onboarding
        // tour can wait for the real cards instead of attaching to nodes from a
        // prior render that this innerHTML swap just replaced.
        try { document.dispatchEvent(new CustomEvent('v3:dashboard-rendered')); } catch (e) { /* older runtimes */ }
    }

    function openLibrary(tuningKey) {
        if (window.v3Songs && typeof window.v3Songs.openLibrary === 'function') window.v3Songs.openLibrary(tuningKey || undefined);
        else if (window.showScreen) window.showScreen('v3-songs');
    }

    // ── Topbar cards in the hero ─────────────────────────────────────────---
    // On every other screen the tuner, tuning and profile cards sit in the
    // topbar. On Home they move into the hero: the same nodes, so their
    // listeners and live updates (tuner frames, profile refresh) keep working.
    // Hero order puts the wide profile card between the two square cards, so
    // the row is symmetric.
    const HERO_BADGES = ['v3-badge-tuner', 'v3-badge-profile', 'v3-badge-instrument'];
    const TOPBAR_BADGES = ['v3-badge-tuner', 'v3-badge-instrument', 'v3-badge-profile'];
    function homeIsActive() {
        const active = document.querySelector('.screen.active');
        return !active || active.id === 'v3-home';
    }
    function dockBadges() {
        const dock = document.getElementById('v3-hero-badges');
        if (!dock || !homeIsActive()) return;
        HERO_BADGES.forEach((id) => {
            const el = document.getElementById(id);
            if (el) dock.appendChild(el);
        });
    }
    function undockBadges() {
        const bar = document.getElementById('v3-topbar-badges');
        if (!bar) return;
        // Append all three in topbar order, so the order is right even when
        // only some of them were in the hero.
        TOPBAR_BADGES.forEach((id) => {
            const el = document.getElementById(id);
            if (el) bar.appendChild(el);
        });
    }

    // Fill the Song Library section via songs.js's shared card renderer: a
    // random pick of the songs in the tuning the tuning card shows.
    let _libraryToken = 0;
    let _libraryTuningKey = null;   // library tuning key of the shown pick, for "See all"
    async function renderLibrary(root) {
        const grid = root.querySelector('#v3-home-library-grid');
        const sub = root.querySelector('#v3-home-library-sub');
        const all = root.querySelector('#v3-home-library-all');
        const shuffleBtn = root.querySelector('#v3-home-library-shuffle');
        if (!grid) return;
        const myToken = ++_libraryToken;
        const api = window.v3Songs;
        const badges = window.v3Badges;
        let tuning = null;
        try { tuning = badges && typeof badges.currentTuning === 'function' ? badges.currentTuning() : null; } catch (e) { tuning = null; }
        const byTuning = !!(tuning && Array.isArray(tuning.offsets) && tuning.offsets.length);
        let info = null;
        if (api && typeof api.renderPreview === 'function') {
            try {
                info = await api.renderPreview(grid, { limit: LIBRARY_COUNT, tuning: byTuning ? tuning : null, shuffle: byTuning });
            } catch (e) { info = null; }
        }
        if (myToken !== _libraryToken || !grid.isConnected) return;   // a newer render replaced this one
        const t = info && info.tuning;
        _libraryTuningKey = t && t.key ? t.key : null;
        if (shuffleBtn) shuffleBtn.classList.toggle('hidden', !(info && info.shuffled && info.total > info.shown));
        if (!info || !info.shown) {
            const msg = !info ? 'Couldn\'t load your library.'
                : t ? 'No songs in ' + t.name + ' yet. Pick another tuning on the tuning card above, or browse the whole library.'
                    : 'Your library is empty. Import a pack or point RockStar at your songs folder to get started.';
            grid.innerHTML =
                '<div class="rounded-xl border border-dashed border-fb-border/60 p-8 text-center">' +
                '<p class="text-fb-textDim text-sm mb-3">' + esc(msg) + '</p>' +
                '<button data-home-open-library class="bg-fb-card hover:bg-fb-card/70 border border-fb-border/50 text-fb-text text-sm px-4 py-2 rounded-md">Open Song Library</button></div>';
            grid.querySelector('[data-home-open-library]')?.addEventListener('click', () => openLibrary());
            if (sub) sub.textContent = t ? '0 songs in ' + t.name : '';
            if (all) all.textContent = 'Open Song Library →';
            _libraryTuningKey = null;
            return;
        }
        const count = info.total + ' song' + (info.total === 1 ? '' : 's');
        if (t) {
            if (sub) sub.textContent = count + ' in ' + t.name + (info.total > info.shown ? ' · random pick' : ' · random order');
            if (all) all.textContent = info.total > info.shown ? 'See all ' + info.total + ' in ' + t.name + ' →' : 'Open in Song Library →';
        } else {
            if (sub) sub.textContent = count + (info.sortLabel ? ' · ' + info.sortLabel : '');
            if (all) all.textContent = info.total > info.shown ? 'See all ' + info.total + ' songs →' : 'Open Song Library →';
        }
    }

    // The tuning card changed (a pick in its menu, a retune, an instrument
    // switch): show songs in the new tuning. Both events fire for one pick,
    // so a short delay merges them into one fetch.
    let _tuningRefreshTimer = 0;
    function onTuningChanged() {
        if (!homeIsActive()) return;
        const root = document.getElementById('v3-home');
        if (!root || !root.querySelector('#v3-home-library-grid')) return;
        clearTimeout(_tuningRefreshTimer);
        _tuningRefreshTimer = setTimeout(() => renderLibrary(root), 150);
    }

    // Small accuracy pill for the compact Jump-back-in tiles.
    function miniAccuracy(acc) {
        if (acc == null) return '';
        const pct = Math.floor(acc * 100);
        const color = acc >= 0.9 ? 'bg-fb-good' : (acc >= 0.5 ? 'bg-fb-mid' : 'bg-fb-low');
        const text = acc >= 0.5 && acc < 0.9 ? 'text-black' : 'text-white';
        return '<span class="v3-jump-acc absolute bottom-0 right-0 ' + color + '/90 ' + text + ' font-bold rounded-tl-md">' + pct + '%</span>';
    }

    function statCard(value, unit, unitColor) {
        return '<div class="bg-fb-card/80 backdrop-blur rounded-lg p-4 border border-fb-border/50 flex flex-col justify-center">' +
            '<div class="text-2xl font-bold text-fb-text">' + esc(value) +
            ' <span class="text-sm font-medium ' + unitColor + '">' + esc(unit) + '</span></div></div>';
    }

    // Audio-routing widget placeholder (prompt 18 replaces #v3-audio-routing's
    // body via window.v3AudioRouting). Until then: "Not Connected".
    function audioRoutingCard() {
        return '<div id="v3-audio-routing" class="bg-fb-card/80 backdrop-blur rounded-lg p-4 border border-fb-border/50">' +
            '<div class="flex items-center justify-between text-xs text-fb-textDim mb-2"><span>Audio Routing</span></div>' +
            '<div class="flex items-center gap-2 text-xs text-fb-textDim">' +
            '<span>Input</span><span class="flex-1 border-t border-dashed border-fb-border"></span>' +
            '<span class="w-2 h-2 rounded-full bg-gray-500"></span>' +
            '<span>VST/NAM/IR</span><span class="flex-1 border-t border-dashed border-fb-border"></span>' +
            '<span class="w-2 h-2 rounded-full bg-gray-500"></span><span>Output</span></div>' +
            '<div class="mt-2 text-sm font-medium text-fb-textDim">Not Connected</div></div>';
    }

    window.v3Dashboard = { render: render };
    if (sm && typeof sm.on === 'function') {
        sm.on('screen:changed', (e) => {
            if (e && e.detail && e.detail.id === 'v3-home') render();
            else undockBadges();   // the cards go back to the topbar
        });
        sm.on('v3:profile-updated', () => render());
        sm.on('working-tuning-changed', onTuningChanged);
        sm.on('instrument:changed', onTuningChanged);
    }
    function boot() { render(); }
    // `defer` runs this at readyState 'interactive' — later scripts have not
    // evaluated yet, so wait for DOMContentLoaded (see static/v3/index.html).
    if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
})();
