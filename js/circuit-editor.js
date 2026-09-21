/**
 * LogicLab — Circuit Editor
 * The main interactive workspace: palette, SVG canvas, ports & wires,
 * simulation controls (Run / Pause / Step / Reset), validation, inspector,
 * undo/redo and project persistence.
 */
window.CircuitEditor = (function () {

    var NS = 'http://www.w3.org/2000/svg';
    var SNAP_PORT = 40; /* px radius for snapping a wire to a port */
    var GRID = 20;

    function sEl(name, attrs, parent) {
        var e = document.createElementNS(NS, name);
        if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    var Editor = function (rootId) {
        this.root = document.getElementById(rootId);
        this.graph = { components: [], wires: [] };
        this.selection = { comps: {}, wires: {} };
        this.tool = 'select';
        this.view = { x: 0, y: 0, zoom: 1, grid: true };
        this.stepLevel = -1;
        this.sim = null;
        this.running = false;
        this.clockTimer = null;
        this.undoStack = [];
        this.redoStack = [];
        this.nextId = { c: 1, w: 1 };
        this.spaceHeld = false;
        this.drag = null;
        this.placeDrag = null;
        this.lastWireVals = null;
        this.compEls = {};
        this.wireEls = {};
        this.initElements();
        this.bindEvents();
        this.renderAll();
        this.status({ ok: true, warnings: ['Start building: click a component from the sidebar, then press ▶ Run.'] });
    };

    Editor.prototype.els = function (id) { return this.root.querySelector('#' + id); };

    /* ----------------------------------------------------------------- *
     *  DOM setup
     * ----------------------------------------------------------------- */

    Editor.prototype.initElements = function () {
        var r = this.root;
        this.sidebar = r.querySelector('#sidebar');
        this.inspector = r.querySelector('#inspector');
        this.inspectorBody = r.querySelector('#inspector-body');
        this.canvasWrap = r.querySelector('#canvas-wrap');
        this.svg = r.querySelector('#canvas');
        this.viewG = sEl('g', { id: 'view' }, this.svg);
        this.gridG = sEl('g', { id: 'grid-layer' }, this.viewG);
        this.wireLayer = sEl('g', { 'class': 'wire-layer' }, this.viewG);
        this.compLayer = sEl('g', { 'class': 'comp-layer' }, this.viewG);
        this.tempLayer = sEl('g', { 'class': 'temp-layer' }, this.viewG);
        this.emptyHint = r.querySelector('#empty-hint');
        this.statusDot = r.querySelector('#status-dot');
        this.statusText = r.querySelector('#status-text');
        this.statusDetail = r.querySelector('#status-detail');
        this.toast = r.querySelector('#toast');
        this.fileImport = r.querySelector('#file-import');

        var defs = sEl('defs', null, this.svg);
        var pat = sEl('pattern', { id: 'grid-pat', width: GRID, height: GRID, patternUnits: 'userSpaceOnUse' }, defs);
        sEl('path', { d: 'M ' + GRID + ' 0 L 0 0 0 ' + GRID, 'class': 'grid-line' }, pat);
        this.gridRect = sEl('rect', { width: 10000, height: 10000, x: -5000, y: -5000, fill: 'url(#grid-pat)' }, this.gridG);

        this.tempWire = sEl('path', { 'class': 'temp-wire' }, this.tempLayer);
        this.tempWire.style.display = 'none';
        this.selectionBox = sEl('rect', { 'class': 'selection-box' }, this.tempLayer);
        this.selectionBox.style.display = 'none';
        this.placeGhost = sEl('rect', { 'class': 'place-ghost' }, this.tempLayer);
        this.placeGhost.style.display = 'none';
    };

    /* ----------------------------------------------------------------- *
     *  Rendering
     * ----------------------------------------------------------------- */

    Editor.prototype.renderAll = function () {
        this.renderComponents();
        this.renderWires();
        this.refreshGrid();
        this.updateView();
        this.updateEmptyHint();
    };

    Editor.prototype.renderComponents = function () {
        this.compLayer.textContent = '';
        this.compEls = {};
        var self = this;
        this.graph.components.forEach(function (c) { self.buildComp(c); });
    };

    Editor.prototype.setTransform = function (el, x, y) {
        el.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
    };

    Editor.prototype.buildComp = function (comp) {
        var d = window.CircuitComponents[comp.type];
        if (!d) return;
        var self = this;
        var g = sEl('g', { 'class': 'component', 'data-id': comp.id }, this.compLayer);
        this.setTransform(g, comp.x, comp.y);

        sEl('rect', { 'class': 'sel-rect', x: -5, y: -5, width: d.w + 10, height: d.h + 10, rx: 14 }, g);
        sEl('rect', { 'class': 'comp-body', x: 0, y: 0, width: d.w, height: d.h, rx: 12 }, g);

        var inner = sEl('g', { 'class': 'sym-g' }, g);
        var dyn = {};
        this.drawSymbol(inner, comp, d, dyn);

        if (d.category === 'logic') {
            var lab = sEl('text', { 'class': 'gate-label', x: d.w / 2, y: d.h + 15, 'text-anchor': 'middle' }, g);
            lab.textContent = d.name.replace(' Gate', '');
        }

        var ports = {};
        ['inputs', 'outputs'].forEach(function (kind) {
            (d[kind] || []).forEach(function (p) {
                var cx = p.fx * d.w, cy = p.fy * d.h;
                var c = sEl('circle', {
                    'class': 'port ' + (kind === 'inputs' ? 'in' : 'out'),
                    'data-comp': comp.id, 'data-port': p.id,
                    cx: cx, cy: cy, r: 4.5
                }, g);
                ports[p.id] = c;
                if (p.label) {
                    var t = sEl('text', { 'class': 'port-label' }, g);
                    t.textContent = p.label;
                    t.setAttribute('x', cx + (kind === 'inputs' ? -8 : 8));
                    t.setAttribute('y', cy + 3.5);
                    t.setAttribute('text-anchor', kind === 'inputs' ? 'end' : 'start');
                }
            });
        });

        g.addEventListener('pointerdown', function (e) { self.onCompPointerDown(e, comp); });
        Object.keys(ports).forEach(function (pid) {
            ports[pid].addEventListener('pointerdown', function (e) { self.onPortPointerDown(e, comp, pid); });
        });

        this.compEls[comp.id] = { g: g, dyn: dyn, ports: ports, d: d };
        if (d.clickable) {
            g.classList.add('clickable');
            this.syncSwitch(comp, this.compEls[comp.id]);
        }
    };

    Editor.prototype.drawSymbol = function (parent, comp, d, dyn) {
        var S = window.GateSymbols;
        var bubble = function (cx, cy) { sEl('circle', { 'class': 'bubble', cx: cx, cy: cy, r: 6.5 }, parent); };
        var centerText = function (txt, cls, x, y, size) {
            var t = sEl('text', { 'class': cls, x: x, y: y, 'text-anchor': 'middle' }, parent);
            t.setAttribute('font-size', size || 20);
            t.textContent = txt;
            return t;
        };

        switch (d.symbol) {
            case 'and':  sEl('path', { 'class': 'sym', d: S.AND }, parent); break;
            case 'or':   sEl('path', { 'class': 'sym', d: S.OR }, parent); break;
            case 'not':
                sEl('path', { 'class': 'sym', d: S.NOT_TRI }, parent);
                bubble(60, 28);
                break;
            case 'nand':
                sEl('path', { 'class': 'sym', d: S.NAND }, parent);
                bubble(68, 28);
                break;
            case 'nor':
                sEl('path', { 'class': 'sym', d: S.NOR }, parent);
                bubble(68, 28);
                break;
            case 'xor':
                sEl('path', { 'class': 'sym', d: S.OR }, parent);
                sEl('path', { 'class': 'sym xtra', d: S.XOR_TAIL }, parent);
                break;
            case 'xnor':
                sEl('path', { 'class': 'sym', d: S.OR }, parent);
                sEl('path', { 'class': 'sym xtra', d: S.XNOR_TAIL }, parent);
                bubble(68, 28);
                break;
            case 'high': centerText('1', 'big-txt', d.w / 2 + 2, d.h / 2 + 7); break;
            case 'low':  centerText('0', 'big-txt', d.w / 2 + 2, d.h / 2 + 7); break;

            case 'switch': {
                sEl('rect', { 'class': 'switch-track', x: 10, y: d.h / 2 - 8, width: 34, height: 16, rx: 8 }, parent);
                var knob = sEl('circle', { 'class': 'knob', cx: 16, cy: d.h / 2, r: 7 }, parent);
                var t = sEl('text', { 'class': 'mini-label', x: 52, y: d.h / 2 + 4 }, parent);
                t.textContent = 'SW';
                dyn.knob = knob;
                dyn.swText = t;
                break;
            }
            case 'clock': {
                sEl('path', { 'class': 'sym xtra', d: 'M 10 28 h5 v-12 h9 v12 h10 v-12 h9' }, parent);
                var t2 = sEl('text', { 'class': 'mini-label', x: 54, y: d.h / 2 + 4 }, parent);
                t2.textContent = 'CLK';
                break;
            }
            case 'led': {
                sEl('circle', { 'class': 'led-base', cx: d.w / 2, cy: d.h / 2 - 4, r: 14 }, parent);
                var lamp = sEl('circle', { 'class': 'lamp led', cx: d.w / 2, cy: d.h / 2 - 4, r: 11 }, parent);
                var t3 = sEl('text', { 'class': 'mini-label', x: d.w / 2, y: d.h - 6, 'text-anchor': 'middle' }, parent);
                t3.textContent = 'LED';
                dyn.lamp = lamp;
                break;
            }
            case 'bulb': {
                sEl('circle', { 'class': 'bulb-glass', cx: d.w / 2, cy: d.h / 2 - 6, r: 17 }, parent);
                var lamp2 = sEl('circle', { 'class': 'lamp bulb', cx: d.w / 2, cy: d.h / 2 - 6, r: 13 }, parent);
                sEl('rect', { 'class': 'bulb-base', x: d.w / 2 - 5, y: d.h / 2 + 8, width: 10, height: 10, rx: 2 }, parent);
                dyn.lamp = lamp2;
                break;
            }
            case 'digout': {
                var t4 = sEl('text', { 'class': 'mini-label', x: 10, y: d.h / 2 + 4 }, parent);
                t4.textContent = 'OUT';
                dyn.digVal = centerText('0', 'dig-val', d.w - 22, d.h / 2 + 8, 22);
                break;
            }
            case 'probe': {
                sEl('circle', { 'class': 'led-base', cx: 18, cy: d.h / 2, r: 9 }, parent);
                var ptxt = sEl('text', { 'class': 'probe-txt', x: 34, y: d.h / 2 + 4 }, parent);
                ptxt.textContent = 'LOW';
                dyn.probeTxt = ptxt;
                break;
            }
        }
    };

    Editor.prototype.syncSwitch = function (comp, info) {
        if (!info || !info.dyn) return;
        if (info.dyn.knob) info.dyn.knob.setAttribute('cx', comp.toggle ? 38 : 16);
        if (info.dyn.swText) info.dyn.swText.textContent = comp.toggle ? 'ON' : 'SW';
    };

    /* ---- wires ---- */

    Editor.prototype.portPos = function (comp, portId) {
        if (!comp) return null;
        var d = window.CircuitComponents[comp.type];
        var p = null;
        (d.inputs || []).forEach(function (x) { if (x.id === portId) p = x; });
        (d.outputs || []).forEach(function (x) { if (x.id === portId) p = x; });
        if (!p) return null;
        return { x: comp.x + p.fx * d.w, y: comp.y + p.fy * d.h };
    };

    Editor.prototype.findComp = function (id) {
        for (var i = 0; i < this.graph.components.length; i++) if (this.graph.components[i].id === id) return this.graph.components[i];
        return null;
    };
    Editor.prototype.findWire = function (id) {
        for (var i = 0; i < this.graph.wires.length; i++) if (this.graph.wires[i].id === id) return this.graph.wires[i];
        return null;
    };

    Editor.prototype.renderWires = function () {
        this.wireLayer.textContent = '';
        this.wireEls = {};
        var self = this;
        this.graph.wires.forEach(function (w) { self.buildWire(w); });
    };

    Editor.prototype.buildWire = function (w) {
        var self = this;
        var base = sEl('path', { 'class': 'wire' }, this.wireLayer);
        base.setAttribute('data-wire', w.id);
        var pulse = sEl('path', { 'class': 'wire-pulse' }, this.wireLayer);
        pulse.style.display = 'none';
        base.addEventListener('pointerdown', function (e) { self.onWirePointerDown(e, w.id); });
        this.wireEls[w.id] = { base: base, pulse: pulse, len: 1 };
        this.updateWire(w.id);
    };

    Editor.prototype.updateWire = function (wid) {
        var w = this.findWire(wid);
        var el = this.wireEls[wid];
        if (!w || !el) return;
        var a = this.portPos(this.findComp(w.from.comp), w.from.port);
        var b = this.portPos(this.findComp(w.to.comp), w.to.port);
        if (!a || !b) return;
        var d = window.WireSystem.route(a, b);
        el.base.setAttribute('d', d);
        el.pulse.setAttribute('d', d);
        el.len = Math.max(30, el.base.getTotalLength());
    };

    Editor.prototype.updateAllWires = function () {
        var self = this;
        this.graph.wires.forEach(function (w) { self.updateWire(w.id); });
    };

    /* ---- view / grid ---- */

    Editor.prototype.updateView = function () {
        this.viewG.setAttribute('transform', 'translate(' + this.view.x + ' ' + this.view.y + ') scale(' + this.view.zoom + ')');
    };
    Editor.prototype.refreshGrid = function () {
        this.gridRect.style.display = this.view.grid ? '' : 'none';
    };
    Editor.prototype.screenToCanvas = function (clientX, clientY) {
        var rect = this.canvasWrap.getBoundingClientRect();
        return {
            x: (clientX - rect.left - this.view.x) / this.view.zoom,
            y: (clientY - rect.top - this.view.y) / this.view.zoom
        };
    };
    Editor.prototype.snap = function (v) { return this.view.grid ? Math.round(v / GRID) * GRID : Math.round(v); };
    Editor.prototype.updateEmptyHint = function () {
        this.emptyHint.style.display = this.graph.components.length ? 'none' : 'flex';
    };

    /* ----------------------------------------------------------------- *
     *  Simulation
     * ----------------------------------------------------------------- */

    Editor.prototype.speedMult = function () {
        var slider = this.els('speed-slider');
        var v = slider ? parseFloat(slider.value) : 200;
        return 250 / v;
    };

    Editor.prototype.compute = function () {
        this.sim = window.CircuitEngine.solve(this.graph);
        return this.sim;
    };

    Editor.prototype.status = function (res) {
        var ok = !!res.ok;
        this.statusDot.className = 'dot ' + (ok ? 'ok' : 'warn');
        this.statusText.textContent = ok
            ? '✓ Circuit ready'
            : (this.graph.components.length ? '⚠ Circuit incomplete' : 'No components yet');
        if (this.statusDetail) {
            this.statusDetail.textContent = res.warnings.length ? res.warnings[0] : 'All connections are valid.';
            this.statusDetail.title = res.warnings.join('\n');
        }
    };

    Editor.prototype.applyStatic = function (res, animated) {
        this.clearSimClasses();
        var self = this;
        this.graph.wires.forEach(function (w) {
            var el = self.wireEls[w.id];
            if (!el) return;
            el.base.classList.add(res.wireVals[w.id] ? (animated ? 'idle' : 'live') : 'idle');
        });
        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info) return;
            if (animated) return;
            if (res.compVals[c.id]) info.g.classList.add('hot');
            if (info.dyn) self.setDynOut(info, res.compVals[c.id]);
        });
    };

    Editor.prototype.setDynOut = function (info, v) {
        var dyn = info.dyn;
        if (!dyn) return;
        if (dyn.lamp) dyn.lamp.classList.toggle('on', !!v);
        if (dyn.digVal) dyn.digVal.textContent = v ? '1' : '0';
        if (dyn.probeTxt) dyn.probeTxt.textContent = v ? 'HIGH' : 'LOW';
    };

    Editor.prototype.clearSimClasses = function () {
        var self = this;
        this.graph.wires.forEach(function (w) {
            var el = self.wireEls[w.id];
            if (!el) return;
            el.base.classList.remove('live', 'idle');
            el.pulse.style.display = 'none';
            el.pulse.style.strokeDashoffset = '0';
        });
        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info) return;
            info.g.classList.remove('hot');
            if (info.dyn) self.setDynOut(info, 0);
        });
    };

    /* Build staggered tasks (wires pulses + comp activations) for a result. */
    Editor.prototype.scheduleTasks = function (res, offset, stride, speed) {
        var list = [];
        var self = this;

        this.graph.wires.forEach(function (w) {
            if (!res.wireVals[w.id]) return;
            var el = self.wireEls[w.id];
            if (!el) return;
            var len = el.len || 100;
            var dot = Math.max(14, len * 0.12);
            var travel = len - dot;
            list.push({
                delay: offset + (res.wireLevel[w.id] || 0) * stride,
                dur: clamp(len / (20 / speed), 150, 700) * speed,
                draw: function (t) {
                    el.base.classList.add('live');
                    el.base.classList.remove('idle');
                    el.pulse.style.display = '';
                    el.pulse.style.strokeDasharray = dot + ' ' + (len * 1.6 + 40);
                    el.pulse.style.strokeDashoffset = (t * travel).toFixed(1);
                },
                run: function () { el.pulse.style.display = 'none'; },
                cleanup: function () { el.pulse.style.display = 'none'; }
            });
        });

        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info || !res.compVals[c.id]) return;
            var delay = offset + ((res.compLevel[c.id] != null ? res.compLevel[c.id] : 0) * stride) + 60;
            list.push({
                delay: delay,
                run: function () {
                    info.g.classList.add('hot');
                    if (info.dyn) self.setDynOut(info, 1);
                }
            });
        });

        return list;
    };

    Editor.prototype.run = function () {
        if (window.SignalAnimator.isActive()) return;
        this.stopClockLoop();
        var res = this.compute();
        this.lastWireVals = res.wireVals;
        this.status(res);
        var speed = this.speedMult();
        var stride = 340 * speed;
        this.stepLevel = -1;
        this.updateStepUi();
        this.applyStatic(res, true);

        var list = this.scheduleTasks(res, 40, stride, speed);
        var self = this;
        this.running = true;
        this.refreshRunUi();
        window.SignalAnimator.play(list, function () { self.sweepDone(); });
    };

    Editor.prototype.sweepDone = function () {
        if (!this.running) return;
        var hasClock = this.graph.components.some(function (c) { return c.type === 'CLOCK'; });
        if (!hasClock) {
            this.running = false;
            this.refreshRunUi();
            if (this.sim) this.applyStatic(this.sim);
            this.updateStepUi();
            return;
        }
        this.running = true;
        if (this.sim) this.applyStatic(this.sim);
        var self = this;
        this.clockTimer = setInterval(function () { self.clockTick(); }, Math.max(500, 900 * this.speedMult()));
    };

    Editor.prototype.clockTick = function () {
        var self = this;
        this.graph.components.forEach(function (c) { if (c.type === 'CLOCK') c.toggle = !c.toggle; });
        var res = this.compute();
        var prev = this.lastWireVals || {};
        this.lastWireVals = res.wireVals;
        var speed = this.speedMult();

        /* static update for everything */
        this.graph.wires.forEach(function (w) {
            var el = self.wireEls[w.id];
            if (!el) return;
            el.base.classList.remove('live', 'idle');
            el.base.classList.add(res.wireVals[w.id] ? 'live' : 'idle');
        });
        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info) return;
            if (res.compVals[c.id]) info.g.classList.add('hot'); else info.g.classList.remove('hot');
            if (info.dyn) self.setDynOut(info, res.compVals[c.id]);
        });

        /* animate only wires whose value just changed to 1 */
        var list = [];
        this.graph.wires.forEach(function (w) {
            if (!res.wireVals[w.id] || (prev[w.id] && prev[w.id] === res.wireVals[w.id])) return;
            var el = self.wireEls[w.id];
            if (!el) return;
            var len = el.len || 100;
            var dot = Math.max(14, len * 0.12);
            var travel = len - dot;
            list.push({
                delay: 0,
                dur: clamp(len / (24 / speed), 120, 500),
                draw: function (t) {
                    el.pulse.style.display = '';
                    el.pulse.style.strokeDasharray = dot + ' ' + (len * 1.6 + 40);
                    el.pulse.style.strokeDashoffset = (t * travel).toFixed(1);
                },
                run: function () { el.pulse.style.display = 'none'; },
                cleanup: function () { el.pulse.style.display = 'none'; }
            });
        });
        window.SignalAnimator.play(list, function () {});
    };

    Editor.prototype.stopClockLoop = function () {
        if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    };

    Editor.prototype.pause = function () {
        if (!this.running && !window.SignalAnimator.isActive()) return;
        this.running = false;
        this.stopClockLoop();
        window.SignalAnimator.stop();
        this.refreshRunUi();
        var res = this.sim || this.compute();
        this.applyStatic(res);
        this.status(res);
        this.toastMsg('Simulation paused.', '');
    };

    Editor.prototype.step = function () {
        this.stopClockLoop();
        window.SignalAnimator.stop();
        this.running = false;
        this.refreshRunUi();

        if (this.stepLevel < 0 || !this.sim) {
            this.sim = this.compute();
            this.stepLevel = -1;
        }
        var res = this.sim;
        this.stepLevel += 1;
        if (this.stepLevel > res.maxLevel) this.stepLevel = res.maxLevel;

        if (this.stepLevel === 0) this.clearSimClasses();
        var speed = this.speedMult();
        var self = this;

        /* persist the static picture for levels already passed */
        this.graph.wires.forEach(function (w) {
            var el = self.wireEls[w.id];
            if (!el) return;
            if ((res.wireLevel[w.id] || 0) < self.stepLevel) {
                el.base.classList.remove('live', 'idle');
                el.base.classList.add(res.wireVals[w.id] ? 'live' : 'idle');
            }
        });
        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info || (res.compLevel[c.id] || 0) >= self.stepLevel) return;
            if (res.compVals[c.id]) info.g.classList.add('hot');
            if (info.dyn) self.setDynOut(info, res.compVals[c.id]);
        });

        var list = [];
        this.graph.wires.forEach(function (w) {
            if ((res.wireLevel[w.id] || 0) !== self.stepLevel || !res.wireVals[w.id]) return;
            var el = self.wireEls[w.id];
            if (!el) return;
            var len = el.len || 100;
            var dot = Math.max(14, len * 0.12);
            var travel = len - dot;
            list.push({
                delay: 30,
                dur: clamp(len / (26 / speed), 120, 500),
                draw: function (t) {
                    el.base.classList.add('live');
                    el.base.classList.remove('idle');
                    el.pulse.style.display = '';
                    el.pulse.style.strokeDasharray = dot + ' ' + (len * 1.6 + 40);
                    el.pulse.style.strokeDashoffset = (t * travel).toFixed(1);
                },
                run: function () { el.pulse.style.display = 'none'; },
                cleanup: function () { el.pulse.style.display = 'none'; }
            });
        });
        this.graph.components.forEach(function (c) {
            var info = self.compEls[c.id];
            if (!info || (res.compLevel[c.id] || 0) !== self.stepLevel || !res.compVals[c.id]) return;
            list.push({
                delay: 40 + 120,
                run: function () {
                    info.g.classList.add('hot');
                    if (info.dyn) self.setDynOut(info, 1);
                }
            });
        });

        this.updateStepUi();
        window.SignalAnimator.play(list, function () {});
    };

    Editor.prototype.reset = function () {
        this.running = false;
        this.stopClockLoop();
        window.SignalAnimator.stop();
        this.stepLevel = -1;
        this.sim = this.compute();
        this.lastWireVals = this.sim.wireVals;
        this.applyStatic(this.sim);
        this.status(this.sim);
        this.refreshRunUi();
        this.updateStepUi();
    };

    Editor.prototype.refreshRunUi = function () {
        var runBtn = this.els('btn-run');
        if (runBtn) runBtn.classList.toggle('active', this.running);
    };

    Editor.prototype.updateStepUi = function () {
        var el = this.els('step-label');
        if (el) {
            var max = this.sim ? this.sim.maxLevel + 1 : 1;
            el.textContent = this.stepLevel < 0 ? 'STEP' : ('STEP ' + Math.min(this.stepLevel + 1, max) + '/' + max);
        }
    };

    /* ----------------------------------------------------------------- *
     *  Editing primitives
     * ----------------------------------------------------------------- */

    Editor.prototype.pushUndo = function () {
        if (this.undoStack.length > 80) this.undoStack.shift();
        this.undoStack.push(JSON.stringify(this.graph));
        this.redoStack.length = 0;
    };

    Editor.prototype.undo = function () {
        var s = this.undoStack.pop();
        if (!s) return;
        this.redoStack.push(JSON.stringify(this.graph));
        var backup = this.undoStack.pop();
        this.undoStack.push(backup); /* restore the same snapshot if it was a stack guard */
        this.restoreState(s);
    };

    Editor.prototype.redo = function () {
        var s = this.redoStack.pop();
        if (!s) return;
        this.undoStack.push(JSON.stringify(this.graph));
        this.restoreState(s);
    };

    Editor.prototype.restoreState = function (json) {
        this.stopClockLoop();
        this.running = false;
        window.SignalAnimator.stop();
        this.graph = JSON.parse(json);
        this.rebuildIds();
        this.sim = null;
        this.stepLevel = -1;
        this.selection = { comps: {}, wires: {} };
        this.renderAll();
        var res = this.compute();
        this.lastWireVals = res.wireVals;
        this.status(res);
        this.applyStatic(res);
        this.refreshRunUi();
        this.updateStepUi();
        this.renderInspector();
    };

    Editor.prototype.rebuildIds = function () {
        var maxC = 0, maxW = 0;
        this.graph.components.forEach(function (c) {
            var n = parseInt(String(c.id).split('_')[1], 10); if (n > maxC) maxC = n;
        });
        this.graph.wires.forEach(function (w) {
            var n = parseInt(String(w.id).split('_')[1], 10); if (n > maxW) maxW = n;
        });
        this.nextId.c = maxC + 1;
        this.nextId.w = maxW + 1;
    };

    Editor.prototype.viewCenter = function () {
        var rect = this.canvasWrap.getBoundingClientRect();
        return this.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
    };

    Editor.prototype.addComponent = function (type, pos) {
        var def = window.CircuitComponents[type];
        if (!def) return null;
        this.pushUndo();
        var p = pos || this.viewCenter();
        var comp = {
            id: 'c_' + this.nextId.c++,
            type: type,
            x: this.snap(p.x - def.w / 2),
            y: this.snap(p.y - def.h / 2),
            toggle: false,
            state: {}
        };
        this.graph.components.push(comp);
        this.buildComp(comp);
        this.updateEmptyHint();
        this.clearSelection();
        this.selectComp(comp.id);
        this.validateQuiet();
        return comp;
    };

    Editor.prototype.validateQuiet = function () {
        var res = this.compute();
        this.lastWireVals = res.wireVals;
        this.status(res);
        return res;
    };

    Editor.prototype.selectComp = function (id, additive) {
        if (!additive) this.clearSelectionKeepInspector();
        this.selection.comps[id] = true;
        this.applySelectionVisuals();
        this.renderInspector();
    };

    Editor.prototype.selectWire = function (id, additive) {
        if (!additive) this.clearSelectionKeepInspector();
        this.selection.wires[id] = true;
        this.applySelectionVisuals();
        this.renderInspector();
    };

    Editor.prototype.clearSelectionKeepInspector = function () {
        this.selection = { comps: {}, wires: {} };
        this.applySelectionVisuals();
    };

    Editor.prototype.clearSelection = function () {
        this.clearSelectionKeepInspector();
        this.renderInspector();
    };

    Editor.prototype.applySelectionVisuals = function () {
        for (var id in this.compEls) {
            this.compEls[id].g.classList.toggle('selected', !!this.selection.comps[id]);
        }
        for (var wid in this.wireEls) {
            this.wireEls[wid].base.classList.toggle('selected', !!this.selection.wires[wid]);
        }
    };

    Editor.prototype.primarySelection = function () {
        var cids = Object.keys(this.selection.comps);
        if (cids.length) return { kind: 'comp', id: cids[0] };
        var wids = Object.keys(this.selection.wires);
        if (wids.length) return { kind: 'wire', id: wids[0] };
        return null;
    };

    Editor.prototype.deleteSelection = function () {
        var selComps = this.selection.comps;
        var selWires = this.selection.wires;
        var cids = Object.keys(selComps);
        var wids = Object.keys(selWires);
        if (!cids.length && !wids.length) return;
        this.pushUndo();

        var delWires = {};
        this.graph.wires.forEach(function (w) {
            if (selWires[w.id] || selComps[w.from.comp] || selComps[w.to.comp]) delWires[w.id] = true;
        });
        this.graph.wires = this.graph.wires.filter(function (w) { return !delWires[w.id]; });
        this.graph.components = this.graph.components.filter(function (c) { return !selComps[c.id]; });

        this.selection = { comps: {}, wires: {} };
        this.running = false;
        this.stopClockLoop();
        window.SignalAnimator.stop();
        this.renderWires();
        this.renderComponents();
        var res = this.validateQuiet();
        this.applyStatic(res);
        this.renderInspector();
        this.updateEmptyHint();
    };

    Editor.prototype.duplicateSelection = function () {
        var selComps = this.selection.comps;
        var cids = Object.keys(selComps);
        if (!cids.length) return;
        this.pushUndo();

        var idMap = {};
        var self = this;
        var newComps = [];
        this.graph.components.forEach(function (c) {
            if (!selComps[c.id]) return;
            var nc = {
                id: 'c_' + self.nextId.c++,
                type: c.type,
                x: c.x + 40,
                y: c.y + 40,
                toggle: c.toggle,
                state: JSON.parse(JSON.stringify(c.state || {}))
            };
            idMap[c.id] = nc.id;
            newComps.push(nc);
        });

        this.graph.components = this.graph.components.concat(newComps);

        this.graph.wires.forEach(function (w) {
            if (selComps[w.from.comp] && selComps[w.to.comp]) {
                self.graph.wires.push({
                    id: 'w_' + self.nextId.w++,
                    from: { comp: idMap[w.from.comp], port: w.from.port },
                    to: { comp: idMap[w.to.comp], port: w.to.port }
                });
            }
        });

        this.selection = { comps: {}, wires: {} };
        this.renderComponents();
        this.renderWires();
        newComps.forEach(function (c) { self.selection.comps[c.id] = true; });
        this.applySelectionVisuals();
        this.renderInspector();
        this.validateQuiet();
    };

    Editor.prototype.newCircuit = function () {
        this.pushUndo();
        this.running = false;
        this.stopClockLoop();
        window.SignalAnimator.stop();
        this.graph = { components: [], wires: [] };
        this.selection = { comps: {}, wires: {} };
        this.sim = null;
        this.stepLevel = -1;
        this.lastWireVals = null;
        this.renderAll();
        this.renderInspector();
        this.status({ ok: true, warnings: ['Start building: click a component from the sidebar, then press ▶ Run.'] });
    };

    /* ----------------------------------------------------------------- *
     *  Pointer interactions
     * ----------------------------------------------------------------- */

    Editor.prototype.onCompPointerDown = function (e, comp) {
        if (e.button === 1) { this.startPan(e); return; }
        e.stopPropagation();
        var additive = e.shiftKey;
        if (!additive && !this.selection.comps[comp.id]) this.clearSelectionKeepInspector();
        this.selection.comps[comp.id] = true;
        this.applySelectionVisuals();
        this.renderInspector();

        var self = this;
        var cids = Object.keys(this.selection.comps);
        this.pushUndo();
        this.drag = {
            kind: 'move',
            startX: e.clientX, startY: e.clientY,
            startCanvas: this.screenToCanvas(e.clientX, e.clientY),
            comps: cids.map(function (id) {
                var c = self.findComp(id);
                return { c: c, ox: c.x, oy: c.y };
            }),
            moved: false,
            hit: comp
        };
        this.canvasWrap.setPointerCapture(e.pointerId);
    };

    Editor.prototype.onPortPointerDown = function (e, comp, portId) {
        if (e.button === 1) { this.startPan(e); return; }
        e.stopPropagation();
        var defd = window.CircuitComponents[comp.type];
        var isOut = (defd.outputs || []).some(function (p) { return p.id === portId; });
        this.drag = {
            kind: 'wire',
            comp: comp,
            port: portId,
            isOut: isOut,
            target: null
        };
        this.clearSelectionKeepInspector();
        this.highlightValidTargets(isOut ? 'input' : 'output', comp.id);
        var fromPt = this.portPos(comp, portId);
        if (fromPt) this.showTempWire(fromPt, fromPt);
        this.canvasWrap.setPointerCapture(e.pointerId);
    };

    Editor.prototype.onWirePointerDown = function (e, wireId) {
        e.stopPropagation();
        var additive = e.shiftKey;
        if (!additive) this.clearSelectionKeepInspector();
        this.selection.wires[wireId] = true;
        this.applySelectionVisuals();
        this.renderInspector();
    };

    Editor.prototype.startPan = function (e) {
        this.drag = {
            kind: 'pan',
            startX: e.clientX, startY: e.clientY,
            origX: this.view.x, origY: this.view.y
        };
        this.canvasWrap.setPointerCapture(e.pointerId);
        e.preventDefault();
    };

    Editor.prototype.showTempWire = function (a, b) {
        this.tempWire.setAttribute('d', window.WireSystem.route(a, b));
        this.tempWire.style.display = '';
    };

    Editor.prototype.highlightValidTargets = function (kind, excludeComp) {
        var self = this;
        this.clearPortHighlights();
        this.graph.components.forEach(function (c) {
            if (c.id === excludeComp) return;
            var d = window.CircuitComponents[c.type];
            var list = kind === 'input' ? (d.inputs || []) : (d.outputs || []);
            list.forEach(function (p) {
                var info = self.compEls[c.id];
                if (info && info.ports[p.id]) info.ports[p.id].classList.add('valid-target');
            });
        });
    };

    Editor.prototype.clearPortHighlights = function () {
        for (var id in this.compEls) {
            for (var pid in this.compEls[id].ports) {
                this.compEls[id].ports[pid].classList.remove('valid-target', 'snap-target');
            }
        }
    };

    Editor.prototype.findPortAt = function (cx, cy, kind, excludeComp) {
        var best = null, bestD = SNAP_PORT / this.view.zoom;
        var self = this;
        this.graph.components.forEach(function (c) {
            if (c.id === excludeComp) return;
            var d = window.CircuitComponents[c.type];
            var list = kind === 'input' ? (d.inputs || []) : (d.outputs || []);
            list.forEach(function (p) {
                var pt = self.portPos(c, p.id);
                if (!pt) return;
                var dist = Math.hypot(pt.x - cx, pt.y - cy);
                if (dist < bestD) { bestD = dist; best = { comp: c.id, port: p.id, x: pt.x, y: pt.y }; }
            });
        });
        return best;
    };

    Editor.prototype.onSvgPointerDown = function (e) {
        if (this.placeDrag && this.placeDrag.active) return;
        if (this.spaceHeld || e.button === 1) { this.startPan(e); return; }
        if (this.tool === 'wire') return;

        var p = this.screenToCanvas(e.clientX, e.clientY);
        this.drag = { kind: 'box', startX: e.clientX, startY: e.clientY, cx: p.x, cy: p.y };
        this.canvasWrap.setPointerCapture(e.pointerId);
        this.clearSelectionKeepInspector();
    };

    Editor.prototype.onPointerMove = function (e) {
        if (!this.drag) return;

        if (this.drag.kind === 'pan') {
            this.view.x = this.drag.origX + (e.clientX - this.drag.startX);
            this.view.y = this.drag.origY + (e.clientY - this.drag.startY);
            this.updateView();
            return;
        }

        if (this.drag.kind === 'move') {
            if (!this.drag.moved &&
                Math.hypot(e.clientX - this.drag.startX, e.clientY - this.drag.startY) > 4) {
                this.drag.moved = true;
            }
            if (!this.drag.moved) return;
            var p = this.screenToCanvas(e.clientX, e.clientY);
            var dx = p.x - this.drag.startCanvas.x, dy = p.y - this.drag.startCanvas.y;
            var self = this;
            this.drag.comps.forEach(function (it) {
                it.c.x = self.snap(it.ox + dx);
                it.c.y = self.snap(it.oy + dy);
                var info = self.compEls[it.c.id];
                if (info) self.setTransform(info.g, it.c.x, it.c.y);
            });
            this.updateAllWires();
            return;
        }

        if (this.drag.kind === 'wire') {
            var p2 = this.screenToCanvas(e.clientX, e.clientY);
            var target = this.findPortAt(p2.x, p2.y, this.drag.isOut ? 'input' : 'output', this.drag.comp.id);
            this.drag.target = target || null;
            var a = this.portPos(this.drag.comp, this.drag.port);
            var b = target ? { x: target.x, y: target.y } : p2;
            if (a) this.showTempWire(a, b);
            this.highlightCurrentTarget();
            return;
        }

        if (this.drag.kind === 'box') {
            var now = this.screenToCanvas(e.clientX, e.clientY);
            var x = Math.min(this.drag.cx, now.x), y = Math.min(this.drag.cy, now.y);
            this.selectionBox.setAttribute('x', x);
            this.selectionBox.setAttribute('y', y);
            this.selectionBox.setAttribute('width', Math.abs(now.x - this.drag.cx));
            this.selectionBox.setAttribute('height', Math.abs(now.y - this.drag.cy));
            this.selectionBox.style.display = '';
        }
    };

    Editor.prototype.highlightCurrentTarget = function () {
        var t = this.drag.target;
        for (var id in this.compEls) {
            for (var pid in this.compEls[id].ports) {
                var el = this.compEls[id].ports[pid];
                var on = t && el.getAttribute('data-comp') === t.comp && el.getAttribute('data-port') === t.port;
                el.classList.toggle('snap-target', on);
            }
        }
    };

    Editor.prototype.onPointerUp = function (e) {
        if (!this.drag) return;
        var d = this.drag;

        if (d.kind === 'pan') { this.drag = null; return; }

        if (d.kind === 'move') {
            if (!d.moved) {
                if (d.hit && window.CircuitComponents[d.hit.type].clickable) {
                    d.hit.toggle = !d.hit.toggle;
                    this.syncSwitch(d.hit, this.compEls[d.hit.id]);
                    var res = this.compute();
                    this.lastWireVals = res.wireVals;
                    this.applyStatic(res);
                    this.status(res);
                    this.renderInspector();
                } else {
                    this.undoStack.pop();
                }
            }
            this.drag = null;
            return;
        }

        if (d.kind === 'wire') {
            this.tempWire.style.display = 'none';
            this.clearPortHighlights();
            var t = d.target;
            this.drag = null;
            if (t) {
                var v = window.WireSystem.validate(this.graph, { comp: d.comp.id, port: d.port }, { comp: t.comp, port: t.port });
                if (v.ok) {
                    this.pushUndo();
                    this.graph.wires.push({ id: 'w_' + this.nextId.w++, from: v.from, to: v.to });
                    this.buildWire(this.graph.wires[this.graph.wires.length - 1]);
                    this.validateQuiet();
                    this.toastMsg('Connected ' + v.from.port + ' → ' + v.to.port, 'ok');
                } else {
                    this.toastMsg(v.message, 'err');
                    this.shakeTemp();
                }
            }
            return;
        }

        if (d.kind === 'box') {
            this.selectionBox.style.display = 'none';
            var now = this.screenToCanvas(e.clientX, e.clientY);
            var x1 = Math.min(d.cx, now.x), y1 = Math.min(d.cy, now.y);
            var x2 = Math.max(d.cx, now.x), y2 = Math.max(d.cy, now.y);
            var self = this;
            this.selection = { comps: {}, wires: {} };
            this.graph.components.forEach(function (c) {
                var dd = window.CircuitComponents[c.type];
                if (c.x + dd.w > x1 && c.x < x2 && c.y + dd.h > y1 && c.y < y2) self.selection.comps[c.id] = true;
            });
            this.graph.wires.forEach(function (w) {
                var el = self.wireEls[w.id];
                if (!el) return;
                var pt = el.base.getPointAtLength(el.len / 2);
                if (pt.x > x1 && pt.x < x2 && pt.y > y1 && pt.y < y2) self.selection.wires[w.id] = true;
            });
            this.drag = null;
            this.applySelectionVisuals();
            if (Object.keys(this.selection.comps).length || Object.keys(this.selection.wires).length) this.renderInspector();
        }
    };

    Editor.prototype.shakeTemp = function () {
        var self = this;
        this.tempWire.classList.add('shake');
        setTimeout(function () { self.tempWire.classList.remove('shake'); }, 400);
    };

    /* ----------------------------------------------------------------- *
     *  Zoom
     * ----------------------------------------------------------------- */

    Editor.prototype.zoomAt = function (clientX, clientY, factor) {
        var rect = this.canvasWrap.getBoundingClientRect();
        var px = clientX - rect.left, py = clientY - rect.top;
        var old = this.view.zoom;
        var nz = clamp(old * factor, 0.25, 3);
        if (nz === old) return;
        this.view.x = px - (px - this.view.x) * (nz / old);
        this.view.y = py - (py - this.view.y) * (nz / old);
        this.view.zoom = nz;
        this.updateView();
        this.updateZoomLabel();
    };

    Editor.prototype.zoomIn = function () { this.zoomAt(this.canvasWrap.clientWidth / 2, this.canvasWrap.clientHeight / 2, 1.2); };
    Editor.prototype.zoomOut = function () { this.zoomAt(this.canvasWrap.clientWidth / 2, this.canvasWrap.clientHeight / 2, 1 / 1.2); };

    Editor.prototype.updateZoomLabel = function () {
        var el = this.els('zoom-label');
        if (el) el.textContent = Math.round(this.view.zoom * 100) + '%';
    };

    Editor.prototype.fitView = function () {
        if (!this.graph.components.length) {
            this.view.x = 0; this.view.y = 0; this.view.zoom = 1;
            this.updateView();
            this.updateZoomLabel();
            return;
        }
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        var self = this;
        this.graph.components.forEach(function (c) {
            var d = window.CircuitComponents[c.type];
            minX = Math.min(minX, c.x); minY = Math.min(minY, c.y);
            maxX = Math.max(maxX, c.x + d.w); maxY = Math.max(maxY, c.y + d.h);
        });
        var bw = maxX - minX + 140, bh = maxY - minY + 140;
        var ww = this.canvasWrap.clientWidth, wh = this.canvasWrap.clientHeight;
        if (!ww || !wh) return;
        this.view.zoom = clamp(Math.min(ww / bw, wh / bh), 0.25, 2);
        this.view.x = (ww - bw * this.view.zoom) / 2 - minX * this.view.zoom;
        this.view.y = (wh - bh * this.view.zoom) / 2 - minY * this.view.zoom;
        this.updateView();
        this.updateZoomLabel();
    };

    /* ----------------------------------------------------------------- *
     *  Auto layout
     * ----------------------------------------------------------------- */

    Editor.prototype.autoLayout = function () {
        var res = this.compute();
        var byLevel = {};
        var self = this;
        this.graph.components.forEach(function (c) {
            var lv = res.compLevel[c.id] != null ? res.compLevel[c.id] : 0;
            (byLevel[lv] = byLevel[lv] || []).push(c);
        });
        Object.keys(byLevel).forEach(function (k) {
            byLevel[k].sort(function (a, b) { return window.CircuitComponents[a.type].w - window.CircuitComponents[b.type].w; });
        });
        this.pushUndo();
        Object.keys(byLevel).forEach(function (k) {
            var arr = byLevel[k];
            var y = -((arr.length - 1) * 110) / 2;
            arr.forEach(function (c) {
                c.x = -300 + parseInt(k, 10) * 250;
                c.y = self.snap(y);
                var info = self.compEls[c.id];
                if (info) self.setTransform(info.g, c.x, c.y);
                y += 110;
            });
        });
        this.updateAllWires();
        var r = this.validateQuiet();
        this.lastWireVals = r.wireVals;
        this.applyStatic(r);
        this.fitView();
    };

    /* ----------------------------------------------------------------- *
     *  Projects
     * ----------------------------------------------------------------- */

    Editor.prototype.saveProject = function () {
        var self = this;
        this.modal({
            title: 'Save Circuit',
            body: '<label class="modal-label">Project name</label>' +
                  '<input id="modal-name" class="modal-input" placeholder="My XOR Circuit" data-lpignore="true">',
            confirm: 'Save',
            onConfirm: function (inputEl) {
                var name = (inputEl && inputEl.value.trim()) || 'My Circuit';
                window.ProjectStore.save(name, self.graph);
                self.toastMsg('Saved "' + name + '" in this browser.', 'ok');
                return true;
            }
        });
    };

    Editor.prototype.openProject = function () {
        var self = this;
        this.modal({
            title: 'Load Circuit',
            confirm: '',
            noConfirm: true,
            custom: function (bodyEl) {
                var listEl = document.createElement('div');
                listEl.className = 'project-list';
                var hint = document.createElement('p');
                hint.className = 'modal-hint';
                hint.textContent = 'Projects are stored locally in your browser.';
                bodyEl.appendChild(listEl);
                bodyEl.appendChild(hint);

                var draw = function () {
                    var projects = window.ProjectStore.list();
                    if (!projects.length) {
                        listEl.innerHTML = '<div class="project-empty">No saved circuits yet.<br>Build one and press 💾 Save.</div>';
                        return;
                    }
                    var html = '';
                    projects.forEach(function (p) {
                        var n = String(p.name).replace(/"/g, '&quot;');
                        var comps = (p.graph && p.graph.components.length) || 0;
                        var wires = (p.graph && p.graph.wires.length) || 0;
                        var time = new Date(p.savedAt).toLocaleString();
                        html += '<div class="project-row">' +
                            '<div class="project-info">' +
                            '<span class="project-name">' + p.name + '</span>' +
                            '<span class="project-meta">' + comps + ' components · ' + wires + ' wires · ' + time + '</span>' +
                            '</div>' +
                            '<button class="mini-btn load" data-name="' + n + '">Open</button>' +
                            '<button class="mini-btn del" data-name="' + n + '">✕</button></div>';
                    });
                    listEl.innerHTML = html;
                    listEl.querySelectorAll('.load').forEach(function (b) {
                        b.addEventListener('click', function () {
                            var proj = window.ProjectStore.list().find(function (x) { return x.name === b.getAttribute('data-name'); });
                            if (!proj) return;
                            self.restoreState(JSON.stringify(proj.graph));
                            self.closeModal();
                            self.toastMsg('Loaded "' + proj.name + '".', 'ok');
                        });
                    });
                    listEl.querySelectorAll('.del').forEach(function (b) {
                        b.addEventListener('click', function () {
                            window.ProjectStore.remove(b.getAttribute('data-name'));
                            draw();
                        });
                    });
                };
                draw();
            }
        });
    };

    Editor.prototype.exportProject = function () {
        window.ProjectStore.exportFile(this.graph, 'logiclab-circuit');
        this.toastMsg('Exported circuit as JSON file.', 'ok');
    };

    Editor.prototype.importProject = function () {
        var self = this;
        this.fileImport.click();
        this.fileImport.addEventListener('change', function () {
            var f = self.fileImport.files[0];
            if (!f) return;
            var reader = new FileReader();
            reader.onload = function () {
                var parsed = window.ProjectStore.parseImport(reader.result);
                if (!parsed) { self.toastMsg('Invalid circuit file.', 'err'); return; }
                self.restoreState(JSON.stringify(parsed.graph));
                self.toastMsg('Imported "' + parsed.name + '".', 'ok');
                self.fileImport.value = '';
            };
            reader.readAsText(f);
        }, { once: true });
    };

    /* ----------------------------------------------------------------- *
     *  Inspector
     * ----------------------------------------------------------------- */

    Editor.prototype.renderInspector = function () {
        if (!this.inspectorBody) return;
        var sel = this.primarySelection();
        if (!sel) { this.inspectorBody.innerHTML = this.emptyInspectorHTML(); return; }

        if (sel.kind === 'comp') this.renderCompInspector(sel.id);
        else this.renderWireInspector(sel.id);
    };

    Editor.prototype.renderCompInspector = function (id) {
        var c = this.findComp(id);
        if (!c) { this.inspectorBody.innerHTML = this.emptyInspectorHTML(); return; }
        var d = window.CircuitComponents[c.type];
        var sim = this.sim || this.compute();
        var self = this;
        var html = '';

        html += '<div class="insp-head"><div class="insp-icon">' + (d.icon || '·') + '</div>' +
            '<div><div class="insp-title">' + d.name + '</div>' +
            '<div class="insp-sub">' + d.category + '</div></div></div>';
        html += '<p class="insp-desc">' + (d.desc || '') + '</p>';
        if (d.expr) html += '<div class="expr-chip">' + d.expr + '</div>';

        if ((d.inputs || []).length) {
            html += '<div class="insp-section">Inputs</div><div class="value-table">';
            var self2 = this;
            (d.inputs || []).forEach(function (p) {
                var w = self2.findWireTo(c.id, p.id);
                var lbl = w ? (sim.wireVals[w.id] ? 'HIGH' : 'LOW') : 'unconnected';
                var cls = w ? (sim.wireVals[w.id] ? 'hi' : 'lo') : 'nc';
                html += '<div class="value-row"><span>' + (p.label || p.id) + '</span><span class="pill ' + cls + '">' + lbl + '</span></div>';
            });
            html += '</div>';
        }

        html += '<div class="insp-section">Output</div><div class="value-table">';
        var v = sim.compVals[c.id];
        if ((d.outputs || []).length) {
            var self3 = this;
            (d.outputs || []).forEach(function (p) {
                html += '<div class="value-row"><span>' + (p.label || p.id) + '</span>' +
                    '<span class="pill ' + (v ? 'hi' : 'lo') + '">' + (v ? 'HIGH' : 'LOW') + '</span></div>';
            });
        } else {
            html += '<div class="value-row"><span>IN</span><span class="pill ' + (v ? 'hi' : 'lo') + '">' +
                (v ? 'HIGH' : 'LOW') + '</span></div>';
        }
        html += '</div>';

        if (d.clickable) html += '<button class="insp-btn" id="insp-toggle">' + (c.toggle ? 'Turn OFF' : 'Turn ON') + '</button>';

        if ((d.inputs || []).length) {
            html += '<div class="insp-section">Truth Table</div>' + window.TruthTable.html(c.type);
        }

        var deNote = window.BooleanTheory.deMorganNote(c.type);
        if (deNote) html += '<p class="insp-note">' + deNote + '</p>';

        html += '<div class="insp-actions">' +
            '<button class="insp-btn" id="insp-delete">Delete</button>' +
            '<button class="insp-btn" id="insp-dupe">Duplicate</button></div>';

        this.inspectorBody.innerHTML = html;

        var del = this.inspectorBody.querySelector('#insp-delete');
        if (del) del.addEventListener('click', function () { self.deleteOne(id); });

        var dupe = this.inspectorBody.querySelector('#insp-dupe');
        if (dupe) dupe.addEventListener('click', function () {
            self.clearSelectionKeepInspector();
            self.selection = { comps: {}, wires: {} };
            self.selection.comps[id] = true;
            self.duplicateSelection();
        });

        var tog = this.inspectorBody.querySelector('#insp-toggle');
        if (tog) tog.addEventListener('click', function () {
            c.toggle = !c.toggle;
            self.syncSwitch(c, self.compEls[c.id]);
            var r = self.compute();
            self.lastWireVals = r.wireVals;
            self.applyStatic(r);
            self.status(r);
            self.renderInspector();
        });
    };

    Editor.prototype.deleteOne = function (id) {
        this.selection = { comps: {}, wires: {} };
        this.selection.comps[id] = true;
        this.deleteSelection();
        this.renderInspector();
    };

    Editor.prototype.findWireTo = function (compId, portId) {
        for (var i = 0; i < this.graph.wires.length; i++) {
            if (this.graph.wires[i].to.comp === compId && this.graph.wires[i].to.port === portId) return this.graph.wires[i];
        }
        return null;
    };

    Editor.prototype.renderWireInspector = function (id) {
        var w = this.findWire(id);
        if (!w) { this.inspectorBody.innerHTML = this.emptyInspectorHTML(); return; }
        var sim = this.sim || this.compute();
        var srcC = this.findComp(w.from.comp), dstC = this.findComp(w.to.comp);
        if (!srcC || !dstC) return;
        var srcD = window.CircuitComponents[srcC.type], dstD = window.CircuitComponents[dstC.type];
        var val = sim.wireVals[w.id];
        var self = this;

        var html = '';
        html += '<div class="insp-head"><div class="insp-icon">⏦</div><div><div class="insp-title">Wire</div>' +
            '<div class="insp-sub">connection</div></div></div>';
        html += '<div class="insp-section">Signal</div><div class="value-table">';
        html += '<div class="value-row"><span>Level</span><span class="pill ' + (val ? 'hi' : 'lo') + '">' + (val ? 'HIGH' : 'LOW') + '</span></div>';
        html += '<div class="value-row"><span>Source</span><span>' + srcD.name + ' · ' + w.from.port + '</span></div>';
        html += '<div class="value-row"><span>Target</span><span>' + dstD.name + ' · ' + w.to.port + '</span></div>';
        html += '</div>';
        html += '<div class="insp-actions"><button class="insp-btn" id="insp-delwire">Delete wire</button></div>';
        this.inspectorBody.innerHTML = html;

        var dw = this.inspectorBody.querySelector('#insp-delwire');
        if (dw) dw.addEventListener('click', function () {
            self.pushUndo();
            self.graph.wires = self.graph.wires.filter(function (x) { return x.id !== w.id; });
            self.selection = { comps: {}, wires: {} };
            self.renderWires();
            var r = self.validateQuiet();
            self.applyStatic(r);
            self.renderInspector();
        });
    };

    Editor.prototype.emptyInspectorHTML = function () {
        return '<div class="insp-empty">' +
            '<div class="insp-empty-icon">👾</div>' +
            '<p>Select a component or wire to inspect it.</p>' +
            '<span>Add parts from the palette · drag port → port to wire · press <b>▶ Run</b>.</span></div>';
    };

    /* ----------------------------------------------------------------- *
     *  Modal / toast
     * ----------------------------------------------------------------- */

    Editor.prototype.modal = function (opts) {
        this.closeModal();
        var bd = document.createElement('div');
        bd.className = 'modal-backdrop';
        bd.id = 'modal-backdrop';
        var box = document.createElement('div');
        box.className = 'modal-box';

        var head = document.createElement('div');
        head.className = 'modal-head';
        head.innerHTML = '<span>' + (opts.title || 'LogicLab') + '</span><button class="modal-x">✕</button>';
        box.appendChild(head);

        if (opts.body) {
            var bodyEl = document.createElement('div');
            bodyEl.className = 'modal-body';
            bodyEl.innerHTML = opts.body;
            box.appendChild(bodyEl);
        }
        if (opts.custom) {
            var customEl = document.createElement('div');
            customEl.className = 'modal-body';
            box.appendChild(customEl);
            opts.custom.apply(this, [customEl]);
        }
        if (opts.confirm) {
            var foot = document.createElement('div');
            foot.className = 'modal-foot';
            var btn = document.createElement('button');
            btn.className = 'btn btn-primary';
            btn.textContent = opts.confirm;
            foot.appendChild(btn);
            box.appendChild(foot);
            var self = this;
            btn.addEventListener('click', function () {
                var inputEl = box.querySelector('#modal-name') || null;
                var done = opts.onConfirm ? opts.onConfirm(inputEl) : true;
                if (done) self.closeModal();
            });
        }

        bd.appendChild(box);
        var self2 = this;
        bd.addEventListener('pointerdown', function (e) {
            if (e.target === bd || e.target.classList.contains('modal-x')) self2.closeModal();
        });
        this.root.appendChild(bd);
        setTimeout(function () { bd.classList.add('show'); }, 10);
        var input = box.querySelector('input');
        if (input) setTimeout(function () { input.focus(); }, 60);
    };

    Editor.prototype.closeModal = function () {
        var m = this.root.querySelector('#modal-backdrop');
        if (m) m.remove();
    };

    Editor.prototype.toastMsg = function (msg, type) {
        if (!this.toast) return;
        this.toast.textContent = msg;
        this.toast.className = 'toast show ' + (type || '');
        clearTimeout(this._toastT);
        this._toastT = setTimeout(function () { this.toast.className = 'toast'; }.bind(this), 2600);
    };

    /* ----------------------------------------------------------------- *
     *  Binding / keyboard
     * ----------------------------------------------------------------- */

    Editor.prototype.bindEvents = function () {
        var self = this;

        this.svg.addEventListener('pointerdown', function (e) { self.onSvgPointerDown(e); });
        this.canvasWrap.addEventListener('pointermove', function (e) { self.onPointerMove(e); });
        this.canvasWrap.addEventListener('pointerup', function (e) { self.onPointerUp(e); });
        this.canvasWrap.addEventListener('pointercancel', function () {
            self.drag = null;
            self.tempWire.style.display = 'none';
            self.clearPortHighlights();
        });

        this.canvasWrap.addEventListener('wheel', function (e) {
            e.preventDefault();
            self.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });

        /* toolbar */
        var map = {
            'btn-new': function () { self.newCircuit(); self.toastMsg('New circuit created.', 'ok'); },
            'btn-save': function () { self.saveProject(); },
            'btn-open': function () { self.openProject(); },
            'btn-export': function () { self.exportProject(); },
            'btn-import': function () { self.importProject(); },
            'btn-undo': function () { self.undo(); },
            'btn-redo': function () { self.redo(); },
            'btn-delete': function () { self.deleteSelection(); },
            'btn-tool-select': function () { self.tool = 'select'; self.refreshToolButtons(); },
            'btn-tool-wire': function () {
                self.tool = 'wire';
                self.refreshToolButtons();
                self.toastMsg('Wire tool: drag from an output port to an input port.', '');
            },
            'btn-grid': function () {
                self.view.grid = !self.view.grid;
                if (self.view.grid) {
                    self.graph.components.forEach(function (c) { c.x = self.snap(c.x); c.y = self.snap(c.y); });
                    self.graph.components.forEach(function (c) {
                        var info = self.compEls[c.id];
                        if (info) self.setTransform(info.g, c.x, c.y);
                    });
                    self.updateAllWires();
                    self.toastMsg('Snap to grid ON.', 'ok');
                } else {
                    self.toastMsg('Snap to grid OFF.', 'ok');
                }
                self.refreshGrid();
                self.refreshToolButtons();
            },
            'btn-autolayout': function () { self.autoLayout(); },
            'btn-run': function () { self.run(); },
            'btn-pause': function () { self.pause(); },
            'btn-step': function () { self.step(); },
            'btn-reset': function () { self.reset(); },
            'btn-sidebar': function () { self.sidebar.classList.toggle('collapsed'); },
            'inspector-toggle': function () { self.inspector.classList.toggle('hidden'); },
            'inspector-close-btn': function () { self.inspector.classList.add('hidden'); },
            'zoom-in': function () { self.zoomIn(); },
            'zoom-out': function () { self.zoomOut(); },
            'zoom-fit': function () { self.fitView(); }
        };
        Object.keys(map).forEach(function (id) {
            var el = self.els(id);
            if (el) el.addEventListener('click', map[id]);
        });

        var speed = this.els('speed-slider');
        if (speed) {
            speed.addEventListener('input', function () {
                var v = parseFloat(speed.value);
                var el = self.els('speed-val');
                if (el) el.textContent = v >= 230 ? 'FAST' : (v <= 90 ? 'SLOW' : 'NORM');
            });
        }

        /* palette */
        this.sidebar.querySelectorAll('.comp-item').forEach(function (item) { self.bindPaletteItem(item); });

        /* window-level palette drag + keyboard */
        window.addEventListener('pointermove', function (e) { self.onPaletteMove(e); });
        window.addEventListener('pointerup', function (e) { self.onPaletteUp(e); });

        document.addEventListener('keydown', function (e) {
            var tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

            if (e.code === 'Space') { self.spaceHeld = true; e.preventDefault(); }
            if (e.key === 'Escape') {
                self.drag = null;
                self.tempWire.style.display = 'none';
                self.clearPortHighlights();
                self.clearSelection();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); self.deleteSelection(); }

            var mod = e.ctrlKey || e.metaKey;
            if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? self.redo() : self.undo(); }
            if (mod && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); self.redo(); }
            if (mod && e.key === 'd') { e.preventDefault(); self.duplicateSelection(); }
            if (mod && e.key === 's') { e.preventDefault(); self.saveProject(); }
            if (mod && e.key === 'o') { e.preventDefault(); self.openProject(); }

            if (!e.ctrlKey && !e.metaKey) {
                if (e.key === '+' || e.key === '=') self.zoomIn();
                if (e.key === '-') self.zoomOut();
                if (e.key === '0') self.fitView();
            }
        });
        document.addEventListener('keyup', function (e) { if (e.code === 'Space') self.spaceHeld = false; });

        window.addEventListener('resize', function () { self.updateZoomLabel(); });
        this.updateZoomLabel();
        this.refreshToolButtons();
    };

    Editor.prototype.bindPaletteItem = function (item) {
        var type = item.getAttribute('data-type');
        var self = this;
        item.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault();
            self.placeDrag = { type: type, active: true, comp: null };
        });
    };

    Editor.prototype.onPaletteMove = function (e) {
        if (!this.placeDrag || !this.placeDrag.active) return;
        var pd = this.placeDrag;
        var rect = this.canvasWrap.getBoundingClientRect();
        var overCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom;
        if (!overCanvas || pd.comp) return;

        var p = this.screenToCanvas(e.clientX, e.clientY);
        var comp = this.addComponent(pd.type, p);
        pd.comp = comp;
        if (!comp) return;
        this.drag = {
            kind: 'move',
            startX: e.clientX, startY: e.clientY,
            startCanvas: p,
            comps: [{ c: comp, ox: comp.x, oy: comp.y }],
            moved: true,
            hit: comp
        };
    };

    Editor.prototype.onPaletteUp = function () {
        if (!this.placeDrag || !this.placeDrag.active) return;
        var pd = this.placeDrag;
        var type = pd.type;
        this.placeDrag = null;
        this.drag = null;
        if (!pd.comp) this.addComponent(type);
    };

    Editor.prototype._on = function (id, evt, fn) {
        var el = this.els(id);
        if (el) el.addEventListener(evt, fn);
    };

    Editor.prototype.refreshToolButtons = function () {
        var s = this.els('btn-tool-select');
        var w = this.els('btn-tool-wire');
        var g = this.els('btn-grid');
        if (s) s.classList.toggle('active', this.tool === 'select');
        if (w) w.classList.toggle('active', this.tool === 'wire');
        if (g) g.classList.toggle('active', this.view.grid);
        if (this.canvasWrap) this.canvasWrap.classList.toggle('wire-tool', this.tool === 'wire');
    };

    return Editor;
})();

/* instantiate when the builder page is present */
document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('editor-app')) new (window.CircuitEditor)('editor-app');
});