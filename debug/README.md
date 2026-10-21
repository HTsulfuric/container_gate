# ⏱ Gatekey perf probe (temporal)

Herramienta de diagnóstico para responder **dónde** se van los ~3 s entre
"clic en un enlace externo" y "tarjetas de contenedores visibles".

No toca `background.js`, `interstitial.js` ni `order.js`: sólo añade dos
scripts de medición y dos líneas de configuración.

## Qué mide

| Tramo | Métrica | Qué significa si es grande |
|---|---|---|
| A | `a_request_to_redirect_ms` | La cadena de `webRequest` blocking (Gatekey + otras extensiones) |
| B | `b_redirect_to_page_ms` | Arranque del content process / carga del documento |
| C | `page.qid_init_ms` | `contextualIdentities.query()` desde la página |
| C | `page.storage_get_init_ms` | `storage.local.get()` desde la página (QuotaManager/IDB) |
| C | `page.cgGetOrderedContainers_init_ms` | Lo que espera `init()` realmente |
| C | `page.first_card_ms` | **Lo que ve el usuario**: primera tarjeta en el DOM |
| D | `bg_api_last6s[]` | Control: latencia de los mismos APIs desde el fondo |

Lectura:

- **C lento, D rápido** → el problema está en el camino de la página (child
  actor de la extensión / arranque de storage en el content process).
- **C lento y D lento a la vez** → el proceso padre está ocupado: contentión
  de otras extensiones (listeners blocking) o QuotaManager.
- **A grande** → el cuello es la cadena blocking de `webRequest`, no Gatekey.
- **Sólo `*_init_ms` grande, `r1_*`/`r2_*` rápidos** → coste único de arranque.

## Cómo activarlo

1. `about:addons` → desactiva **Gatekey** instalado (si no, interceptan las dos).
2. `about:debugging#/runtime/this-firefox` → **Cargar complemento temporal…** →
   selecciona `manifest.json` de este repo.
3. Abre el **Inspector** del complemento (consola): verás `[Gatekey perf]`.
4. Abre 3-4 enlaces desde fuera de Firefox (correo, Slack, terminal):
   `open -a Firefox https://example.com`
5. **No cierres Firefox** y ejecuta:

   ```sh
   python3 debug/read-perf-log.py          # tabla
   python3 debug/read-perf-log.py --json   # todo el detalle
   ```

En la consola del fondo también vale `browser.runtime.sendMessage({type:"CG_PERF_DUMP"})`.

## Cómo quitarlo

```sh
git checkout manifest.json interstitial/interstitial.html
rm -rf debug/
```

Y en `about:addons`, desactiva el complemento temporal y vuelve a activar el
Gatekey instalado.
