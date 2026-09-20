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

  function walk(fiber, depth) {
    var f = fiber;
    while (f) {
      var d = f.actualDuration;
      if (typeof d === 'number' && d > 0) {
        var n = fiberName(f);
        var e = agg[n] || (agg[n] = { count: 0, dur: 0 });
        e.count++;
        e.dur += d;
        agg.__rendered.total++;
      }
      if (f.child) walk(f.child, depth + 1);
      f = f.sibling;
    }
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
          walk(root.current, 0);
          commitLog.push({ at: now, total: agg.__rendered.total });
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
      t0 = performance.now();
    },
    snapshot: function () {
      var byName = [];
      for (var k in agg) {
        if (k === '__rendered') continue;
        byName.push({ name: k, renders: agg[k].count, dur: +agg[k].dur.toFixed(2) });
      }
      byName.sort(function (a, b) { return b.dur - a.dur; });
      return {
        commits: commitCount,
        renderedFibers: agg.__rendered.total,
        endToEndMs: +(performance.now() - t0).toFixed(2),
        commitSpanMs: lastCommitAt !== null && firstCommitAt !== null ? +(lastCommitAt - firstCommitAt).toFixed(2) : null,
        byName: byName.slice(0, 25),
        strictModeDouble: commitLog.length > 1,
      };
    },
    hasReact: function () {
      return !!renderer;
    },
  };
})();