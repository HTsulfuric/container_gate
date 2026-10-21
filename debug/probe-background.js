/**
 * Gatekey - debug/probe-background.js   ⏱ TEMPORAL (herramienta de diagnóstico)
 *
 * Mide DÓNDE se van los ~3 segundos entre "clic en un enlace externo" y
 * "tarjetas de contenedores visibles", separando:
 *
 *   (A) llegada de la petición main_frame  ->  Gatekey responde redirectUrl
 *   (B) redirectUrl                        ->  la página interstitial arranca
 *   (C) dentro de la interstitial: contextualIdentities.query() vs storage.local.get()
 *   (D) latencia baseline de las APIs del lado del background (padre), continua
 *
 * Si (C) es lento pero (D) es rápido  -> el problema está en el path de la
 *     página (child actor / arranque de storage en el content process).
 * Si (C) y (D) son lentos a la vez    -> el proceso padre está ocupado
 *     (contentión de otras extensiones / QuotaManager), no el API concreto.
 *
 * ── Cómo quitarlo ───────────────────────────────────────────────────────
 *   git checkout manifest.json interstitial/interstitial.html
 *   rm -rf debug/
 */

/* eslint-disable no-console */

const CG_PROBE_CFG = {
  enabled: true,
  heartbeatEveryMs: 2000, // latencia baseline de APIs del lado del padre
  heartbeatWarmupMs: 1500,
  maxSamples: 400,
  maxReports: 20,
  logKey: "cg_perf_log", // string JSON en storage.local (legible desde sqlite)
};

const CG_PROBE = {
  samples: [], // { at, kind, label, ms, extra }
  requests: [], // peticiones main_frame vistas por el listener NO bloqueante
  redirects: [], // cuándo devolvimos redirectUrl
  reports: [],

  ms(kind, label, dur, extra) {
    if (!CG_PROBE_CFG.enabled) return;
    this.samples.push({ at: Date.now(), kind, label, ms: dur, extra });
    if (this.samples.length > CG_PROBE_CFG.maxSamples) this.samples.shift();
  },

  trim(arr, max) {
    while (arr.length > max) arr.shift();
  },

  recent(ms) {
    const since = Date.now() - ms;
    return this.samples.filter((s) => s.at >= since);
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Timings de las APIs del lado del background (monkey-patch, sin tocar
// background.js). Sólo mide, no cambia resultados.
// ─────────────────────────────────────────────────────────────────────────

if (CG_PROBE_CFG.enabled) {
  const origStorageGet = browser.storage.local.get.bind(browser.storage.local);
  browser.storage.local.get = function (keys) {
    const t0 = Date.now();
    return Promise.resolve(origStorageGet(keys)).then((r) => {
      CG_PROBE.ms("bg_api", `storage.local.get(${JSON.stringify(keys)})`, Date.now() - t0);
      return r;
    });
  };

  const origTabsGet = browser.tabs.get.bind(browser.tabs);
  browser.tabs.get = function (id) {
    const t0 = Date.now();
    return Promise.resolve(origTabsGet(id)).then((r) => {
      CG_PROBE.ms("bg_api", "tabs.get", Date.now() - t0);
      return r;
    });
  };

  const origTabsQuery = browser.tabs.query.bind(browser.tabs);
  browser.tabs.query = function (q) {
    const t0 = Date.now();
    return Promise.resolve(origTabsQuery(q)).then((r) => {
      CG_PROBE.ms("bg_api", "tabs.query", Date.now() - t0);
      return r;
    });
  };

  const origQIQuery = browser.contextualIdentities.query.bind(browser.contextualIdentities);
  browser.contextualIdentities.query = function (f) {
    const t0 = Date.now();
    return Promise.resolve(origQIQuery(f)).then((r) => {
      CG_PROBE.ms("bg_api", "contextualIdentities.query", Date.now() - t0, Array.isArray(r) ? r.length : null);
      return r;
    });
  };
}

// ─────────────────────────────────────────────────────────────────────────
// (A) Cuándo llega la petición main_frame (listener NO bloqueante: no añade
// coste a la cadena blocking, sólo observa).
// ─────────────────────────────────────────────────────────────────────────

if (CG_PROBE_CFG.enabled) {
  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
      if (details.tabId < 0) return;
      CG_PROBE.requests.push({ at: Date.now(), url: details.url, tabId: details.tabId });
      CG_PROBE.trim(CG_PROBE.requests, 60);
    },
    { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
    []
  );
}

// (B) Cuándo respondimos redirectUrl: observamos la redirección real.
if (CG_PROBE_CFG.enabled) {
  browser.webRequest.onBeforeRedirect.addListener(
    (details) => {
      if (!/^moz-extension:/.test(details.redirectUrl || "")) return;
      CG_PROBE.redirects.push({ at: Date.now(), from: details.url, to: details.redirectUrl, tabId: details.tabId });
      CG_PROBE.trim(CG_PROBE.redirects, 40);
    },
    { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
    []
  );
}

// ─────────────────────────────────────────────────────────────────────────
// (D) Baseline continuo: latencia de las APIs del padre aunque nadie haga
// clic. Sirve de control para comparar con la mediición de la interstitial.
// ─────────────────────────────────────────────────────────────────────────

if (CG_PROBE_CFG.enabled && CG_PROBE_CFG.heartbeatEveryMs > 0) {
  const beat = async () => {
    try {
      const t0 = Date.now();
      const cs = await browser.contextualIdentities.query({});
      CG_PROBE.ms("heartbeat", "contextualIdentities.query", Date.now() - t0, cs.length);
    } catch (_) {}
    try {
      const t1 = Date.now();
      await browser.storage.local.get("cg_order");
      CG_PROBE.ms("heartbeat", "storage.local.get", Date.now() - t1);
    } catch (_) {}
  };
  setTimeout(beat, CG_PROBE_CFG.heartbeatWarmupMs);
  setInterval(beat, CG_PROBE_CFG.heartbeatEveryMs);
}

// ─────────────────────────────────────────────────────────────────────────
// (C) Informe que envía la interstitial: se fusiona con lo visto aquí.
// ─────────────────────────────────────────────────────────────────────────

async function probeCollect(report) {
  const target = report.targetUrl || "";
  const req = [...CG_PROBE.requests].reverse().find((r) => r.url === target);
  const red = [...CG_PROBE.redirects].reverse().find((r) => r.from === target);

  const merged = {
    at: Date.now(),
    url: target,

    // (A) petición -> redirección decidida por Gatekey
    a_request_to_redirect_ms: req && red ? red.at - req.at : null,
    // (B) redirección -> arranque del script de la interstitial
    b_redirect_to_page_ms: red ? report.probeStartAt - red.at : null,
    // (A') petición -> arranque de la página (suma de A+B)
    a_request_to_page_ms: req ? report.probeStartAt - req.at : null,

    // (C) dentro de la página
    page: report,

    // (D) APIs del padre en los últimos 6 s (control)
    bg_api_last6s: CG_PROBE.recent(6000).filter((s) => s.kind === "bg_api" || s.kind === "heartbeat"),
  };

  CG_PROBE.reports.push(merged);
  CG_PROBE.trim(CG_PROBE.reports, CG_PROBE_CFG.maxReports);

  // eslint-disable-next-line no-console
  console.log("[Gatekey perf]", merged);

  try {
    const prev = await browser.storage.local.get(CG_PROBE_CFG.logKey);
    const list = prev && prev[CG_PROBE_CFG.logKey] ? JSON.parse(prev[CG_PROBE_CFG.logKey]) : [];
    list.push(merged);
    while (list.length > CG_PROBE_CFG.maxReports) list.shift();
    // String JSON (no objeto) para poder leerlo desde sqlite con `strings`.
    await browser.storage.local.set({ [CG_PROBE_CFG.logKey]: JSON.stringify(list) });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[Gatekey perf] no se pudo guardar el log:", err);
  }

  return true;
}

if (CG_PROBE_CFG.enabled) {
  browser.runtime.onMessage.addListener((message) => {
    if (message && message.type === "CG_PERF") return Promise.resolve(probeCollect(message.report));
    if (message && message.type === "CG_PERF_DUMP") {
      // eslint-disable-next-line no-console
      console.table(CG_PROBE.reports.map((r) => ({
        url: (r.url || "").slice(0, 40),
        "A req->redirect": r.a_request_to_redirect_ms,
        "B redirect->page": r.b_redirect_to_page_ms,
        "C query()": r.page && r.page.qid_init_ms,
        "C storage.get()": r.page && r.page.storage_init_ms,
        "C cards": r.page && r.page.first_card_ms,
      })));
      return Promise.resolve(CG_PROBE.reports);
    }
    return undefined;
  });
}

// eslint-disable-next-line no-console
console.log("[Gatekey perf] probe-background activo");
