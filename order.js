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

async function cgGetOrder() {
  const result = await browser.storage.local.get(CG_ORDER_KEY);
  const order = result[CG_ORDER_KEY];
  return Array.isArray(order) ? order : [];
}

async function cgSaveOrder(cookieStoreIds) {
  await browser.storage.local.set({ [CG_ORDER_KEY]: cookieStoreIds });
}

/**
 * Devuelve los contenedores existentes en el orden del usuario.
 * Única fuente de verdad para el número de tecla: el índice del array.
 */
async function cgGetOrderedContainers() {
  const [containers, order] = await Promise.all([
    browser.contextualIdentities.query({}).catch(() => []),
    cgGetOrder(),
  ]);

  const byId = new Map(containers.map((c) => [c.cookieStoreId, c]));
  const ordered = [];

  for (const id of order) {
    const container = byId.get(id);
    if (container) {
      ordered.push(container);
      byId.delete(id);
    }
  }

  // Los que no estaban en cg_order (contenedores nuevos) van al final.
  return ordered.concat(Array.from(byId.values()));
}
