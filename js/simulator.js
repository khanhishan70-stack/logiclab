/**
 * LogicLab — Gate Simulator
 * Single-gate playground: pick a gate, flip switches, watch the symbol,
 * the output LED and the live truth table react.
 */
(function () {
    var NS = 'http://www.w3.org/2000/svg';

    var chips = Array.prototype.slice.call(document.querySelectorAll('.gate-chip'));
    var aBtn = document.getElementById('input-a');
    var bBtn = document.getElementById('input-b');
    var nodeB = document.getElementById('node-b');
    var outLed = document.getElementById('output-result');
    var outVal = document.querySelector('.out-val');
    var outLabel = document.querySelector('.out-label');
    var sym = document.getElementById('sim-symbol');
    var nameEl = document.getElementById('sim-gate-name');
    var descEl = document.getElementById('sim-gate-desc');
    var exprEl = document.getElementById('sim-expr');
    var ttEl = document.getElementById('sim-tt');
    var hintEl = document.getElementById('sim-hint');

    var state = { a: 0, b: 0, gate: 'AND' };

    var EXTRA = {
        AND: { rule: 'Y = 1 only when BOTH inputs are 1.', real: 'Safety interlocks, password checks.' },
        OR: { rule: 'Y = 1 when ANY input is 1.', real: 'Alarms, backup circuits.' },
        NOT: { rule: 'Y is always the opposite of the input.', real: 'Active-low signals, inverters.' },
        NAND: { rule: 'Y = 0 only when BOTH inputs are 1.', real: 'NAND flash memory — a universal gate.' },
        NOR: { rule: 'Y = 1 only when BOTH inputs are 0.', real: 'SR latch memory cells — a universal gate.' },
        XOR: { rule: 'Y = 1 when the inputs DIFFER.', real: 'Half-adder sum, parity checks.' },
        XNOR: { rule: 'Y = 1 when the inputs are EQUAL.', real: 'Equality / match comparators.' }
    };

    function el(name, attrs, parent) {
        var e = document.createElementNS(NS, name);
        if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }

    function drawSymbol(type) {
        sym.textContent = '';
        var S = window.GateSymbols;
        var d = window.CircuitComponents[type];
        var two = (d.inputs || []).length > 1;
        var orBody = type === 'OR' || type === 'XOR' || type === 'NOR' || type === 'XNOR';
        var andBody = type === 'AND' || type === 'NAND';
        var bubble = type === 'NAND' || type === 'NOR' || type === 'XNOR';

        function path(p, cls) {
            var pe = el('path', { d: p }, sym);
            if (cls) pe.setAttribute('class', cls);
        }
        function line(x1, y1, x2, y2) { path('M ' + x1 + ' ' + y1 + ' L ' + x2 + ' ' + y2); }

        if (type === 'NOT') {
            line(0, 28, 10, 28);
            path(S.NOT_TRI);
            el('circle', { 'class': 'bubble', cx: 60, cy: 28, r: 6.5 }, sym);
            line(68, 28, 96, 28);
            return;
        }

        /* input stubs */
        if (two) line(0, 16, 16, 16);
        if (two) line(0, 40, 16, 40);

        if (orBody) {
            path(S.OR);
            if (type === 'XOR' || type === 'XNOR') path('M 8 12 C 2 20 2 36 8 44');
        }
        if (andBody) path(S.AND);

        var bx = bubble ? 68 : 64;
        if (bubble) el('circle', { 'class': 'bubble', cx: bx, cy: 28, r: 6.5 }, sym);
        line(bx + (bubble ? 7 : 0), 28, 96, 28);
    }

    var TYPES = { AND: ['Y'], OR: ['Y'], XOR: ['Y'], XNOR: ['Y'], NAND: ['Y'], NOR: ['Y'], NOT: ['Y'] };

    function buildTable() {
        var t = window.TruthTable.rowsFor(state.gate);
        if (!t) { ttEl.innerHTML = ''; return; }
        var head = '<thead><tr>';
        t.inputs.forEach(function (p) { head += '<th>' + (p.label || p.id) + '</th>'; });
        head += '<th>' + (TYPES[state.gate] || ['Y'])[0] + '</th></tr></thead>';

        var body = '<tbody>';
        t.rows.forEach(function (r) {
            var key = r.in.join('');
            var tds = r.in.map(function (v) {
                return '<td><span class="bin ' + (v ? 'hi' : 'lo') + '">' + v + '</span></td>';
            }).join('');
            tds += '<td><span class="bin ' + (r.out ? 'hi' : 'lo') + '">' + r.out + '</span></td>';
            body += '<tr data-key="' + key + '">' + tds + '</tr>';
        });
        body += '</tbody>';
        ttEl.innerHTML = '<table class="truth-table"><thead>' + head + '</thead>' + body + '</table>';
    }

    function syncPaddle(btn, v) {
        btn.classList.toggle('on', v === 1);
        btn.setAttribute('aria-pressed', String(v === 1));
        btn.querySelector('.paddle-label').textContent = v ? 'ON' : 'OFF';
    }

    function update() {
        var one = state.gate === 'NOT';
        var fn = window.LogicGates[state.gate];
        var result = one ? window.LogicGates.NOT(state.a) : fn(state.a, state.b);

        syncPaddle(aBtn, state.a);
        syncPaddle(bBtn, state.b);
        nodeB.style.display = one ? 'none' : 'flex';

        var isOn = result === 1;
        outLed.classList.toggle('on', isOn);
        outVal.textContent = result;
        outLabel.textContent = isOn ? 'HIGH' : 'LOW';

        var key = String(state.a) + (one ? '' : String(state.b));
        var rows = ttEl.querySelectorAll('tr[data-key]');
        for (var i = 0; i < rows.length; i++) {
            rows[i].classList.toggle('cur', rows[i].getAttribute('data-key') === key);
        }
    }

    function setGate(type) {
        state.gate = type;
        chips.forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-gate') === type); });
        var d = window.CircuitComponents[type];
        nameEl.textContent = d.name;
        descEl.textContent = d.desc;
        exprEl.textContent = d.expr || '';
        var e = EXTRA[type] || {};
        hintEl.innerHTML = e.rule ? '<b>Rule of thumb:</b> ' + e.rule + ' <span class="hint-sep">·</span> 💡 Real world: ' + e.real : '';
        drawSymbol(type);
        buildTable();
        update();
    }

    chips.forEach(function (c) {
        c.addEventListener('click', function () { setGate(c.getAttribute('data-gate')); });
    });
    aBtn.addEventListener('click', function () { state.a = state.a ? 0 : 1; update(); });
    bBtn.addEventListener('click', function () { state.b = state.b ? 0 : 1; update(); });

    setGate('AND');
})();