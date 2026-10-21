/**
 * Gatekey - order.js
 *
 * Orden fijo de contenedores, definido por el usuario.
 *
 * El orden de `contextualIdentities.query({})` no es estable: cambia al crear
 * o borrar contenedores. Como las teclas numéricas del selector se asignan por
 * posición, un orden inestable rompe la memoria muscular. Por eso el orden se
 * guarda aparte, en el storage de la extensión.
 *
 * Formato de `cg_order`: array de cookieStoreId, p. ej.
 *   ["firefox-container-2", "firefox-container-1"]
 *
 * Los contenedores ausentes del array se anexan al final en el orden que
 * devuelva la API; los cookieStoreId del array que ya no existen se ignoran.
 * Así nunca hace falta migrar el storage al crear o borrar un contenedor.
 */

const CG_ORDER_KEY = "cg_order";

// Margen que le damos al background para responder con su caché en memoria.
// Si no responde enseguida, se usa el camino clásico (query + storage desde
// esta página). No se lanzan las dos cosas a la vez: lanzar siempre el camino
// clásico sería seguir pagando lo que queremos evitar.
const CG_PRELOAD_GRACE_MS = 150;

async function cgGetOrder() {
  const result = await browser.storage.local.get(CG_ORDER_KEY);
  const order = result[CG_ORDER_KEY];
  return Array.isArray(order) ? order : [];
}

// eslint-disable-next-line no-unused-vars -- usado por popup.js (pestaña Order)
async function cgSaveOrder(cookieStoreIds) {
  await browser.storage.local.set({ [CG_ORDER_KEY]: cookieStoreIds });
}

// El background ya tiene contenedores y orden en memoria: una sola ida, sin
// tocar storage ni contextualIdentities desde esta página.
function cgPreload() {
  return browser.runtime.sendMessage({ type: "CG_PRELOAD" }).then((pre) => {
    if (!pre || !Array.isArray(pre.containers) || !Array.isArray(pre.order)) {
      throw new Error("CG_PRELOAD sin datos");
    }
    return pre;
  });
}

/**
 * Aplica el orden guardado. Los ids ausentes van al final en el orden de la
 * API; los ids que ya no existen se ignoran.
 */
function cgOrderContainers(containers, order) {
  const byId = new Map((containers || []).map((c) => [c.cookieStoreId, c]));
  const ordered = [];

  for (const id of order || []) {
    const container = byId.get(id);
    if (container) {
      ordered.push(container);
      byId.delete(id);
    }
  }

  return ordered.concat(Array.from(byId.values()));
}

/**
 * Devuelve los contenedores existentes en el orden del usuario.
 * Única fuente de verdad para el número de tecla: el índice del array.
 *
 * Primero se pregunta al background, que los tiene en memoria: así esta página
 * no espera ni a storage ni a contextualIdentities. Sólo si tarda demasiado
 * (o el background no contesta) se usa el camino clásico.
 */
// eslint-disable-next-line no-unused-vars -- usado por interstitial.js y popup.js
async function cgGetOrderedContainers() {
  try {
    const pre = await Promise.race([
      cgPreload(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("CG_PRELOAD sin respuesta")), CG_PRELOAD_GRACE_MS)
      ),
    ]);
    return cgOrderContainers(pre.containers, pre.order);
  } catch {
    // Sin respuesta rápida del fondo: consultamos desde esta página.
    return await Promise.all([
      browser.contextualIdentities.query({}).catch(() => []),
      cgGetOrder(),
    ]).then(([containers, order]) => cgOrderContainers(containers, order));
  }
}
