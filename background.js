/**
 * Gatekey - background.js
 * Intercepta URLs que llegan desde aplicaciones externas al navegador
 * ANTES de que la página cargue y muestra un selector de contenedor.
 */

const STORAGE_KEYS = {
  WHITELIST: "cg_whitelist",       // dominios que nunca preguntan
  RULES: "cg_rules",               // domain -> containerId guardados
};

// Pestañas creadas durante esta sesión sin tab de origen (candidatas a "externas").
// Solo la primera navegación http de estas pestañas se intercepta.
const externalTabs = new Set();

// Pestañas que ABRIMOS nosotros (ya en un contenedor o "sin contenedor"): su
// primera navegación debe pasar sin interceptar para evitar bucles infinitos.
const selfOpenedTabs = new Set();

// ─────────────────────────────────────────────
// Utilidades de storage
// ─────────────────────────────────────────────

async function getWhitelist() {
  const result = await browser.storage.local.get(STORAGE_KEYS.WHITELIST);
  return result[STORAGE_KEYS.WHITELIST] || [];
}

async function getRules() {
  const result = await browser.storage.local.get(STORAGE_KEYS.RULES);
  return result[STORAGE_KEYS.RULES] || {};
}

async function saveRules(rules) {
  await browser.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
}

function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// Abrir URL en un contenedor específico
// ─────────────────────────────────────────────

async function openInContainer(url, containerId, currentTabId) {
  const cookieStoreId = containerId || "firefox-default";

  const newTab = await browser.tabs.create({
    url,
    cookieStoreId,
    active: true,
  });

  // Marcar la pestaña que acabamos de crear para que su navegación no se intercepte
  selfOpenedTabs.add(newTab.id);

  // Cerrar la pestaña original que fue interceptada
  if (currentTabId != null) {
    try { await browser.tabs.remove(currentTabId); } catch (_) {}
  }
}

async function openWithoutContainer(url, currentTabId) {
  const newTab = await browser.tabs.create({ url, active: true });
  selfOpenedTabs.add(newTab.id);
  if (currentTabId != null) {
    try { await browser.tabs.remove(currentTabId); } catch (_) {}
  }
}

// ─────────────────────────────────────────────
// Rastrear pestañas externas (sin tab de origen)
// ─────────────────────────────────────────────

browser.tabs.onCreated.addListener((tab) => {
  // Sin opener => no proviene de un clic dentro del navegador.
  // No marcamos las que nosotros mismos abrimos en un contenedor.
  if (tab.openerTabId == null && !selfOpenedTabs.has(tab.id)) {
    externalTabs.add(tab.id);
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  externalTabs.delete(tabId);
  selfOpenedTabs.delete(tabId);
});

// ─────────────────────────────────────────────
// Interceptar la navegación ANTES de cargar la página
// ─────────────────────────────────────────────

async function handleRequest(details) {
  const { url, tabId } = details;

  if (tabId < 0) return {};
  if (!/^https?:\/\//i.test(url)) return {}; // ignorar about:, moz-extension:, file:, etc.

  // Pestaña abierta por nosotros: dejar pasar (evita bucle infinito).
  if (selfOpenedTabs.has(tabId)) {
    selfOpenedTabs.delete(tabId);
    externalTabs.delete(tabId);
    return {};
  }

  // Solo interceptamos pestañas "externas" en su primera navegación.
  if (!externalTabs.has(tabId)) return {};
  externalTabs.delete(tabId);

  // Si la navegación fue iniciada por otra página (clic/JS), no es externa.
  if (details.originUrl || details.documentUrl) return {};

  // Si la pestaña YA está en un contenedor (escribiste la URL a mano dentro de
  // un contenedor), no preguntamos: que cargue directo en ese contenedor.
  try {
    const tab = await browser.tabs.get(tabId);
    if (tab.cookieStoreId && tab.cookieStoreId !== "firefox-default") return {};
  } catch (_) {}

  const domain = getDomain(url);
  if (!domain) return {};

  // Lista blanca: dejar pasar tal cual.
  const whitelist = await getWhitelist();
  if (whitelist.includes(domain)) return {};

  // Regla guardada: abrir directo en su contenedor (cancelando esta carga).
  const rules = await getRules();
  const ruleId = rules[domain];
  if (ruleId && ruleId !== "ask") {
    openInContainer(url, ruleId, tabId);
    return { cancel: true };
  }

  // Sin regla: redirigir a la página interstitial (la página real NO se carga).
  const target = browser.runtime.getURL("interstitial/interstitial.html")
    + "?url=" + encodeURIComponent(url);
  return { redirectUrl: target };
}

browser.webRequest.onBeforeRequest.addListener(
  handleRequest,
  { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] },
  ["blocking"]
);

// ─────────────────────────────────────────────
// Listener: mensajes desde la interstitial o el popup
// ─────────────────────────────────────────────

browser.runtime.onMessage.addListener(async (message, sender) => {
  switch (message.type) {

    // Usuario eligió un contenedor
    case "CG_CONTAINER_CHOSEN": {
      const { url, containerId, remember, domain } = message;
      const tabId = sender.tab?.id;

      if (remember && domain) {
        const rules = await getRules();
        rules[domain] = containerId;
        await saveRules(rules);
      }

      await openInContainer(url, containerId, tabId);
      break;
    }

    // Usuario eligió abrir sin contenedor
    case "CG_OPEN_NORMAL": {
      await openWithoutContainer(message.url, sender.tab?.id);
      break;
    }

    // Usuario canceló: cerrar la pestaña interstitial
    case "CG_CANCEL": {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        try { await browser.tabs.remove(tabId); } catch (_) {}
      }
      break;
    }

    // Popup pide la lista de containers
    case "CG_GET_CONTAINERS": {
      const containers = await browser.contextualIdentities.query({});
      return Promise.resolve(containers);
    }

    // Popup pide whitelist
    case "CG_GET_WHITELIST": {
      return Promise.resolve(await getWhitelist());
    }

    // Popup actualiza whitelist
    case "CG_SET_WHITELIST": {
      await browser.storage.local.set({ [STORAGE_KEYS.WHITELIST]: message.whitelist });
      return Promise.resolve(true);
    }

    // Popup pide reglas
    case "CG_GET_RULES": {
      return Promise.resolve(await getRules());
    }

    // Popup borra una regla
    case "CG_DELETE_RULE": {
      const rules = await getRules();
      delete rules[message.domain];
      await saveRules(rules);
      return Promise.resolve(true);
    }
  }
});
