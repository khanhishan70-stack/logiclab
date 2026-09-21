/**
 * LogicLab — Boolean Theory Reference
 * Expressions and equivalences used in Learn and the Inspector panel.
 */

window.BooleanTheory = (function () {

    var GATE_INFO = {
        AND: { symbol: 'A · B', read: 'A AND B', name: 'AND Gate',
            exprFull: 'Y = A · B', deRel: null },
        OR: { symbol: 'A + B', read: 'A OR B', name: 'OR Gate',
            exprFull: 'Y = A + B', deRel: null },
        NOT: { symbol: 'A′', read: 'NOT A', name: 'NOT Gate',
            exprFull: 'Y = A′', deRel: null },
        NAND: { symbol: '(A · B)′', read: 'NAND', name: 'NAND Gate',
            exprFull: 'Y = (A · B)′', deRel: 'Y = A′ + B′' },
        NOR: { symbol: '(A + B)′', read: 'NOR', name: 'NOR Gate',
            exprFull: 'Y = (A + B)′', deRel: 'Y = A′ · B′' },
        XOR: { symbol: 'A ⊕ B', read: 'XOR', name: 'XOR Gate',
            exprFull: 'Y = A ⊕ B', deRel: 'Y = (A + B) · (A′ + B′)' },
        XNOR: { symbol: '(A ⊕ B)′', read: 'XNOR', name: 'XNOR Gate',
            exprFull: 'Y = (A ⊕ B)′', deRel: 'Y = (A · B) + (A′ · B′)' }
    };

    function info(type) {
        return GATE_INFO[type] || null;
    }

    function deMorganNote(type) {
        var i = GATE_INFO[type];
        if (!i || !i.deRel) return null;
        return i.name + ' can be built from other gates: ' + i.deRel;
    }

    return {
        info: info,
        deMorganNote: deMorganNote,
        ALL: GATE_INFO
    };
})();