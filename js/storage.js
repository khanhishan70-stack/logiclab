/**
 * LogicLab — Project Storage
 * Save/load circuits in browser LocalStorage + export/import as JSON files.
 */

window.ProjectStore = (function () {

    var KEY = 'logiclab.projects';

    function list() {
        try {
            var raw = localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function save(name, graph) {
        var projects = list();
        var item = {
            name: name,
            savedAt: Date.now(),
            graph: {
                components: graph.components.map(function (c) { return cloneComp(c); }),
                wires: graph.wires.map(function (w) {
                    return { id: w.id, from: { comp: w.from.comp, port: w.from.port }, to: { comp: w.to.comp, port: w.to.port } };
                })
            }
        };
        var idx = projects.findIndex(function (p) { return p.name === name; });
        if (idx >= 0) projects[idx] = item; else projects.push(item);
        try { localStorage.setItem(KEY, JSON.stringify(projects)); } catch (e) { /* storage full or blocked */ }
        return projects;
    }

    function cloneComp(c) {
        return {
            id: c.id,
            type: c.type,
            x: c.x,
            y: c.y,
            toggle: !!c.toggle,
            state: c.state || {}
        };
    }

    function remove(name) {
        var projects = list().filter(function (p) { return p.name !== name; });
        try { localStorage.setItem(KEY, JSON.stringify(projects)); } catch (e) {}
        return projects;
    }

    function clearAll() {
        try { localStorage.removeItem(KEY); } catch (e) {}
    }

    /* ---- file export / import ---- */

    function exportFile(graph, name) {
        var data = JSON.stringify({
            app: 'LogicLab',
            version: 1,
            name: name || 'circuit',
            graph: graph
        }, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (name || 'logiclab-circuit') + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 50);
    }

    function parseImport(text) {
        try {
            var data = JSON.parse(text);
            var g = data.graph;
            if (!g || !g.components || !g.wires) return null;
            var comps = g.components.map(function (c) {
                return { id: c.id, type: c.type, x: Number(c.x) || 0, y: Number(c.y) || 0, toggle: !!c.toggle, state: c.state || {} };
            });
            var wires = g.wires.map(function (w) {
                return { id: w.id, from: { comp: w.from.comp, port: w.from.port }, to: { comp: w.to.comp, port: w.to.port } };
            });
            return { name: data.name || 'imported', graph: { components: comps, wires: wires } };
        } catch (e) {
            return null;
        }
    }

    return {
        list: list,
        save: save,
        remove: remove,
        clearAll: clearAll,
        exportFile: exportFile,
        parseImport: parseImport
    };
})();