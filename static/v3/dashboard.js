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
    const JUMP_COUNT = 5;       // tiles in the "Jump back in" shelf
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

        // "Jump back in": a shelf under the Continue card. The VST panel under
        // the hero is the same shelf, so the two panels of the row match.
        const jumpTiles = recentList.map((r) =>
            '<button type="button" data-recent="' + esc(r.filename) + '" data-arr="' + esc(r.arrangement != null ? r.arrangement : '') + '" class="v3-shelf-tile group" title="' + esc(r.title) + (r.artist ? ' — ' + esc(r.artist) : '') + '">' +
            '<span class="v3-shelf-art">' +
            songArt(r.art_url, 'w-full h-full object-cover transition-transform duration-300 group-hover:scale-105') +
            miniAccuracy(r.best_accuracy) + '</span>' +
            '<span class="v3-shelf-title">' + esc(r.title) + '</span>' +
            '<span class="v3-shelf-sub">' + esc(r.artist || '') + '</span></button>').join('');
        const jumpShelf = shelf('v3-jump', 'Jump back in',
            jumpTiles || '<p class="v3-shelf-empty">Play a song to see it here.</p>');
        // VST panel: filled in after first paint (renderVst).
        const vstShelf = shelf('v3-vst', 'VST plugins', '<p class="v3-shelf-empty">Loading plugins…</p>',
            '<button type="button" data-vst-audio class="hidden text-xs font-medium text-fb-primary hover:text-fb-primaryHi whitespace-nowrap">Audio page →</button>');

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
        disconnectObservers();
        root.innerHTML =
            '<div class="max-w-7xl mx-auto px-6 md:px-8 pb-8">' +
            // (Title "Welcome back, {name}!" lives in the topbar header row.)
            // Feature grid (v3.css): hero | Continue over VST panel | Jump back in.
            '<div class="v3-home-feature">' +
            // The hero holds no text: only the artwork and the tuner / profile
            // / tuning cards (moved here from the topbar by dockBadges), as one
            // centered glass dock that fitHero scales to fill the panel. The
            // panel does not clip, so the tuning menu can open past its bottom
            // edge.
            '<div id="v3-hero" class="v3-hero relative rounded-xl flex items-center justify-center bg-fb-bg">' +
            // Hero artwork (neon note-highway), full-bleed and right-anchored.
            // Placeholder cropped from the design mock — swap
            // static/v3/brand/hero.png for the designer's high-res original
            // (same path) when available.
            '<div class="absolute inset-0 rounded-xl overflow-hidden" aria-hidden="true">' +
            '<img src="/static/v3/brand/hero.png" alt="" class="v3-hero-art" onerror="this.style.display=\'none\'">' +
            '<div class="v3-hero-scrim"></div></div>' +
            '<div class="v3-hero-dock">' +
            '<div id="v3-hero-badges" class="v3-hero-badges"></div>' +
            '</div></div>' +
            continueCard + vstShelf + jumpShelf +
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
        root.querySelector('#v3-continue')?.addEventListener('click', () => resume(cont.filename, cont.last_position, cont.arrangement));
        root.querySelector('#v3-pick')?.addEventListener('click', () => window.playSong && window.playSong(enc(pick.filename)));
        root.querySelector('#v3-continue-pick')?.addEventListener('click', () => window.showScreen && window.showScreen('v3-songs'));
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
        watchHero(root.querySelector('#v3-hero'));
        wireShelf(root.querySelector('#v3-jump'));
        renderVst(root);
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

    // Resize observers of the current render. render() disconnects them
    // before it replaces the panels. A frame callback merges the calls, and
    // keeps a size change in a callback out of the same observer round.
    let _observers = [];
    function observe(el, fn) {
        if (!el || typeof ResizeObserver !== 'function') return;
        let frame = 0;
        const ro = new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fn);
        });
        ro.observe(el);
        _observers.push(ro);
    }
    function disconnectObservers() {
        _observers.forEach((ro) => { try { ro.disconnect(); } catch (e) { /* */ } });
        _observers = [];
    }

    // ── Hero: scale the cards to fill the panel ──────────────────────────---
    // CSS `zoom` (v3.css, --hero-zoom) scales the three cards as one dock.
    // Their layout stays the same, the text stays sharp, and the tuning menu
    // (a sibling of its button, not a child) keeps its normal size. The dock
    // fills HERO_FILL_W of the panel width or HERO_FILL_H of its height,
    // whichever it gets to first.
    const HERO_FILL_W = 0.8;
    const HERO_FILL_H = 0.56;
    const HERO_ZOOM_MIN = 0.6;
    const HERO_ZOOM_MAX = 2.2;
    function heroZoom(dockW, dockH, heroW, heroH) {
        if (!(dockW > 0 && dockH > 0 && heroW > 0 && heroH > 0)) return 1;
        const z = Math.min((heroW * HERO_FILL_W) / dockW, (heroH * HERO_FILL_H) / dockH);
        return Math.round(Math.max(HERO_ZOOM_MIN, Math.min(HERO_ZOOM_MAX, z)) * 1000) / 1000;
    }
    function fitHero(hero) {
        const dock = hero && hero.isConnected ? hero.querySelector('.v3-hero-dock') : null;
        if (!dock) return;
        dock.style.setProperty('--hero-zoom', '1');   // measure the natural size
        dock.style.setProperty('--hero-zoom',
            String(heroZoom(dock.offsetWidth, dock.offsetHeight, hero.clientWidth, hero.clientHeight)));
    }
    // Fit again when the panel changes size, and when a card changes width
    // (the profile card re-renders with a new streak or balance).
    function watchHero(hero) {
        if (!hero) return;
        const fit = () => fitHero(hero);
        fit();
        observe(hero, fit);
        observe(hero.querySelector('#v3-hero-badges'), fit);
    }

    // ── Shelves: "Jump back in" and the VST panel ────────────────────────---
    // One panel type for the two: a heading, a status line, paging buttons and
    // a row of square tiles that scrolls sideways. The row fades out at each
    // edge that has more tiles past it, and the paging buttons show only when
    // the tiles do not all fit.
    function shelf(id, title, body, extra) {
        return '<section id="' + id + '" class="v3-shelf rounded-xl border border-fb-border/50 bg-fb-card/60" aria-labelledby="' + id + '-title">' +
            '<div class="v3-shelf-head">' +
            '<h3 id="' + id + '-title" class="text-xs uppercase tracking-wider text-fb-textDim">' + esc(title) + '</h3>' +
            '<span class="v3-shelf-status" data-shelf-status aria-live="polite"></span>' +
            (extra || '') +
            '<button type="button" class="v3-shelf-nav" data-shelf-prev aria-label="Scroll left" hidden>‹</button>' +
            '<button type="button" class="v3-shelf-nav" data-shelf-next aria-label="Scroll right" hidden>›</button>' +
            '</div>' +
            '<div class="v3-shelf-row" data-shelf-row>' + body + '</div></section>';
    }
    function wireShelf(section) {
        const row = section ? section.querySelector('[data-shelf-row]') : null;
        if (!row) return;
        const prev = section.querySelector('[data-shelf-prev]');
        const next = section.querySelector('[data-shelf-next]');
        const update = () => {
            const max = row.scrollWidth - row.clientWidth;
            const over = max > 1;
            const atStart = row.scrollLeft <= 1;
            const atEnd = row.scrollLeft >= max - 1;
            prev.hidden = !over;
            next.hidden = !over;
            prev.disabled = atStart;
            next.disabled = atEnd;
            row.classList.toggle('v3-shelf-fade-l', over && !atStart);
            row.classList.toggle('v3-shelf-fade-r', over && !atEnd);
        };
        // A page is most of the visible width, so one tile stays in view
        // across the move. Scroll snap then aligns the first tile.
        const page = (dir) => {
            const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            row.scrollBy({ left: dir * Math.max(1, Math.round(row.clientWidth * 0.8)), behavior: still ? 'auto' : 'smooth' });
        };
        prev.addEventListener('click', () => page(-1));
        next.addEventListener('click', () => page(1));
        row.addEventListener('scroll', update, { passive: true });
        observe(row, update);
        update();
    }

    // ── VST panel ────────────────────────────────────────────────────────---
    // The desktop app's plugin catalog (feedBackDesktop.audio, the list of the
    // Audio page) as a shelf of pictures. A click on a tile is a footswitch:
    // - A plugin that is not in the chain loads, as a click in the Audio page
    //   list does, and its window opens.
    // - A plugin that is on turns off (bypass, so its settings stay).
    // - A plugin that is off turns on again.
    // Only one Archetype plugin is in the chain at a time: a load or a turn-on
    // removes the other Archetype plugins first. The small button on a tile in
    // the chain opens the plugin window.
    // Pictures: the player's own picture (/api/vst/images, a folder of files
    // named after the plugins), else a VST3 snapshot (/api/vst/pictures), else
    // a pedal photo of the Plugins page with the initials. The web app has no
    // audio engine, so it shows a note.
    const VST_RECENT_KEY = 'v3.home.vstRecent';
    const VST_RECENT_MAX = 12;
    // The player uses only the Neural DSP Archetype amp plugins, so the panel
    // lists only those. A catalog with no Archetype plugin shows all plugins.
    const VST_ONLY = /^Archetype\s+/i;
    const _vstPictureUrls = Object.create(null);   // plugin path -> picture URL
    const _vstPictureAsked = new Set();             // paths sent to the server
    let _vstToken = 0;

    function vstAudio() {
        const a = window.feedBackDesktop && window.feedBackDesktop.audio;
        return a && typeof a.getKnownPlugins === 'function' && typeof a.loadVST === 'function' ? a : null;
    }
    // One key per plugin (maker + name). The catalog can list a bundle two
    // times (the bundle and the binary in it), and the two give one tile.
    function vstKey(p) {
        return (String((p && p.manufacturer) || '').trim() + '|' + String((p && p.name) || '').trim()).toLowerCase();
    }
    // The bundle folder of a VST3 path, for compares: the chain can hold the
    // binary path in a bundle, and the tile the bundle path.
    function vstPathKey(path) {
        const s = String(path || '').replace(/\//g, '\\').toLowerCase();
        const m = s.match(/^.*?\.vst3(?=\\|$)/);
        return m ? m[0] : s;
    }
    // The tiles, in order: the plugins loaded last from this panel, then the
    // effects A-Z, then the instruments A-Z. One tile per plugin (the shortest
    // path wins), and no tiles for the stages that Rig Builder ships.
    function vstPlugins(list, recent) {
        const byKey = new Map();
        (Array.isArray(list) ? list : []).forEach((p) => {
            if (!p || typeof p.path !== 'string' || !p.path || !p.name) return;
            if (/[\\/]rig_builder[\\/]/i.test(p.path)) return;
            const k = vstKey(p);
            const have = byKey.get(k);
            if (!have || p.path.length < have.path.length) byKey.set(k, p);
        });
        const rank = new Map();
        (Array.isArray(recent) ? recent : []).forEach((k, i) => { if (!rank.has(k)) rank.set(k, i); });
        const pos = (p) => (rank.has(vstKey(p)) ? rank.get(vstKey(p)) : Number.MAX_SAFE_INTEGER);
        return Array.from(byKey.values()).sort((a, b) =>
            (pos(a) - pos(b)) ||
            ((a.isInstrument ? 1 : 0) - (b.isInstrument ? 1 : 0)) ||
            String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }) ||
            vstKey(a).localeCompare(vstKey(b)));
    }
    // The tiles the panel shows: the VST_ONLY plugins, or all when there are
    // none. The order of the list stays.
    function vstShown(plugins) {
        const only = plugins.filter((p) => VST_ONLY.test(String(p.name)));
        return only.length ? only : plugins;
    }
    // The tile name without the VST_ONLY word, which every tile repeats
    // ("Archetype Cory Wong X" gives "Cory Wong X").
    function vstShortName(name) {
        const s = String(name || '');
        return s.replace(VST_ONLY, '') || s;
    }
    // The letters on the pedal face: the first letters of the first two
    // words ("Valhalla Room" and "ValhallaRoom" give "VR"), or the start of a
    // one-word name ("Serum" gives "Se", "OTT" stays "OTT"). A last word that
    // is a version tag ("X", "3") does not count, so "Nolly X" gives "No".
    function vstInitials(name) {
        const words = String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(/[^A-Za-z0-9\u00C0-\uFFFF]+/).filter(Boolean);
        while (words.length > 1 && /^(X|\d+)$/i.test(words[words.length - 1])) words.pop();
        if (!words.length) return '?';
        if (words.length === 1) {
            const w = words[0];
            return w.length <= 3 ? w : w.charAt(0).toUpperCase() + w.charAt(1).toLowerCase();
        }
        return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
    }
    // A fixed pedal photo for each plugin (an FNV-1a hash of its key), so a
    // plugin keeps its look with no stored state.
    function vstHash(s) {
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return h >>> 0;
    }
    function vstSkin(p, skins) {
        return Array.isArray(skins) && skins.length ? skins[vstHash(vstKey(p)) % skins.length] : null;
    }
    function vstRecent() {
        try {
            const v = JSON.parse(window.localStorage.getItem(VST_RECENT_KEY) || '[]');
            return Array.isArray(v) ? v.filter((k) => typeof k === 'string').slice(0, VST_RECENT_MAX) : [];
        } catch (e) { return []; }
    }
    function rememberVst(p) {
        const k = vstKey(p);
        const list = [k].concat(vstRecent().filter((x) => x !== k)).slice(0, VST_RECENT_MAX);
        try { window.localStorage.setItem(VST_RECENT_KEY, JSON.stringify(list)); } catch (e) { /* private mode */ }
    }
    // The VST slots of the signal chain ([] when the engine cannot tell).
    async function vstChain(api) {
        if (typeof api.getChainState !== 'function') return [];
        try {
            const chain = await api.getChainState();
            return Array.isArray(chain) ? chain.filter((s) => s && s.type === 0 && s.path) : [];
        } catch (e) { return []; }
    }
    // Picture URLs for the paths. The server is asked one time per path in a
    // page load. A failed request asks again at the next render.
    async function vstPictures(paths) {
        const ask = paths.filter((p) => !_vstPictureAsked.has(p));
        if (ask.length) {
            try {
                const r = await fetch('/api/vst/pictures', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paths: ask }),
                });
                const data = r.ok ? await r.json() : null;
                if (data && data.pictures && typeof data.pictures === 'object') {
                    ask.forEach((p) => _vstPictureAsked.add(p));
                    Object.keys(data.pictures).forEach((p) => {
                        if (typeof data.pictures[p] === 'string') _vstPictureUrls[p] = data.pictures[p];
                    });
                }
            } catch (e) { /* no pictures this time */ }
        }
        return _vstPictureUrls;
    }
    // The player's own pictures: {name key: URL}. The panel asks at each
    // render, so a new file in the folder shows at the next visit to Home.
    async function vstImages() {
        try {
            const r = await fetch('/api/vst/images', { cache: 'no-store' });
            const data = r.ok ? await r.json() : null;
            return data && data.images && typeof data.images === 'object' ? data.images : {};
        } catch (e) { return {}; }
    }
    // The compare key of a name: lower case, letters and digits only. The
    // server makes the same key from the file name ("CoryWongX.png").
    function vstNameKey(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }
    // The player's picture of a plugin: a file named after the short name
    // ("Abasi.png") or the full name ("Archetype Abasi.png"), else null.
    function vstImageFor(p, images) {
        if (!p || !images) return null;
        const keys = [vstNameKey(vstShortName(p.name)), vstNameKey(p.name)];
        for (const k of keys) {
            if (k && typeof images[k] === 'string') return images[k];
        }
        return null;
    }
    // What a click on the tile of plugin p does, from the chain (VST slots)
    // and the path keys of the one-at-a-time plugins (soloKeys):
    // - action 'off': the plugin is on, so turn it off (bypass).
    // - action 'on': the plugin is off, so turn it on.
    // - action 'load': the plugin is not in the chain, so load it.
    // `remove` holds the slot ids of the other one-at-a-time plugins, which
    // leave the chain before an 'on' or a 'load' of a one-at-a-time plugin.
    function vstClickPlan(p, chain, soloKeys) {
        const key = vstPathKey(p && p.path);
        const slots = Array.isArray(chain) ? chain : [];
        const slot = slots.find((s) => s && vstPathKey(s.path) === key) || null;
        if (slot && !slot.bypassed) return { action: 'off', slot, remove: [] };
        const solo = (s) => (soloKeys && soloKeys.has(vstPathKey(s.path))) || VST_ONLY.test(String(s.name || ''));
        const remove = p && VST_ONLY.test(String(p.name))
            ? slots.filter((s) => s && s !== slot && Number.isInteger(s.id) && vstPathKey(s.path) !== key && solo(s)).map((s) => s.id)
            : [];
        return { action: slot ? 'on' : 'load', slot, remove };
    }
    function vstTile(p, picture, own) {
        const skins = window.v3PedalSkins;
        const skin = skins && typeof skins.url === 'function' ? vstSkin(p, skins.list) : null;
        const skinUrl = skin ? skins.url(skin) : '';
        const kind = p.isInstrument ? 'Instrument' : 'Effect';
        const name = vstShortName(p.name);
        const sub = VST_ONLY.test(String(p.name)) ? 'Archetype' : (p.manufacturer || kind);
        // The pedal is always drawn. A picture covers it, and a picture that
        // does not load removes itself, so the pedal shows again.
        return '<div class="v3-shelf-tile v3-vst-cell" data-vst-path="' + esc(p.path) + '" data-vst-sub="' + esc(sub) + '">' +
            '<button type="button" class="v3-vst-tile" data-vst-toggle aria-pressed="false" ' +
            'title="' + esc(p.name + (p.manufacturer ? ' — ' + p.manufacturer : '') + ' · ' + kind) + '">' +
            '<span class="v3-shelf-art v3-vst-art">' +
            '<span class="v3-vst-pedal"' + (skinUrl ? ' style="--skin:url(\'' + esc(skinUrl) + '\')"' : '') + '>' +
            '<span class="v3-vst-mono" aria-hidden="true">' + esc(vstInitials(name)) + '</span>' +
            '<span class="v3-vst-glow" aria-hidden="true"></span></span>' +
            (picture ? '<img src="' + esc(picture) + '" alt="" class="v3-vst-shot' + (own ? ' is-own' : '') + '" loading="lazy" decoding="async" onerror="this.remove()">' : '') +
            '</span>' +
            '<span class="v3-shelf-title">' + esc(name) + '</span>' +
            '<span class="v3-shelf-sub">' + esc(sub) + '</span></button>' +
            '<button type="button" class="v3-vst-edit" data-vst-edit title="Open the plugin window" aria-label="Open the ' + esc(name) + ' window">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg></button></div>';
    }
    // Show the chain state on the tiles: in the chain, on or off.
    function vstSync(row, chain) {
        const byKey = new Map(chain.map((s) => [vstPathKey(s.path), s]));
        row.querySelectorAll('[data-vst-path]').forEach((cell) => {
            const slot = byKey.get(vstPathKey(cell.getAttribute('data-vst-path')));
            const off = !!(slot && slot.bypassed);
            cell.classList.toggle('is-in-chain', !!slot);
            cell.classList.toggle('is-off', off);
            const btn = cell.querySelector('[data-vst-toggle]');
            if (btn) btn.setAttribute('aria-pressed', slot && !off ? 'true' : 'false');
            const sub = cell.querySelector('.v3-shelf-sub');
            if (sub) sub.textContent = (cell.getAttribute('data-vst-sub') || '') + (off ? ' · off' : '');
        });
    }
    async function renderVst(root) {
        const section = root.querySelector('#v3-vst');
        const row = section ? section.querySelector('[data-shelf-row]') : null;
        if (!row) return;
        const myToken = ++_vstToken;
        const stale = () => myToken !== _vstToken || !row.isConnected;
        const status = section.querySelector('[data-shelf-status]');
        const note = (msg) => { row.innerHTML = '<p class="v3-shelf-empty">' + esc(msg) + '</p>'; };
        const api = vstAudio();
        if (!api) { note('VST plugins load in the RockStar desktop app.'); return; }
        const audioLink = section.querySelector('[data-vst-audio]');
        if (audioLink) {
            audioLink.classList.remove('hidden');
            audioLink.addEventListener('click', () => window.showScreen && window.showScreen('plugin-audio_engine'));
        }
        let available = true;
        if (typeof api.isAvailable === 'function') {
            try { available = (await api.isAvailable()) !== false; } catch (e) { available = false; }
        }
        if (stale()) return;
        if (!available) { note('The audio engine is off, so plugins cannot load. The Audio page has details.'); return; }
        let list = [];
        try { list = await api.getKnownPlugins(); } catch (e) { list = []; }
        if ((!Array.isArray(list) || !list.length) && typeof api.loadPluginList === 'function') {
            // The Audio page reads the saved catalog when it starts. Home can
            // render first, so read it here too.
            try { await api.loadPluginList(); list = await api.getKnownPlugins(); } catch (e) { list = []; }
        }
        if (stale()) return;
        const all = vstPlugins(list, vstRecent());
        if (!all.length) { note('No VST plugins yet. Scan for plugins on the Audio page.'); return; }
        const plugins = vstShown(all);
        const label = (plugins.length < all.length ? ' Archetype plugin' : ' plugin') + (plugins.length === 1 ? '' : 's');
        const [images, pictures, chain] = await Promise.all([
            vstImages(), vstPictures(plugins.map((p) => p.path)), vstChain(api)]);
        if (stale()) return;
        row.innerHTML = plugins.map((p) => {
            const own = vstImageFor(p, images);
            return vstTile(p, own || pictures[p.path] || null, !!own);
        }).join('');
        vstSync(row, chain);
        if (status) status.textContent = plugins.length + label;
        const byPath = new Map(plugins.map((p) => [p.path, p]));
        const soloKeys = new Set(all.filter((p) => VST_ONLY.test(String(p.name))).map((p) => vstPathKey(p.path)));
        row.querySelectorAll('[data-vst-path]').forEach((cell) => {
            const p = byPath.get(cell.getAttribute('data-vst-path'));
            const toggle = cell.querySelector('[data-vst-toggle]');
            const edit = cell.querySelector('[data-vst-edit]');
            if (toggle) toggle.addEventListener('click', () => clickVst(api, row, cell, p, status, soloKeys));
            if (edit) edit.addEventListener('click', () => editVst(api, p, status));
        });
        wireShelf(section);
    }
    async function clickVst(api, row, cell, p, status, soloKeys) {
        if (!p || row.querySelector('.v3-vst-cell.is-busy')) return;
        const say = (msg) => { if (status && status.isConnected) status.textContent = msg; };
        const name = vstShortName(p.name);
        cell.classList.add('is-busy');
        cell.setAttribute('aria-busy', 'true');
        const chain = await vstChain(api);
        const plan = vstClickPlan(p, chain, soloKeys);
        const gone = chain.filter((s) => plan.remove.includes(s.id)).map((s) => vstShortName(s.name));
        say((plan.action === 'off' ? 'Turning off ' : plan.action === 'on' ? 'Turning on ' : 'Loading ') + name + '…');
        let ok = false;
        let opened = false;
        try {
            if (plan.action === 'off') {
                ok = await vstSetBypass(api, plan.slot.id, true);
            } else {
                for (const id of plan.remove) await vstRemove(api, id);
                if (plan.action === 'on') {
                    ok = await vstSetBypass(api, plan.slot.id, false);
                } else {
                    const slotId = await api.loadVST(p.path);
                    ok = slotId >= 0;
                    if (ok) {
                        refreshAudioPage(slotId);
                        if (typeof api.openPluginEditor === 'function') {
                            try { opened = (await api.openPluginEditor(slotId)) !== false; } catch (e) { opened = false; }
                        }
                    }
                }
            }
        } catch (e) { ok = false; }
        cell.classList.remove('is-busy');
        cell.removeAttribute('aria-busy');
        if (row.isConnected) vstSync(row, await vstChain(api));
        if (!ok) {
            say('Could not ' + (plan.action === 'load' ? 'load ' : 'turn ' + plan.action + ' ') + name + '. The Audio page has details.');
            return;
        }
        if (plan.action !== 'off') rememberVst(p);
        const out = gone.length ? ' Removed ' + gone.join(', ') + '.' : '';
        if (plan.action === 'off') say(name + ' is off. Click it again to turn it on.');
        else if (plan.action === 'on') say(name + ' is on.' + out);
        else say('Loaded ' + name + (opened ? '. Its window is open.' : '.') + out);
    }
    async function editVst(api, p, status) {
        if (!p) return;
        const key = vstPathKey(p.path);
        const slot = (await vstChain(api)).find((s) => vstPathKey(s.path) === key);
        if (!slot) return;
        let opened = false;
        try {
            if (typeof window._aeOpenEditor === 'function') { await window._aeOpenEditor(slot.id); opened = true; }
            else if (typeof api.openPluginEditor === 'function') opened = (await api.openPluginEditor(slot.id)) !== false;
        } catch (e) { opened = false; }
        if (status && status.isConnected) {
            const name = vstShortName(p.name);
            status.textContent = opened ? 'The ' + name + ' window is open.' : 'Could not open the ' + name + ' window.';
        }
    }
    // Bypass through the Audio page when it is loaded, so its chain list
    // shows the change. Else call the engine.
    async function vstSetBypass(api, slotId, bypassed) {
        if (typeof window._aeToggleBypass === 'function') { await window._aeToggleBypass(slotId, bypassed); return true; }
        if (typeof api.setBypass !== 'function') return false;
        return (await api.setBypass(slotId, bypassed)) !== false;
    }
    async function vstRemove(api, slotId) {
        if (typeof window._aeRemoveSlot === 'function') { await window._aeRemoveSlot(slotId); return; }
        if (typeof api.closePluginEditor === 'function') { try { await api.closePluginEditor(slotId); } catch (e) { /* */ } }
        if (typeof api.removeProcessor === 'function') await api.removeProcessor(slotId);
    }
    // The Audio page draws its chain list again only after its own changes.
    // _aeToggleBypass sets the bypass and then draws the list. A new slot is
    // not bypassed, so "not bypassed" changes nothing and the list shows the
    // new plugin.
    function refreshAudioPage(slotId) {
        if (typeof window._aeToggleBypass !== 'function') return;
        try { Promise.resolve(window._aeToggleBypass(slotId, false)).catch(() => {}); } catch (e) { /* */ }
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

    // Small accuracy pill for the "Jump back in" tiles.
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
