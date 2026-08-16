/**
 * Gatekey - popup.js
 * Lógica del popup: lista blanca, reglas y orden de contenedores.
 */

// Atajo para traducir cadenas dinámicas
const t = (key) => browser.i18n.getMessage(key) || key;

// ─── Pestañas (patrón ARIA Tabs) ─────────────────────────────────────────

const tabs = Array.from(document.querySelectorAll(".tab"));

function activateTab(tab, setFocus = true) {
  tabs.forEach((el) => {
    const selected = el === tab;
    el.classList.toggle("active", selected);
    el.setAttribute("aria-selected", selected ? "true" : "false");
    el.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.remove("active");
  });
  document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
  if (setFocus) tab.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateTab(tab, false));
  tab.addEventListener("keydown", (event) => {
    let next = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = tabs[(index + 1) % tabs.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = tabs[(index - 1 + tabs.length) % tabs.length];
    } else if (event.key === "Home") {
      next = tabs[0];
    } else if (event.key === "End") {
      next = tabs[tabs.length - 1];
    }
    if (next) {
      event.preventDefault();
      activateTab(next);
    }
  });
});

// ─── Presentación de contenedores ────────────────────────────────────────

function createContainerSwatch(container) {
  const swatch = document.createElement("span");
  swatch.className = "container-swatch";
  swatch.setAttribute("aria-hidden", "true");
  swatch.style.setProperty("--cg-color", container?.colorCode || "var(--neutral-container)");

  if (typeof container?.iconUrl === "string" && container.iconUrl.trim()) {
    const icon = document.createElement("span");
    icon.className = "container-icon";
    const iconUrl = container.iconUrl.replace(/["\\\n\r]/g, "");
    icon.style.maskImage = `url("${iconUrl}")`;
    swatch.appendChild(icon);
  }

  return swatch;
}

// ─── Lista blanca ────────────────────────────────────────────────────────

async function loadWhitelist() {
  const whitelist = await browser.runtime.sendMessage({ type: "CG_GET_WHITELIST" });
  const list = document.getElementById("whitelist-list");
  list.replaceChildren();

  if (!whitelist.length) {
    list.appendChild(emptyState(t("whitelistEmpty")));
    return;
  }

  whitelist.forEach((domain) => {
    const li = document.createElement("li");
    li.className = "item-row";

    const domainSpan = document.createElement("span");
    domainSpan.className = "item-domain";
    domainSpan.textContent = domain;

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.dataset.domain = domain;
    btn.textContent = t("btnRemove");
    btn.addEventListener("click", async () => {
      const updated = whitelist.filter((item) => item !== domain);
      await browser.runtime.sendMessage({ type: "CG_SET_WHITELIST", whitelist: updated });
      showToast(t("toastDomainRemoved"));
      loadWhitelist();
    });

    li.append(domainSpan, btn);
    list.appendChild(li);
  });
}

document.getElementById("whitelist-add").addEventListener("click", async () => {
  const input = document.getElementById("whitelist-input");
  const raw = input.value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!raw) return;

  const whitelist = await browser.runtime.sendMessage({ type: "CG_GET_WHITELIST" });
  if (!whitelist.includes(raw)) {
    whitelist.push(raw);
    await browser.runtime.sendMessage({ type: "CG_SET_WHITELIST", whitelist });
    showToast(t("toastDomainAdded"));
  }
  input.value = "";
  loadWhitelist();
});

document.getElementById("whitelist-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("whitelist-add").click();
});

// ─── Reglas ──────────────────────────────────────────────────────────────

async function loadRules() {
  const [rules, containers] = await Promise.all([
    browser.runtime.sendMessage({ type: "CG_GET_RULES" }),
    browser.runtime.sendMessage({ type: "CG_GET_CONTAINERS" }),
  ]);

  const containerMap = {};
  containers.forEach((container) => {
    containerMap[container.cookieStoreId] = container;
  });

  const list = document.getElementById("rules-list");
  list.replaceChildren();

  const entries = Object.entries(rules);
  if (!entries.length) {
    list.appendChild(emptyState(t("rulesEmpty")));
    return;
  }

  entries.forEach(([domain, containerId]) => {
    const container = containerMap[containerId];
    const name = container ? container.name : containerId;

    const li = document.createElement("li");
    li.className = "item-row";

    const domainSpan = document.createElement("span");
    domainSpan.className = "item-domain";
    domainSpan.textContent = domain;

    const badge = document.createElement("span");
    badge.className = "item-container-badge";
    badge.append(createContainerSwatch(container), document.createTextNode(name));

    const btn = document.createElement("button");
    btn.className = "btn btn-ghost";
    btn.dataset.domain = domain;
    btn.textContent = t("btnRemoveShort");
    btn.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ type: "CG_DELETE_RULE", domain });
      showToast(t("toastRuleRemoved"));
      loadRules();
    });

    li.append(domainSpan, badge, btn);
    list.appendChild(li);
  });
}

// ─── Orden de contenedores ───────────────────────────────────────────────

let orderedContainers = [];

function createMoveButton(container, direction, disabled) {
  const messageKey = direction === "up" ? "btnMoveUp" : "btnMoveDown";
  const label = t(messageKey);
  const button = document.createElement("button");
  button.className = "order-move";
  button.type = "button";
  button.dataset.cookieStoreId = container.cookieStoreId;
  button.dataset.direction = direction;
  button.dataset.i18nAriaLabel = messageKey;
  button.dataset.i18nTitle = messageKey;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.textContent = direction === "up" ? "↑" : "↓";
  button.disabled = disabled;
  button.addEventListener("click", () => moveContainer(container.cookieStoreId, direction));
  return button;
}

function restoreMoveFocus(cookieStoreId, direction) {
  const row = Array.from(document.querySelectorAll(".order-row")).find(
    (item) => item.dataset.cookieStoreId === cookieStoreId,
  );
  if (!row) return;

  const requested = row.querySelector(`[data-direction="${direction}"]`);
  if (requested && !requested.disabled) {
    requested.focus();
    return;
  }

  const siblingDirection = direction === "up" ? "down" : "up";
  const sibling = row.querySelector(`[data-direction="${siblingDirection}"]`);
  if (sibling && !sibling.disabled) sibling.focus();
}

function renderOrder(focusTarget = null) {
  const list = document.getElementById("order-list");
  list.replaceChildren();

  if (!orderedContainers.length) {
    list.appendChild(emptyState(t("orderEmpty")));
    return;
  }

  orderedContainers.forEach((container, index) => {
    const li = document.createElement("li");
    li.className = "item-row order-row";
    li.dataset.cookieStoreId = container.cookieStoreId;

    const shortcut = document.createElement("span");
    shortcut.className = "order-shortcut";
    shortcut.textContent = index < 9 ? String(index + 1) : "—";
    if (index >= 9) shortcut.classList.add("no-shortcut");
    const name = document.createElement("span");
    name.className = "order-name";
    name.textContent = container.name;

    const controls = document.createElement("span");
    controls.className = "order-controls";
    controls.append(
      createMoveButton(container, "up", index === 0),
      createMoveButton(container, "down", index === orderedContainers.length - 1),
    );

    li.append(shortcut, createContainerSwatch(container), name, controls);
    list.appendChild(li);
  });

  if (focusTarget) restoreMoveFocus(focusTarget.cookieStoreId, focusTarget.direction);
}

async function moveContainer(cookieStoreId, direction) {
  const currentIndex = orderedContainers.findIndex(
    (container) => container.cookieStoreId === cookieStoreId,
  );
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedContainers.length) return;

  [orderedContainers[currentIndex], orderedContainers[targetIndex]] = [
    orderedContainers[targetIndex],
    orderedContainers[currentIndex],
  ];

  await cgSaveOrder(orderedContainers.map((container) => container.cookieStoreId));
  renderOrder({ cookieStoreId, direction });
  showToast(t("toastOrderSaved"));
}

async function loadOrder() {
  orderedContainers = await cgGetOrderedContainers();
  renderOrder();
}

// ─── Avisos y estados vacíos ─────────────────────────────────────────────

function showToast(msg) {
  let toast = document.querySelector(".cg-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "cg-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function emptyState(msg) {
  const li = document.createElement("li");
  li.className = "empty-state";
  li.textContent = msg;
  return li;
}

// ─── Inicio ──────────────────────────────────────────────────────────────

loadWhitelist();
loadRules();
loadOrder();
