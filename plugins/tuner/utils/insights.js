/**
 * Tuner "insights": a minimal pitch-confidence meter and a tuning-history
 * strip graph, shown in the tuner panel underneath whichever visualization is
 * active. Both features are ported from Trace Tuner
 * (https://github.com/Fannon/trace-tuner, MIT) — its confidence meter and
 * "tuning history" graph — adapted to the plugin's DOM/canvas panel.
 *
 * Browser: defines window._tunerInsights = { mount, loadPrefs, savePrefs, ...helpers }.
 * Node tests: the pure helpers are exported via module.exports.
 *
 * Performance (see CLAUDE.md): every element is created once at mount and kept
 * by reference — nothing here queries the DOM per frame. The graph draws only
 * when a new detector frame arrives (event-driven, ≈30 Hz, no rAF loop), and
 * the caller only feeds frames while the tuner panel is open, so nothing runs
 * while the panel is hidden.
 */
(function () {
    'use strict';

    const PREFS_KEY = 'feedBack_tuner_display';
    // Number of frames kept in the history. The detector posts a result every
    // ~30 ms, so 160 points ≈ 5 s (Trace Tuner also keeps 160 points).
    const HISTORY_LEN = 160;
    // Vertical range of the history graph, ±cents (Trace Tuner: 50).
    const RANGE_CENTS = 50;
    // In-tune band, ±cents — matches the plugin's own "in tune" threshold
    // (the default gauge turns green below 5 cents).
    const IN_TUNE_CENTS = 5;
    // Jumps larger than this between consecutive points break the trace
    // rather than drawing a vertical streak (Trace Tuner: 35).
    const TRACE_BREAK_CENTS = 35;
    // Frames below this detector confidence leave a gap in the history
    // (Trace Tuner's HOLD_CONFIDENCE).
    const MIN_HISTORY_CONFIDENCE = 0.6;
    const GRAPH_HEIGHT = 56;

    // ── Pure helpers (unit-tested) ────────────────────────────────────

    function clamp01(v) {
        return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
    }

    // Exponential smoothing for the meter so it doesn't flicker frame to frame.
    // Rises faster than it falls, so a fresh pluck registers immediately.
    function smoothConfidence(prev, next) {
        const p = clamp01(prev), n = clamp01(next);
        const k = n > p ? 0.6 : 0.25;
        return p + (n - p) * k;
    }

    // Trace Tuner's confidence colour: dim slate → accent blue, gamma 0.75.
    function confidenceColor(confidence) {
        const t = Math.pow(clamp01(confidence), 0.75);
        const lerp = (a, b) => Math.round(a + (b - a) * t);
        // Slate (64,78,96) → the app accent #4080e0 (64,128,224).
        return 'rgb(64,' + lerp(78, 128) + ',' + lerp(96, 224) + ')';
    }

    // Green within the in-tune band, amber within 15 cents, red beyond.
    function centsColor(cents) {
        const a = Math.abs(cents);
        if (a <= IN_TUNE_CENTS) return [74, 222, 128];
        if (a <= 15) return [232, 192, 64];
        return [245, 111, 92];
    }

    // Line alpha fades with confidence (Trace Tuner: 30 + c^0.6 * 225 of 255).
    function confidenceAlpha(confidence) {
        return (30 + Math.pow(clamp01(confidence), 0.6) * 225) / 255;
    }

    function centsToY(cents, height, range) {
        const r = range || RANGE_CENTS;
        const c = Math.max(-r, Math.min(r, cents));
        return height / 2 - (c / r) * (height / 2);
    }

    // Whether a frame should be recorded as a point (vs a gap).
    function isHistoryPoint(cents, confidence) {
        return Number.isFinite(cents) && clamp01(confidence) >= MIN_HISTORY_CONFIDENCE;
    }

    // Whether two consecutive recorded points are joined by a line segment.
    function pointsConnect(prev, cur) {
        if (!prev || !cur) return false;
        if (!Number.isFinite(prev.cents) || !Number.isFinite(cur.cents)) return false;
        if (!sameTarget(prev.target, cur.target)) return false;
        return Math.abs(cur.cents - prev.cents) <= TRACE_BREAK_CENTS;
    }

    function sameTarget(a, b) {
        if (a == null || b == null) return a == null && b == null;
        return Math.abs(a - b) < 0.01;
    }

    // Fixed-size ring buffer of { cents, confidence, target }; NaN cents = gap.
    function createHistory(len) {
        const size = len || HISTORY_LEN;
        const cents = new Float32Array(size).fill(NaN);
        const conf = new Float32Array(size);
        const target = new Float64Array(size).fill(NaN);
        let pos = 0;
        return {
            size,
            push(c, confidence, t) {
                const ok = isHistoryPoint(c, confidence);
                cents[pos] = ok ? c : NaN;
                conf[pos] = ok ? clamp01(confidence) : 0;
                target[pos] = ok && Number.isFinite(t) ? t : NaN;
                pos = (pos + 1) % size;
            },
            clear() {
                cents.fill(NaN); conf.fill(0); target.fill(NaN); pos = 0;
            },
            // Oldest → newest. `i` in [0, size).
            at(i) {
                const k = (pos + i) % size;
                return { cents: cents[k], confidence: conf[k], target: target[k] };
            },
            // Allocation-free variant for the per-frame draw path.
            centsAt(i) { return cents[(pos + i) % size]; },
            confidenceAt(i) { return conf[(pos + i) % size]; },
            targetAt(i) { return target[(pos + i) % size]; },
        };
    }

    // ── Preferences (localStorage, per viewer) ────────────────────────

    function loadPrefs() {
        const prefs = { showConfidence: true, showHistory: true };
        try {
            const s = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            if (typeof s.showConfidence === 'boolean') prefs.showConfidence = s.showConfidence;
            if (typeof s.showHistory === 'boolean') prefs.showHistory = s.showHistory;
        } catch (_) { /* storage unavailable → defaults */ }
        return prefs;
    }

    function savePrefs(patch) {
        const next = Object.assign(loadPrefs(), patch || {});
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (_) { /* unavailable */ }
        return next;
    }

    // ── DOM widgets ───────────────────────────────────────────────────

    function mount(container) {
        const root = document.createElement('div');
        root.className = 'tuner-insights w-full mt-3';

        // Confidence meter: a thin bar, label on the left.
        const meterRow = document.createElement('div');
        meterRow.className = 'flex items-center w-full gap-2';
        meterRow.title = 'Pitch detection confidence';
        const meterLabel = document.createElement('span');
        meterLabel.className = 'text-[10px] text-fb-textDim select-none';
        meterLabel.textContent = 'Confidence';
        const track = document.createElement('div');
        track.style.cssText = 'flex:1;height:6px;border-radius:3px;overflow:hidden;background:rgba(15,18,24,0.7);border:1px solid rgba(255,255,255,0.06)';
        const fill = document.createElement('div');
        fill.style.cssText = 'height:100%;width:0%;border-radius:3px;background:' + confidenceColor(0) + ';transition:width 60ms linear';
        track.appendChild(fill);
        meterRow.appendChild(meterLabel);
        meterRow.appendChild(track);
        root.appendChild(meterRow);

        // History graph.
        const graphWrap = document.createElement('div');
        graphWrap.className = 'w-full';
        graphWrap.style.marginTop = '8px';
        const graphLabel = document.createElement('div');
        graphLabel.className = 'flex justify-between text-[10px] text-fb-textDim select-none';
        graphLabel.style.marginBottom = '2px';
        const glLeft = document.createElement('span'); glLeft.textContent = 'Tuning history';
        const glRight = document.createElement('span'); glRight.textContent = '±' + RANGE_CENTS + '¢';
        graphLabel.appendChild(glLeft); graphLabel.appendChild(glRight);
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'display:block;width:100%;height:' + GRAPH_HEIGHT + 'px;border-radius:6px;background:rgba(15,18,24,0.7);border:1px solid rgba(255,255,255,0.06)';
        canvas.setAttribute('aria-label', 'Tuning history: cents deviation over the last few seconds');
        graphWrap.appendChild(graphLabel);
        graphWrap.appendChild(canvas);
        root.appendChild(graphWrap);

        container.appendChild(root);

        const history = createHistory(HISTORY_LEN);
        let ctx = null;
        let cssW = 0, cssH = GRAPH_HEIGHT, dpr = 1;
        let smoothed = 0;
        let lastPct = -1;
        let lastTarget = null;
        let prefs = loadPrefs();

        function applyPrefs(p) {
            prefs = p || loadPrefs();
            meterRow.style.display = prefs.showConfidence ? '' : 'none';
            graphWrap.style.display = prefs.showHistory ? '' : 'none';
            root.style.display = (prefs.showConfidence || prefs.showHistory) ? '' : 'none';
            if (prefs.showHistory) { measure(); draw(); }
        }

        // Size the backing store. Called on open / resize / pref change only —
        // never per frame (reading clientWidth forces layout).
        function measure() {
            const w = canvas.clientWidth;
            if (!w) return; // hidden — try again on next open
            dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
            cssW = w; cssH = GRAPH_HEIGHT;
            canvas.width = Math.round(cssW * dpr);
            canvas.height = Math.round(cssH * dpr);
            ctx = canvas.getContext('2d');
        }

        function draw() {
            if (!ctx || !cssW || !prefs.showHistory) return;
            const W = cssW, H = cssH;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, W, H);

            // In-tune band.
            const bandTop = centsToY(IN_TUNE_CENTS, H), bandBot = centsToY(-IN_TUNE_CENTS, H);
            ctx.fillStyle = 'rgba(74,222,128,0.12)';
            ctx.fillRect(0, bandTop, W, bandBot - bandTop);
            // ±25 grid lines and the 0-cent centre line.
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.beginPath();
            for (const c of [25, -25]) {
                const y = Math.round(centsToY(c, H)) + 0.5;
                ctx.moveTo(0, y); ctx.lineTo(W, y);
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(64,128,224,0.7)';
            ctx.beginPath();
            const y0 = Math.round(centsToY(0, H)) + 0.5;
            ctx.moveTo(0, y0); ctx.lineTo(W, y0);
            ctx.stroke();

            // Trace: one segment per consecutive pair of connected points.
            const n = history.size;
            const step = W / (n - 1);
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            let px = 0, py = 0, pc = NaN, pconf = 0, pt = NaN, havePrev = false;
            for (let i = 0; i < n; i++) {
                const c = history.centsAt(i);
                if (!Number.isFinite(c)) { havePrev = false; continue; }
                const conf = history.confidenceAt(i);
                const t = history.targetAt(i);
                const x = i * step;
                const y = centsToY(c, H);
                if (havePrev && (pt === t || (Number.isNaN(pt) && Number.isNaN(t)))
                    && Math.abs(c - pc) <= TRACE_BREAK_CENTS) {
                    const rgb = centsColor((c + pc) / 2);
                    ctx.strokeStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + confidenceAlpha(Math.min(conf, pconf)).toFixed(3) + ')';
                    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
                } else if (i === n - 1 || !Number.isFinite(history.centsAt(i + 1))) {
                    // Isolated point: draw a dot so a single good frame is visible.
                    const rgb = centsColor(c);
                    ctx.fillStyle = 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + confidenceAlpha(conf).toFixed(3) + ')';
                    ctx.fillRect(x - 1, y - 1, 2, 2);
                }
                px = x; py = y; pc = c; pconf = conf; pt = t; havePrev = true;
            }
        }

        // Feed one detector frame. `cents` / `target` are null for no signal.
        function update(cents, confidence, target) {
            if (prefs.showConfidence) {
                smoothed = smoothConfidence(smoothed, confidence);
                const pct = Math.round(smoothed * 100);
                if (pct !== lastPct) {
                    lastPct = pct;
                    fill.style.width = pct + '%';
                    fill.style.background = confidenceColor(smoothed);
                    meterRow.title = 'Pitch detection confidence: ' + pct + '%';
                }
            }
            if (prefs.showHistory) {
                const has = cents != null && Number.isFinite(cents) && target != null;
                // New target note/string → start a fresh history.
                if (has && lastTarget != null && !sameTarget(lastTarget, target)) history.clear();
                if (has) lastTarget = target;
                history.push(has ? cents : NaN, confidence, has ? target : NaN);
                draw();
            }
        }

        function reset() {
            history.clear();
            lastTarget = null;
            smoothed = 0; lastPct = -1;
            fill.style.width = '0%';
            fill.style.background = confidenceColor(0);
            draw();
        }

        // Drop the trace (e.g. the target string / tuning changed) but keep the meter.
        function clearHistory() {
            history.clear();
            lastTarget = null;
            draw();
        }

        function onOpen() {
            applyPrefs();
            reset();
        }

        function resize() {
            if (prefs.showHistory) { measure(); draw(); }
        }

        return {
            element: root,
            update,
            reset,
            clearHistory,
            onOpen,
            resize,
            applyPrefs,
            get prefs() { return prefs; },
        };
    }

    const api = {
        HISTORY_LEN, RANGE_CENTS, IN_TUNE_CENTS, TRACE_BREAK_CENTS, MIN_HISTORY_CONFIDENCE, PREFS_KEY,
        clamp01, smoothConfidence, confidenceColor, centsColor, confidenceAlpha, centsToY,
        isHistoryPoint, pointsConnect, sameTarget, createHistory, loadPrefs, savePrefs, mount,
    };

    if (typeof window !== 'undefined') window._tunerInsights = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
