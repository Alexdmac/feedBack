// User frame-rate cap for the highway's rAF loop (Player > Visualization &
// quality > FPS cap). Pure helpers: no hwState, DOM or clock, so they are
// safe at module scope and testable on their own.
import { _MAX_FPS_MAX, _MAX_FPS_MIN } from './highway-constants.js';

// A stored or requested cap: 0 = off (one draw per display refresh),
// otherwise a whole number of frames per second within the clamp.
export function _sanitizeMaxFps(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.max(_MAX_FPS_MIN, Math.min(_MAX_FPS_MAX, n));
}

// Pace draws on the rAF timestamp. last = the slot of the last capped draw
// (0 = none yet), ts = this tick's rAF timestamp, iv = 1000 / cap (ms),
// slack = how early a tick may draw (absorbs rAF jitter, so a 60 cap on a
// 60 Hz display never drops to 30). Returns NaN to skip this tick, else the
// slot to store once the frame really draws.
//  - Too early: wait for a later vsync.
//  - First frame, a long gap or a clock oddity: resync to now (no burst of
//    catch-up frames after a hitch).
//  - On time or late: stay on the grid, so the average is exact even when
//    the cap doesn't divide the refresh (60 on 144 Hz averages 60, not 48).
//  - Early within the slack: snap to now, so a 60.05 Hz panel under a 60
//    cap doesn't drift into skipping a vsync every second or so.
export function _frameCapNext(last, ts, iv, slack) {
    const e = ts - last;
    if (e >= 0 && e < iv - slack) return NaN;
    if (e < 0 || e >= 2 * iv) return ts;
    if (e >= iv) return last + iv;
    return ts;
}
