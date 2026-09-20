/**
 * Hook de React DevTools instrumentado. Se inyecta ANTES de que cargue la app
 * (Page.addScriptToEvaluateOnNewDocument) para que React lo detecte al
 * registrarse y nos avise en cada commit.
 *
 * Recorre el fiber tree en cada commit y agrega `actualDuration` por nombre de
 * componente: eso responde "que componente re-renderizo y cuanto costo", que es
 * justo lo que no se puede saber desde fuera sin instrumentar.
 */
(function () {
  var agg = Object.create(null);
  var commitCount = 0;
  var t0 = 0;
  var firstCommitAt = null;
  var lastCommitAt = null;
  var renderer = null;
  var commitLog = [];
  var commits = [];

  function resetAgg() {
    agg = Object.create(null);
    agg.__rendered = { total: 0 };
  }
  resetAgg();

  function fiberName(fiber) {
    var t = fiber.elementType || fiber.type;
    if (!t) return '(anonimo)';
    if (typeof t === 'string') return t;
    if (t.displayName) return t.displayName;
    if (t.name) return t.name;
    var inner = t.type; // memo / forwardRef
    if (typeof inner === 'string') return inner;
    if (inner && (inner.displayName || inner.name)) return inner.displayName || inner.name;
    if (t.render && (t.render.displayName || t.render.name)) return t.render.displayName || t.render.name;
    return '(anonimo)';
  }

  function walkAll(fiber) {
    var f = fiber;
    while (f) {
      walkOne(f);
      f = f.sibling;
    }
  }

  function walkOne(f) {
    var childrenDur = 0;
    var c = f.child;
    while (c) {
      if (typeof c.actualDuration === 'number') childrenDur += c.actualDuration;
      c = c.sibling;
    }
    var d = f.actualDuration;
    if (typeof d === 'number' && d > 0) {
      var n = fiberName(f);
      var self = d - childrenDur;
      var e = agg[n] || (agg[n] = { count: 0, dur: 0, self: 0 });
      e.count++;
      e.dur += d;
      e.self += self > 0 ? self : 0;
      agg.__rendered.total++;
    }
    if (f.child) walkAll(f.child);
  }

  var hook = {
    supportsFiber: true,
    renderers: new Map(),
    inject: function (internals) {
      renderer = internals;
      var id = hook.renderers.size + 1;
      hook.renderers.set(id, internals);
      return id;
    },
    onCommitFiberRoot: function (id, root) {
      commitCount++;
      var now = performance.now();
      if (firstCommitAt === null) firstCommitAt = now;
      lastCommitAt = now;
      try {
        if (root && root.current) {
          // Snapshot por commit: agregado aparte, para poder distinguir el commit
          // causado por la accion del usuario de cualquier commit de fondo que
          // caiga dentro de la ventana de medicion.
          var before = agg;
          agg = Object.create(null);
          agg.__rendered = { total: 0 };
          walkAll(root.current);
          var names = [];
          for (var k in agg) {
            if (k === '__rendered') continue;
            names.push({ name: k, renders: agg[k].count, dur: +agg[k].dur.toFixed(2), self: +agg[k].self.toFixed(2) });
          }
          names.sort(function (a, b) { return b.self - a.self; });
          commits.push({
            at: +now.toFixed(1),
            renderedFibers: agg.__rendered.total,
            names: names,
          });
          // Volcar el commit a la agregacion global de la accion.
          for (var m in agg) {
            if (m === '__rendered') continue;
            var g = before[m] || (before[m] = { count: 0, dur: 0, self: 0 });
            g.count += agg[m].count;
            g.dur += agg[m].dur;
            g.self += agg[m].self;
          }
          before.__rendered.total += agg.__rendered.total;
          agg = before;
        }
      } catch (err) {
        // la instrumentacion nunca debe tumbar la app
      }
    },
    onCommitFiberUnmount: function () {},
    onPostCommitFiberRoot: function () {},
    onScheduleFiberRoot: function () {},
    checkDCE: function () {},
    setStrictMode: function () {},
  };

  try {
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      value: hook,
      writable: false,
      configurable: true,
    });
  } catch (e) {
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  }

  window.__probe = {
    reset: function () {
      resetAgg();
      commitCount = 0;
      firstCommitAt = null;
      lastCommitAt = null;
      commitLog = [];
      commits = [];
      t0 = performance.now();
    },
    snapshot: function () {
      var byName = [];
      for (var k in agg) {
        if (k === '__rendered') continue;
        byName.push({ name: k, renders: agg[k].count, dur: +agg[k].dur.toFixed(2), self: +agg[k].self.toFixed(2) });
      }
      byName.sort(function (a, b) { return b.self - a.self; });
      return {
        commits: commitCount,
        renderedFibers: agg.__rendered.total,
        endToEndMs: +(performance.now() - t0).toFixed(2),
        commitSpanMs: lastCommitAt !== null && firstCommitAt !== null ? +(lastCommitAt - firstCommitAt).toFixed(2) : null,
        byName: byName,
        commitsDetail: commits,
        strictModeDouble: commitLog.length > 1,
      };
    },
    hasReact: function () {
      return !!renderer;
    },
  };
})();