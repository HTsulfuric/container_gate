/**
 * ContainerGate - interstitial/interstitial.js
 * Página intermedia que se muestra ANTES de cargar la URL externa.
 * La página real nunca se carga hasta que el usuario elige contenedor.
 */

(function () {
  "use strict";

  // Atajo para traducir cadenas dinámicas
  const t = (key, subs) => browser.i18n.getMessage(key, subs) || key;

  // ─── Leer la URL destino desde los query params ──────────────────────────

  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get("url") || "";
  let domain = "";
  try { domain = new URL(targetUrl).hostname; } catch (_) {}

  const renderedCards = [];

  // Mostrar la URL destino en el título de la pestaña para que se vea en la barra
  document.title = t("openLinkTitle", [domain || t("linkWord")]);

  // ─── Pintar info de la URL ───────────────────────────────────────────────

  document.getElementById("cg-domain").textContent = domain || targetUrl;
  const urlFull = document.getElementById("cg-url-full");
  urlFull.textContent = targetUrl.length > 70 ? targetUrl.slice(0, 67) + "…" : targetUrl;
  urlFull.title = targetUrl;
  document.getElementById("cg-remember-domain").textContent = domain || t("thisSite");

  // ─── Acciones ────────────────────────────────────────────────────────────

  function choose(containerId) {
    const remember = document.getElementById("cg-remember").checked;
    browser.runtime.sendMessage({
      type: "CG_CONTAINER_CHOSEN",
      url: targetUrl,
      domain,
      containerId,
      remember,
    });
  }

  function openNormal() {
    browser.runtime.sendMessage({ type: "CG_OPEN_NORMAL", url: targetUrl });
  }

  function cancel() {
    browser.runtime.sendMessage({ type: "CG_CANCEL" });
  }

  // ─── Cargar contenedores y construir las tarjetas ────────────────────────

  async function init() {
    let containers = [];
    try {
      containers = await cgGetOrderedContainers();
    } catch (err) {
      console.error("[ContainerGate] No se pudieron leer los contenedores:", err);
    }

    const grid = document.getElementById("cg-grid");

    if (!containers.length) {
      const empty = document.createElement("p");
      empty.className = "cg-empty";
      empty.textContent = t("noContainers");
      grid.replaceWith(empty);
    } else {
      containers.forEach((c, index) => {
        const color = c.colorCode || "#7a8491";

        const card = document.createElement("button");
        card.type = "button";
        card.className = "cg-container-card";
        card.style.setProperty("--cg-color", color);

        if (index < 9) {
          const badge = document.createElement("span");
          badge.className = "cg-number-badge";
          badge.textContent = String(index + 1);
          badge.setAttribute("aria-hidden", "true");
          card.appendChild(badge);
        }

        const iconEl = document.createElement("span");
        iconEl.className = "cg-card-icon";
        iconEl.setAttribute("aria-hidden", "true");
        if (c.iconUrl) {
          iconEl.style.setProperty("--cg-icon", `url("${c.iconUrl}")`);
        }

        const nameEl = document.createElement("span");
        nameEl.className = "cg-card-name";
        nameEl.textContent = c.name;

        card.append(iconEl, nameEl);
        card.addEventListener("click", () => choose(c.cookieStoreId));
        renderedCards.push(card);
        grid.appendChild(card);
      });
    }

    // El primer contenedor del orden guardado es también la opción inicial.
    (renderedCards[0] || document.getElementById("cg-open-normal")).focus();
  }

  // Devuelve los elementos enfocables visibles dentro de la página
  function getFocusable() {
    return Array.from(
      document.querySelectorAll(
        '#cg-modal button, #cg-modal input, #cg-modal [tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.disabled && el.offsetParent !== null);
  }

  document.getElementById("cg-open-normal").addEventListener("click", openNormal);
  document.getElementById("cg-close").addEventListener("click", cancel);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }

    if (!e.ctrlKey && !e.altKey && !e.metaKey && /^[0-9]$/.test(e.key)) {
      e.preventDefault();
      if (e.key === "0") {
        document.getElementById("cg-open-normal").click();
      } else {
        const card = renderedCards[Number(e.key) - 1];
        if (card) card.click();
      }
      return;
    }

    // Trampa de foco: Tab no debe salir del contenido de la página
    if (e.key === "Tab") {
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  init();
})();
