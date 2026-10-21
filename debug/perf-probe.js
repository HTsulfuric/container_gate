/**
 * Gatekey - debug/perf-probe.js   ⏱ TEMPORAL (herramienta de diagnóstico)
 *
 * Se carga ANTES de interstitial.js para poder medir, sin tocar el código de
 * producción:
 *   - cgGetOrderedContainers()  (lo que tarda init() en tener contenedores)
 *   - contextualIdentities.query()  y  storage.local.get()  por separado
 *   - el momento real en que aparece la primera tarjeta (#cg-grid)
 *   - métricas del documento (navegación, paint, process)
 *
 * Mide dos veces más cada API tras el arranque, para distinguir
 * "coste único de arranque" de "lentitud continua".
 *
 * ── Cómo quitarlo ───────────────────────────────────────────────────────
 *   git checkout manifest.json interstitial/interstitial.html
 *   rm -rf debug/
 */

/* eslint-disable no-console */

(function () {
  "use strict";

  if (!window.browser || !browser.runtime || !document.getElementById("cg-grid")) return;

  const now = () => Date.now();
  const T0 = now(); // instante en que este script empezó a correr

  const page = { probeStartAt: T0 };
  let phase = "init";
  const buckets = {};

  function stamp(name, ms, extra) {
    const key = phase === "init" ? name + "_init_ms" : `${phase}_${name}_ms`;
    page[key] = ms;
    if (extra !== undefined) page[key + "_extra"] = extra;
  }

  // ── 1) Medir cgGetOrderedContainers() tal y como lo usa init() ───────────
  const origOrdered = window.cgGetOrderedContainers;
  if (typeof origOrdered === "function") {
    window.cgGetOrderedContainers = async function () {
      const t0 = now();
      let count = null;
      try {
        const r = await origOrdered.apply(this, arguments);
        count = Array.isArray(r) ? r.length : null;
        return r;
      } catch (err) {
        page.cgGetOrderedContainers_error = String(err);
        throw err;
      } finally {
        stamp("cgGetOrderedContainers", now() - t0, count);
      }
    };
  }

  // ── 2) Medir cada primitiva por separado (para atribuir el coste) ────────
  function instrument(obj, name, label) {
    if (!obj || typeof obj[name] !== "function") return;
    const orig = obj[name].bind(obj);
    obj[name] = function () {
      const t0 = now();
      return Promise.resolve(orig.apply(null, arguments)).then(
        (r) => {
          stamp(label, now() - t0);
          return r;
        },
        (err) => {
          stamp(label, now() - t0);
          throw err;
        }
      );
    };
  }

  if (browser.contextualIdentities) instrument(browser.contextualIdentities, "query", "qid");
  if (browser.storage && browser.storage.local) instrument(browser.storage.local, "get", "storage_get");
  if (browser.tabs) instrument(browser.tabs, "query", "tabs_query");
  if (browser.runtime) instrument(browser.runtime, "sendMessage", "sendMessage");

  // ── 3) Cuándo aparece de verdad la primera tarjeta ───────────────────────
  const grid = document.getElementById("cg-grid");
  const mo = new MutationObserver(() => {
    if (grid.querySelector(".cg-container-card") || grid.querySelector(".cg-empty")) {
      page.first_card_ms = now() - T0;
      mo.disconnect();
    }
  });
  mo.observe(grid, { childList: true, subtree: true });

  // ── 4) Métricas del documento ───────────────────────────────────────────
  function docMetrics() {
    try {
      const nav = performance.getEntriesByType("navigation")[0];
      if (nav) {
        page.nav_responseEnd_ms = Math.round(nav.responseEnd);
        page.nav_domContentLoaded_ms = Math.round(nav.domContentLoadedEventEnd);
        page.nav_loadEvent_ms = Math.round(nav.loadEventEnd);
        page.nav_transferSize = nav.transferSize;
      }
      const paints = performance.getEntriesByType("paint");
      paints.forEach((p) => {
        page["paint_" + p.name] = Math.round(p.startTime);
      });
      page.doc_readyState_at_probe = document.readyState;
      page.timeOrigin_delta_ms = Math.round(performance.timeOrigin - (page.probeStartAt - performance.now()));
    } catch (_) {}
  }

  // ── 5) Rondas extra: ¿coste único o lentitud continua? ──────────────────
  async function round(label) {
    phase = label;
    const timed = async (fn) => {
      const t0 = now();
      try { await fn(); } catch (_) {}
      return now() - t0;
    };
    page[`${label}_qid_ms`] = await timed(() => browser.contextualIdentities.query({}));
    page[`${label}_storage_get_ms`] = await timed(() => browser.storage.local.get("cg_order"));
    page[`${label}_tabs_query_ms`] = await timed(() => browser.tabs.query({ active: true, currentWindow: true }));
    const tp = now();
    await Promise.resolve();
    page[`${label}_promise_baseline_ms`] = now() - tp;
  }

  async function report() {
    docMetrics();
    page.cards_rendered = grid.querySelectorAll(".cg-container-card").length;
    try {
      await browser.runtime.sendMessage({ type: "CG_PERF", report: page });
    } catch (err) {
      console.warn("[Gatekey perf] no se pudo enviar el informe:", err);
    }
  }

  // init() arranca sus awaits de inmediato; las rondas van después para no
  // contaminar la medición del camino crítico.
  setTimeout(async () => {
    await round("r1");
    await new Promise((r) => setTimeout(r, 400));
    await round("r2");
    await report();
  }, 0);

  // Red de seguridad por si init() se queda colgado.
  setTimeout(report, 4000);
})();
