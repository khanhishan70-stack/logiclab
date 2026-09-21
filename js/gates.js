/**
 * LogicLab — Logic Gate Definitions + Component Library
 * Every circuit component is described here: ports, size, eval logic,
 * boolean expression and symbol drawing data.
 */

window.LogicGates = {
    AND: function (a, b) { return (a && b) ? 1 : 0; },
    OR: function (a, b) { return (a || b) ? 1 : 0; },
    NOT: function (a) { return (!a) ? 1 : 0; },
    NAND: function (a, b) { return !(a && b) ? 1 : 0; },
    NOR: function (a, b) { return !(a || b) ? 1 : 0; },
    XOR: function (a, b) { return (a !== b) ? 1 : 0; },
    XNOR: function (a, b) { return (a === b) ? 1 : 0; }
};

/**
 * Gate symbol SVG paths (template strings) drawn inside the component body.
 * Coordinates assume the symbol box: width 96, height 56, vertical center 28.
 * Bubbled gates end their graphical body slightly before the right edge so a
 * connecting pin can extend past the bubble.
 */
window.GateSymbols = {
    AND: 'M 16 10 L 46 10 A 18 18 0 0 1 46 46 L 16 46 Z',
    OR: 'M 16 28 C 22 18 30 10 46 10 A 18 18 0 0 1 46 46 C 30 46 22 38 16 28 Z',
    XOR_TAIL: 'M 8 12 C 2 20 2 36 8 44',
    NAND: 'M 16 10 L 46 10 A 18 18 0 0 1 46 46 L 16 46 Z',
    NOR: 'M 16 28 C 22 18 30 10 46 10 A 18 18 0 0 1 46 46 C 30 46 22 38 16 28 Z',
    XNOR_TAIL: 'M 8 12 C 2 20 2 36 8 44',
    NOT_TRI: 'M 10 10 L 52 28 L 10 46 Z'
};

window.CircuitCategories = [
    { id: 'input', label: 'INPUTS' },
    { id: 'logic', label: 'LOGIC GATES' },
    { id: 'output', label: 'OUTPUTS' }
];

/**
 * Component definitions.
 * fx / fy are fractional coordinates (0..1) used to compute port positions.
 * Each eval receives s = { portId: value, a: internalState }.
 */
window.CircuitComponents = {

    /* ---------------- INPUTS ---------------- */

    HIGH: {
        category: 'input', name: 'Constant HIGH', icon: '1', desc: 'Always outputs HIGH (1).',
        w: 64, h: 44,
        inputs: [],
        outputs: [{ id: 'out', fx: 1, fy: 0.5, label: '' }],
        symbol: 'high',
        eval: function () { return 1; },
        expr: 'Y = 1'
    },

    LOW: {
        category: 'input', name: 'Constant LOW', icon: '0', desc: 'Always outputs LOW (0).',
        w: 64, h: 44,
        inputs: [],
        outputs: [{ id: 'out', fx: 1, fy: 0.5, label: '' }],
        symbol: 'low',
        eval: function () { return 0; },
        expr: 'Y = 0'
    },

    SWITCH: {
        category: 'input', name: 'Toggle Switch', icon: 'S', desc: 'Click to toggle between 0 and 1.',
        w: 76, h: 48,
        inputs: [],
        outputs: [{ id: 'out', fx: 1, fy: 0.5, label: '' }],
        symbol: 'switch',
        clickable: true,
        eval: function (s) { return s.a ? 1 : 0; },
        expr: 'Y = SW'
    },

    CLOCK: {
        category: 'input', name: 'Clock', icon: '~', desc: 'Auto-toggles while the simulation runs.',
        w: 76, h: 48,
        inputs: [],
        outputs: [{ id: 'out', fx: 1, fy: 0.5, label: '' }],
        symbol: 'clock',
        eval: function (s) { return s.a ? 1 : 0; },
        expr: 'Y = CLK'
    },

    /* ---------------- LOGIC GATES ---------------- */

    AND: {
        category: 'logic', name: 'AND Gate', icon: '&', desc: 'Output 1 only when ALL inputs are 1.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 1, fy: 0.5, label: 'Y' }],
        symbol: 'and',
        eval: function (s) { return window.LogicGates.AND(s.A, s.B); },
        expr: 'Y = A · B'
    },

    OR: {
        category: 'logic', name: 'OR Gate', icon: '≥1', desc: 'Output 1 when ANY input is 1.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 1, fy: 0.5, label: 'Y' }],
        symbol: 'or',
        eval: function (s) { return window.LogicGates.OR(s.A, s.B); },
        expr: 'Y = A + B'
    },

    NOT: {
        category: 'logic', name: 'NOT Gate', icon: '!', desc: 'Inverts the input (1 → 0, 0 → 1).',
        w: 76, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.5, label: 'A' }],
        outputs: [{ id: 'Y', fx: 0.84, fy: 0.5, label: 'Y' }],
        symbol: 'not',
        eval: function (s) { return window.LogicGates.NOT(s.A); },
        expr: 'Y = NOT A'
    },

    NAND: {
        category: 'logic', name: 'NAND Gate', icon: 'N', desc: 'AND then inverted — universal gate.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 0.8, fy: 0.5, label: 'Y' }],
        symbol: 'nand',
        eval: function (s) { return window.LogicGates.NAND(s.A, s.B); },
        expr: 'Y = (A · B)′'
    },

    NOR: {
        category: 'logic', name: 'NOR Gate', icon: 'N', desc: 'OR then inverted — universal gate.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 0.8, fy: 0.5, label: 'Y' }],
        symbol: 'nor',
        eval: function (s) { return window.LogicGates.NOR(s.A, s.B); },
        expr: 'Y = (A + B)′'
    },

    XOR: {
        category: 'logic', name: 'XOR Gate', icon: '⊕', desc: 'Output 1 when inputs differ.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 1, fy: 0.5, label: 'Y' }],
        symbol: 'xor',
        eval: function (s) { return window.LogicGates.XOR(s.A, s.B); },
        expr: 'Y = A ⊕ B'
    },

    XNOR: {
        category: 'logic', name: 'XNOR Gate', icon: '≡', desc: 'Output 1 when inputs are equal.',
        w: 96, h: 56,
        inputs: [{ id: 'A', fx: 0, fy: 0.32, label: 'A' }, { id: 'B', fx: 0, fy: 0.68, label: 'B' }],
        outputs: [{ id: 'Y', fx: 0.8, fy: 0.5, label: 'Y' }],
        symbol: 'xnor',
        eval: function (s) { return window.LogicGates.XNOR(s.A, s.B); },
        expr: 'Y = (A ⊕ B)′'
    },

    /* ---------------- OUTPUTS ---------------- */

    LED: {
        category: 'output', name: 'LED', icon: '●', desc: 'Glows cyan when its input is 1.',
        w: 64, h: 64,
        inputs: [{ id: 'in', fx: 0, fy: 0.5, label: '' }],
        outputs: [],
        symbol: 'led',
        eval: function (s) { return s.in; },
        expr: 'LED = IN'
    },

    BULB: {
        category: 'output', name: 'Light Bulb', icon: 'O', desc: 'Lights up yellow when its input is 1.',
        w: 64, h: 64,
        inputs: [{ id: 'in', fx: 0, fy: 0.5, label: '' }],
        outputs: [],
        symbol: 'bulb',
        eval: function (s) { return s.in; },
        expr: 'BULB = IN'
    },

    DIGOUT: {
        category: 'output', name: 'Digital Output', icon: '#', desc: 'Displays the numeric value (0 / 1).',
        w: 92, h: 48,
        inputs: [{ id: 'in', fx: 0, fy: 0.5, label: '' }],
        outputs: [],
        symbol: 'digout',
        eval: function (s) { return s.in; },
        expr: 'OUT = IN'
    },

    PROBE: {
        category: 'output', name: 'Logic Probe', icon: '?', desc: 'Reads the logic level as LOW / HIGH.',
        w: 92, h: 48,
        inputs: [{ id: 'in', fx: 0, fy: 0.5, label: '' }],
        outputs: [],
        symbol: 'probe',
        eval: function (s) { return s.in; },
        expr: 'PROBE = IN'
    }
};