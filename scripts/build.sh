#!/usr/bin/env bash
#
# Gatekey - scripts/build.sh
#
# Genera el paquete .xpi para subir a addons.mozilla.org (sin firmar: AMO lo
# firma al revisar la versión, igual que se hizo con la 1.1.0).
#
#   ./scripts/build.sh            -> dist/gatekey-<version>.xpi
#   ./scripts/build.sh --check    -> sólo valida el manifest y los archivos
#
# El sondaje de diagnóstico (debug/) y los archivos del repo nunca se incluyen.

set -euo pipefail
cd "$(dirname "$0")/.."

MANIFEST="manifest.json"
OUT_DIR="dist"

VERSION="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['version'])" "$MANIFEST")"
OUT="$OUT_DIR/gatekey-$VERSION.xpi"

# Contenido del paquete.
INCLUDE=(manifest.json background.js i18n.js order.js _locales icons interstitial popup)

# ── Validación ─────────────────────────────────────────────────────────────
python3 - "$MANIFEST" <<'PY'
import json, os, sys

path = sys.argv[1]
m = json.load(open(path, encoding="utf-8"))
required = [path]

def add(p):
    if p and not p.startswith(("http://", "https://", "moz-extension://", "data:")):
        required.append(p.split("?")[0].split("#")[0])

bg = m.get("background") or {}
for s in bg.get("scripts", []):
    add(s)
add(bg.get("page"))

ba = m.get("browser_action") or m.get("page_action") or {}
add(ba.get("default_popup"))
for _, v in (ba.get("default_icon") or {}).items():
    add(v)
for _, v in (m.get("icons") or {}).items():
    add(v)
for r in m.get("web_accessible_resources", []) or []:
    add(r)

missing = sorted({p for p in required if not os.path.exists(p)})
if missing:
    sys.exit("Faltan archivos declarados en el manifest:\n  " + "\n  ".join(missing))

probes = [p for p in required if p.startswith("debug/")]
if probes:
    sys.exit("El manifest sigue apuntando al sondaje de diagnóstico:\n  " + "\n  ".join(probes))

print(f"manifest OK  ·  {m['manifest_version']}  ·  {m['name']} {m['version']}  ·  {len(required)} archivos declarados")
PY

if [[ "${1:-}" == "--check" ]]; then
  exit 0
fi

# ── Paquete ────────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
rm -f "$OUT"

# manifest primero, sin entradas de directorio ni atributos extra.
zip -q -X -D "$OUT" manifest.json
zip -q -X -r -D "$OUT" "${INCLUDE[@]}" -x "manifest.json" \
  -x "*/.DS_Store" -x ".DS_Store" -x "*/.git/*"

# Cordillera de seguridad: nada de debug/ ni basura dentro del .xpi.
if unzip -Z1 "$OUT" | grep -E '(^|/)(debug|\.git|\.github|node_modules|dist)(/|$)|\.DS_Store$'; then
  rm -f "$OUT"
  echo "El paquete contenía archivos que no debían entrar; se descartó." >&2
  exit 1
fi

echo
echo "Listo: $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' '))"
echo "Siguiente paso: addons.mozilla.org → Developer Hub → Gatekey → Submit a New Version → sube ese archivo."
echo
unzip -Z1 "$OUT" | sed 's/^/  /'
