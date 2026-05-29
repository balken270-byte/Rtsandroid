#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RTS oyunu asset ayirici.
KULLANIM (GitHub Codespaces terminalinde):
    python3 split.py index.html

Ne yapar:
  - index.html icindeki tum  const XXX="data:image/png;base64,...."  satirlarini bulur
  - Her birini assets/images/ veya assets/sounds/ klasorune AYRI dosya olarak yazar
  - HTML'i, bu dosyalari disaridan yukleyecek sekilde gunceller (index_split.html)
  - Boylece artik base64 yok, her asset kendi dosyasinda
"""
import sys, os, base64, re

# ---- girdi dosyasi ----
if len(sys.argv) < 2:
    src = "index.html"
else:
    src = sys.argv[1]

if not os.path.exists(src):
    print(f"HATA: {src} bulunamadi. Dogru klasorde misin?")
    sys.exit(1)

html = open(src, encoding="utf-8").read()

# ---- klasorler ----
os.makedirs("assets/images", exist_ok=True)
os.makedirs("assets/sounds", exist_ok=True)

# ---- uzanti haritasi ----
ext_map = {
    "image/png":  ("images", "png"),
    "image/jpeg": ("images", "jpg"),
    "image/webp": ("images", "webp"),
    "audio/mpeg": ("sounds", "mp3"),
    "audio/wav":  ("sounds", "wav"),
    "audio/ogg":  ("sounds", "ogg"),
}

# ---- her  const NAME="data:TYPE;base64,DATA";  satirini yakala ----
pattern = re.compile(
    r'const\s+([A-Z_0-9]+)\s*=\s*"data:([a-z]+/[a-z]+);base64,([^"]+)";'
)

manifest = []   # (degisken_adi, dosya_yolu, tip)
count = 0

def repl(m):
    global count
    name, mime, data = m.group(1), m.group(2), m.group(3)
    if mime not in ext_map:
        return m.group(0)  # taninmayan tipe dokunma
    folder, ext = ext_map[mime]
    fname = name.lower() + "." + ext
    path = f"assets/{folder}/{fname}"
    # base64'u coz ve dosyaya yaz
    with open(path, "wb") as f:
        f.write(base64.b64decode(data))
    manifest.append((name, path, mime))
    count += 1
    # HTML icinde sadece dosya yolunu birak (kod bunu okuyacak)
    return f'const {name}="{path}";'

new_html = pattern.sub(repl, html)

# ---- ciktiyi yaz ----
out = "index_split.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(new_html)

# ---- manifest (ne nereye gitti) ----
with open("assets/manifest.txt", "w", encoding="utf-8") as f:
    for name, path, mime in manifest:
        f.write(f"{name}\t{path}\t{mime}\n")

print(f"BITTI. {count} asset ayrildi.")
print(f"  - Gorseller: assets/images/")
print(f"  - Sesler:    assets/sounds/")
print(f"  - Yeni HTML: {out}")
print(f"  - Liste:     assets/manifest.txt")
print()
print("NOT: const XXX=\"assets/...\" artik dosya yolu tutuyor.")
print("Kod bu yollari <img src> / Audio() ile yukleyecek sekilde guncellenmelidir.")
