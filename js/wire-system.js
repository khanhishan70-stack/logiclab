/**
 * LogicLab — Wire System
 * Builds clean orthogonal wire paths and validates connections.
 */

window.WireSystem = (function () {

    /**
     * Compute an orthogonal (horizontal-vertical-horizontal) path between two
     * points, with rounded corners handled by the stroke-linejoin attribute.
     */
    function route(a, b) {
        var dx = (b.x - a.x) / 2;
        var mid = a.x + Math.max(36, Math.abs(dx));
        var d = 'M ' + a.x + ' ' + a.y +
                ' L ' + mid + ' ' + a.y +
                ' L ' + mid + ' ' + b.y +
                ' L ' + b.x + ' ' + b.y;
        return d;
    }

    /**
     * Validate a proposed connection.
     * ref = { comp, port } (port ids). One side must be an output, the other an input.
     * Returns { ok, message, from, to } with from/to normalized so 'from' is the output.
     */
    function validate(graph, refA, refB) {
        var compA = graph.components.find(function (c) { return c.id === refA.comp; });
        var compB = graph.components.find(function (c) { return c.id === refB.comp; });

        if (!compA || !compB) {
            return { ok: false, message: 'Invalid connection target.' };
        }
        if (compA.id === compB.id) {
            return { ok: false, message: 'A component cannot connect to itself.' };
        }
        if (refA.port === refB.port && refA.comp === refB.comp) {
            return { ok: false, message: 'Invalid connection.' };
        }

        var defA = window.CircuitComponents[compA.type];
        var defB = window.CircuitComponents[compB.type];
        if (!defA || !defB) {
            return { ok: false, message: 'Unknown component type.' };
        }

        var aIsOut = (defA.outputs || []).some(function (p) { return p.id === refA.port; });
        var aIsIn = (defA.inputs || []).some(function (p) { return p.id === refA.port; });
        var bIsOut = (defB.outputs || []).some(function (p) { return p.id === refB.port; });
        var bIsIn = (defB.inputs || []).some(function (p) { return p.id === refB.port; });

        var from, to;
        if (aIsOut && bIsIn) {
            from = { comp: compA.id, port: refA.port };
            to = { comp: compB.id, port: refB.port };
        } else if (bIsOut && aIsIn) {
            from = { comp: compB.id, port: refB.port };
            to = { comp: compA.id, port: refA.port };
        } else {
            return { ok: false, message: 'Connect an output port to an input port.' };
        }

        /* the target input must not already be driven */
        var alreadyDriven = graph.wires.some(function (w) {
            return w.to.comp === to.comp && w.to.port === to.port;
        });
        if (alreadyDriven) {
            return { ok: false, message: 'That input port is already connected.' };
        }

        /* prevent duplicate identical wires */
        var duplicate = graph.wires.some(function (w) {
            return w.from.comp === from.comp && w.from.port === from.port &&
                   w.to.comp === to.comp && w.to.port === to.port;
        });
        if (duplicate) {
            return { ok: false, message: 'That wire already exists.' };
        }

        return { ok: true, message: 'Connected.', from: from, to: to };
    }

    return {
        route: route,
        validate: validate
    };
})();