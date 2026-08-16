# Gatekey 🚪

> **Gatekey is a fork of ContainerGate.** The original was written by
> [Axel Tinoco](https://github.com/AxelTinoco/ContainerGate) and is licensed under
> MPL-2.0; this fork keeps that license. It is not affiliated with or endorsed by
> the original author, and it is not the version published on addons.mozilla.org.
>
> Changes in this fork:
> - Number-key picker — `1`–`9` pick a container, `0` opens without one, `Esc` cancels
> - Fixed container order, configurable from the toolbar panel, so a container always
>   keeps the same number
> - Container icons and colours are read from `contextualIdentities` (`iconUrl` /
>   `colorCode`) instead of a hardcoded emoji/colour map, so they match the tab bar
> - Decorative assets removed (the packaged extension went from ~459 KB to ~35 KB)

**Extensión de Firefox** que intercepta URLs abiertas desde aplicaciones externas (Slack, correo, terminales, etc.) y te pregunta en qué **contenedor de Firefox** deseas abrirlas.

---

## ✨ Funcionalidades

- 🔍 **Detección de links externos** — Captura URLs que llegan desde fuera del navegador
- 📦 **Modal de selección** — Muestra todos tus contenedores disponibles en un popup visual
- ⌨️ **Atajos numéricos** — `1`–`9` eligen contenedor, `0` abre sin contenedor, `Esc` cancela
- 🔢 **Orden fijo** — El orden configurado en el panel determina la tecla de cada contenedor
- ✅ **Lista blanca** — Configura dominios que nunca te preguntarán (se abren directo)
- 💾 **Reglas por dominio** — Recuerda tu elección para cada dominio automáticamente
- 🌐 **Abrir sin contenedor** — Opción de abrir en modo normal cuando lo necesites
- 🛠️ **Icono en toolbar** — Panel de gestión de reglas y lista blanca

---

## 📋 Requisitos

- Firefox 77 o superior
- Extensión **Firefox Multi-Account Containers** instalada (para tener contenedores disponibles)

---

## 🚀 Instalación (modo desarrollo)

1. Abre Firefox y navega a `about:debugging`
2. Haz clic en **"Este Firefox"**
3. Haz clic en **"Cargar complemento temporal"**
4. Selecciona el archivo `manifest.json` dentro de la carpeta del proyecto

> La extensión estará activa hasta que cierres Firefox. Para uso permanente, empaquétala como `.xpi`.

---

## 📦 Empaquetar como .xpi

```bash
cd gatekey/
zip -r ../gatekey.xpi . -x "*.DS_Store" -x "__MACOSX/*"
```

Para instalar permanentemente sin firma (solo en Firefox Developer Edition o Nightly):
1. Ve a `about:config`
2. Establece `xpinstall.signatures.required` en `false`
3. Instala el `.xpi` desde `about:addons` → ⚙️ → "Instalar complemento desde archivo"

---

## 🗂️ Estructura del proyecto

```
gatekey/
├── manifest.json          # Configuración de la extensión (Manifest V2)
├── background.js          # Lógica principal de intercepción
├── i18n.js                # Helper de i18n para páginas inyectadas
├── order.js               # Orden fijo de contenedores (compartido popup/interstitial)
├── _locales/              # Traducciones (en, es_MX, pt, ru, sk)
│   └── <locale>/messages.json
├── interstitial/          # Pantalla de selección de contenedor
│   ├── interstitial.html
│   ├── interstitial.css
│   └── interstitial.js
├── popup/
│   ├── popup.html         # Panel del toolbar
│   ├── popup.css          # Estilos del panel
│   └── popup.js           # Lógica del panel (lista blanca + reglas + orden)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon96.png
```

---

## 🔒 Permisos utilizados

| Permiso | Motivo |
|---|---|
| `tabs` | Detectar tabs nuevas y cerrar tabs interceptadas |
| `storage` | Guardar whitelist y reglas |
| `contextualIdentities` | Listar contenedores disponibles |
| `cookies` | Abrir tabs en el cookieStore del contenedor elegido |
| `webRequest` | Interceptar navegación |

---

## 💡 Cómo funciona

1. Una app externa (Slack, email, terminal) abre una URL en Firefox
2. Gatekey detecta que la tab no tiene tab de origen (viene de fuera)
3. Verifica si el dominio está en la lista blanca → si sí, la deja pasar
4. Verifica si hay una regla guardada → si sí, la abre directamente en ese contenedor
5. Si no hay regla, muestra el **modal de selección**
6. El usuario elige un contenedor (o abre sin contenedor)
7. Gatekey abre la URL en el contenedor elegido y cierra la tab original

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas! Lee la guía de
[**CONTRIBUTING.md**](CONTRIBUTING.md) para saber cómo configurar el entorno,
el estilo de commits y el proceso de pull requests. Al participar aceptas el
[Código de Conducta](CODE_OF_CONDUCT.md).

¿Encontraste un fallo de seguridad? Consulta [SECURITY.md](SECURITY.md) para
reportarlo de forma privada.

---

## 📄 Licencia

Distribuido bajo la **[Mozilla Public License 2.0](LICENSE)**.
