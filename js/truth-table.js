/**
 * LogicLab — Truth Table Generator
 * Generates full truth tables for any gate/component with >= 1 input.
 */

window.TruthTable = (function () {

    function rowsFor(type) {
        var comp = window.CircuitComponents[type];
        if (!comp || !comp.inputs || comp.inputs.length === 0) return null;

        var inputs = comp.inputs;
        var n = inputs.length;
        var rows = [];
        var count = 1 << n;

        for (var i = 0; i < count; i++) {
            var vals = {};
            var inRow = [];
            for (var j = 0; j < n; j++) {
                /* MSB first so the table reads top-down like a textbook */
                var bit = (i >> (n - 1 - j)) & 1;
                vals[inputs[j].id] = bit;
                inRow.push(bit);
            }
            var out = comp.eval ? comp.eval(vals) : 0;
            rows.push({ in: inRow, out: out });
        }
        return { inputs: inputs, rows: rows };
    }

    /**
     * Build an HTML table string for a component type.
     */
    function html(type) {
        var t = rowsFor(type);
        if (!t) return '<div class="tt-empty">No truth table for this component.</div>';

        var head = '<thead><tr>';
        t.inputs.forEach(function (p) {
            head += '<th>' + (p.label || p.id) + '</th>';
        });
        head += '<th>Y</th></tr></thead>';

        var body = '<tbody>';
        t.rows.forEach(function (r) {
            body += '<tr>';
            r.in.forEach(function (v) {
                body += '<td><span class="bin ' + (v ? 'hi' : 'lo') + '">' + v + '</span></td>';
            });
            body += '<td><span class="bin hi-y' + (r.out ? ' hi' : ' lo') + '">' + r.out + '</span></td>';
            body += '</tr>';
        });
        body += '</tbody>';

        return '<table class="truth-table">' + head + body + '</table>';
    }

    return { rowsFor: rowsFor, html: html };
})();