/**
 * Gatekey - i18n.js
 * Reemplaza el texto de los elementos marcados con atributos data-i18n*
 * usando browser.i18n.getMessage(). Se ejecuta en cada página HTML.
 */

(function () {
  "use strict";

  function t(key) {
    if (!key) return "";
    return browser.i18n.getMessage(key) || "";
  }

  function apply() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const msg = t(el.dataset.i18n);
      if (msg) el.textContent = msg;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const msg = t(el.dataset.i18nPlaceholder);
      if (msg) el.setAttribute("placeholder", msg);
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => {
      const msg = t(el.dataset.i18nTitle);
      if (msg) el.setAttribute("title", msg);
    });
    document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const msg = t(el.dataset.i18nAriaLabel);
      if (msg) el.setAttribute("aria-label", msg);
    });

    // <html data-i18n-doctitle="key"> → document.title
    const titleKey = document.documentElement.dataset.i18nDoctitle;
    if (titleKey) {
      const msg = t(titleKey);
      if (msg) document.title = msg;
    }

    // Refleja el idioma activo en el atributo lang
    try {
      document.documentElement.lang = browser.i18n.getUILanguage();
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
})();
