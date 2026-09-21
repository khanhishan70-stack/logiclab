/**
 * LogicLab — Circuit Engine
 * Treats the circuit as a directed graph:
 *
 *   Input → Gate → Gate → Output
 *
 * Given a graph of components + wires it computes the steady-state value of
 * every wire and component, plus "levels" (depth from the inputs) used for
 * signal animation and step-by-step simulation.
 */

window.CircuitEngine = (function () {

    var INPUT_TYPES = { HIGH: 1, LOW: 1, SWITCH: 1, CLOCK: 1 };

    function def(type) {
        return window.CircuitComponents[type];
    }

    function isInput(type) {
        return !!INPUT_TYPES[type];
    }

    /**
     * Return the value arriving on a component input port (null if unconnected).
     */
    function portValue(comp, portId, wires, compById) {
        var w = null;
        for (var i = 0; i < wires.length; i++) {
            if (wires[i].to.comp === comp.id && wires[i].to.port === portId) { w = wires[i]; break; }
        }
        if (!w) return null;
        var src = compById[w.from.comp];
        if (!src) return 0;
        return (src._out == null) ? 0 : src._out;
    }

    /**
     * Solve the whole graph. Mutates components with _out / _in caches.
     * Returns a summary object (wire values, comp values, levels, warnings).
     */
    function solve(graph) {
        var comps = graph.components, wires = graph.wires;
        var compById = {};
        comps.forEach(function (c) { compById[c.id] = c; });

        comps.forEach(function (c) { c._out = null; c._in = {}; });

        /* 1. Initialize source components (inputs). */
        comps.forEach(function (c) {
            if (isInput(c.type)) {
                var d = def(c.type);
                c._out = d.eval({ a: c.toggle ? 1 : 0 });
            }
        });

        /* 2. Relax every gate until stable (handles fan-in / fan-out graphs). */
        var changed = true, pass = 0;
        while (changed && pass < 80) {
            changed = false; pass++;
            comps.forEach(function (c) {
                var d = def(c.type);
                if (!d || isInput(c.type)) return;

                var s = { a: c.toggle ? 1 : 0 };
                (d.inputs || []).forEach(function (p) {
                    s[p.id] = portValue(c, p.id, wires, compById) || 0;
                });

                var out;
                if (d.outputs.length === 0) {
                    /* Output component: it simply reflects its input value. */
                    var inPort = (d.inputs && d.inputs[0]) || null;
                    out = inPort ? (portValue(c, inPort.id, wires, compById) || 0) : 0;
                } else {
                    out = d.eval ? d.eval(s) : 0;
                }

                if (c._out == null || c._out !== out) { c._out = out; changed = true; }
            });
        }

        /* 3. Wire values come from their source component. */
        var wireVals = {};
        wires.forEach(function (w) {
            var src = compById[w.from.comp];
            wireVals[w.id] = src ? (src._out || 0) : 0;
        });

        /* 4. Component / wire levels (depth from inputs) by relaxation. */
        var compLevel = {};
        comps.forEach(function (c) { if (isInput(c.type)) compLevel[c.id] = 0; });

        var stable = false;
        for (var it = 0; it < 80; it++) {
            var lvChanged = false;
            comps.forEach(function (c) {
                var d = def(c.type);
                if (!d || isInput(c.type)) return;
                var lv = -1;
                (d.inputs || []).forEach(function (p) {
                    var w = null;
                    for (var i = 0; i < wires.length; i++) {
                        if (wires[i].to.comp === c.id && wires[i].to.port === p.id) { w = wires[i]; break; }
                    }
                    if (w) {
                        var sl = compLevel[w.from.comp];
                        lv = Math.max(lv, (sl == null) ? 0 : sl + 1);
                    } else {
                        lv = Math.max(lv, 0);
                    }
                });
                if (lv < 0) lv = 0;
                if (compLevel[c.id] !== lv) { compLevel[c.id] = lv; lvChanged = true; }
            });
            if (!lvChanged) { stable = true; break; }
        }

        comps.forEach(function (c) { if (compLevel[c.id] == null) compLevel[c.id] = 0; });

        var wireLevel = {};
        wires.forEach(function (w) {
            wireLevel[w.id] = (compLevel[w.from.comp] != null) ? compLevel[w.from.comp] : 0;
        });

        var maxLevel = 0;
        Object.keys(compLevel).forEach(function (k) { maxLevel = Math.max(maxLevel, compLevel[k]); });

        /* 5. Validation warnings. */
        var warnings = [];
        comps.forEach(function (c) {
            var d = def(c.type);
            if (!d) { warnings.push('Unknown component type "' + c.type + '".'); return; }
            (d.inputs || []).forEach(function (p) {
                var found = wires.some(function (w) { return w.to.comp === c.id && w.to.port === p.id; });
                if (!found) warnings.push(d.name + ': input ' + (p.label || ('(' + p.id + ')')) + ' is not connected.');
            });
        });
        if (!stable) warnings.push('Possible feedback loop detected — output may not settle.');

        var wireIdx = {};
        wires.forEach(function (w) { wireIdx[w.id] = w; });

        return {
            ok: warnings.length === 0,
            warnings: warnings,
            compById: compById,
            wireById: wireIdx,
            wireVals: wireVals,
            compVals: comps.reduce(function (o, c) { o[c.id] = c._out || 0; return o; }, {}),
            compLevel: compLevel,
            wireLevel: wireLevel,
            maxLevel: maxLevel
        };
    }

    return {
        isInput: isInput,
        solve: solve
    };
})();