/**
 * LogicLab — Signal Animation
 * A tiny timeline that drives animated "pulses" travelling along wires plus
 * instant activation events (gate glows, output LEDs) with staggered delays.
 *
 * Task shapes:
 *   instant : { delay, run }
 *   pulse   : { delay, dur, draw(t), run(), cleanup() }
 */

window.SignalAnimator = (function () {

    var reduced = window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var items = [];
    var raf = 0;
    var active = false;
    var start = 0;
    var doneFn = null;

    function frame() {
        if (!active) return;
        var elapsed = performance.now() - start;
        var allDone = true;

        items.forEach(function (it) {
            if (it._finished) return;
            if (elapsed >= it.delay) {
                if (!it._started) {
                    it._started = true;
                    if (!it.draw) { /* instant task */ }
                }
                if (it.draw) {
                    var t = Math.min(1, (elapsed - it.delay) / it.dur);
                    if (reduced && t > 0) t = 1;
                    it.draw(t);
                    if (t >= 1) {
                        it._finished = true;
                        if (it.run) it.run();
                    }
                } else {
                    it._finished = true;
                    if (it.run) it.run();
                }
            } else {
                allDone = false;
            }
            if (!it._started) allDone = false;
        });

        if (allDone) {
            finish();
        } else {
            raf = requestAnimationFrame(frame);
        }
    }

    function play(list, done) {
        stop();
        items = list;
        doneFn = done || null;
        items.forEach(function (it) { it._started = false; it._finished = false; });
        if (!items.length) { if (doneFn) { var d = doneFn; doneFn = null; d(); } return; }
        active = true;
        start = performance.now();
        raf = requestAnimationFrame(frame);
    }

    function stop() {
        active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        items.forEach(function (it) { if (it.cleanup) it.cleanup(); });
        var d = doneFn; doneFn = null;
        items = [];
        if (d) d();
    }

    function pause() {
        active = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }

    function isActive() { return active; }

    return {
        play: play,
        stop: stop,
        pause: pause,
        isActive: isActive
    };
})();