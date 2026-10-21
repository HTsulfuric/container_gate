#!/usr/bin/env python3
"""
Gatekey - debug/read-perf-log.py   ⏱ TEMPORAL

Lee el log que dejó debug/probe-background.js en storage.local de la extensión
(IndexedDB -> sqlite) y lo imprime como tabla. No escribe nada en el perfil.

Uso:
    python3 debug/read-perf-log.py            # perfil por defecto
    python3 debug/read-perf-log.py --profile /path/al/perfil
    python3 debug/read-perf-log.py --json     # volcado completo
"""

import argparse
import glob
import json
import os
import shutil
import sqlite3
import sys
import tempfile

MARKER = b"a_request_to_redirect_ms"


def default_profile():
    home = os.path.expanduser("~")
    base = os.path.join(home, "Library", "Application Support", "Firefox", "Profiles")
    if not os.path.isdir(base):  # Linux / Windows
        base = os.path.join(home, ".mozilla", "firefox")
    cands = [
        os.path.dirname(os.path.dirname(d))
        for d in glob.glob(os.path.join(base, "*", "storage", "default"))
        if os.path.isdir(d) and len(os.listdir(d)) > 50
    ]
    if not cands:
        sys.exit("No se encontró un perfil de Firefox con storage/default")
    return max(cands, key=os.path.getmtime)


def open_ro(db):
    """Abre la bd en modo lectura tolerando que Firefox la tenga abierta."""
    tmp = tempfile.mkdtemp(prefix="cgperf.")
    for suffix in ("", "-wal", "-shm"):
        if os.path.exists(db + suffix):
            shutil.copy2(db + suffix, os.path.join(tmp, os.path.basename(db) + suffix))
    copied = os.path.join(tmp, os.path.basename(db))
    try:
        return sqlite3.connect(f"file:{copied}?mode=ro", uri=True), tmp
    except sqlite3.Error:
        return sqlite3.connect(f"file:{copied}?mode=ro&immutable=1", uri=True), tmp


def extract(path):
    try:
        con, tmp = open_ro(path)
    except sqlite3.Error:
        return None
    try:
        cur = con.cursor()
        try:
            rows = cur.execute("select data from object_data").fetchall()
        except sqlite3.Error:
            return None
    finally:
        con.close()
    for (blob,) in rows:
        if not blob or MARKER not in bytes(blob):
            continue
        txt = bytes(blob).decode("utf-8", "ignore")
        start = txt.find("[{")
        end = txt.rfind("}]")
        if start == -1 or end == -1:
            continue
        try:
            data = json.loads(txt[start : end + 2])
        except json.JSONDecodeError:
            continue
        if isinstance(data, list) and data and MARKER.decode() in data[-1]:
            return data
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    profile = args.profile or default_profile()
    dbs = sorted(
        glob.glob(os.path.join(profile, "storage", "default", "moz-extension+++*", "idb", "*.sqlite")),
        key=lambda p: os.path.getmtime(p),
        reverse=True,
    )
    if not dbs:
        sys.exit(f"No hay IDB de extensiones en {profile}")

    for db in dbs:
        data = extract(db)
        if not data:
            continue
        print(f"# origen: {os.path.basename(os.path.dirname(os.path.dirname(db)))}")
        print(f"# entradas: {len(data)}\n")
        if args.json:
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return
        head = ("url", "A req->red", "B red->page", "C query()", "C storage.get()",
                "C cgOrdered", "C cards", "cards#")
        print("{:<38} {:>11} {:>12} {:>10} {:>15} {:>11} {:>8} {:>6}".format(*head))
        for r in data[-12:]:
            p = r.get("page") or {}
            url = (r.get("url") or "")[:37]
            print(
                "{:<38} {:>11} {:>12} {:>10} {:>15} {:>11} {:>8} {:>6}".format(
                    url,
                    r.get("a_request_to_redirect_ms"),
                    r.get("b_redirect_to_page_ms"),
                    p.get("qid_init_ms"),
                    p.get("storage_get_init_ms"),
                    p.get("cgGetOrderedContainers_init_ms"),
                    p.get("first_card_ms"),
                    p.get("cards_rendered"),
                )
            )
        print("\n# rondas de control (¿coste único o lentidad continua?)")
        for r in data[-4:]:
            p = r.get("page") or {}
            keys = [k for k in p if k.startswith(("r1_", "r2_"))]
            print(f"  {(r.get('url') or '')[:60]}")
            for k in sorted(keys):
                print(f"     {k:<32} {p[k]}")
            print(f"     {'doc/nav/paint':<32} {p.get('nav_responseEnd_ms')} / {p.get('nav_domContentLoaded_ms')} / {p.get('paint_first-contentful-paint')}")
        return

    print("No se encontró cg_perf_log todavía:")
    print("  1) desactiva Gatekey en about:addons")
    print("  2) about:debugging#/runtime/this-firefox -> Cargar complemento temporal -> manifest.json")
    print("  3) abre 3 enlaces desde fuera de Firefox y vuelve a ejecutar este script")


if __name__ == "__main__":
    main()
