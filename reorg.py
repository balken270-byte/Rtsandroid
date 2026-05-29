#!/usr/bin/env python3
# Gorselleri birime gore alt klasorlere ayirir + index_split.html yollarini gunceller.
# Tek seferlik calistir: python3 reorg.py
import os, re, shutil

IMG = "assets/images"

# birim -> hangi dosyalar (uzantisiz on-ek mantigi)
GROUPS = {
    "tank":     ["hull", "turret"],
    "enemy":    ["ehull", "eturret"],
    "aircraft": ["heli", "ch47", "ch47_rotor", "rotor"],
    "building": ["factory", "ground"],
    # soldier: sld_ ile baslayan her sey
}

def target_folder(fname):
    base = fname[:-4] if fname.endswith(".png") else fname
    if base.startswith("sld_"):
        return "soldier"
    for folder, names in GROUPS.items():
        if base in names:
            return folder
    return None  # eslesmeyeni elleme

# 1) fazla assets/factory.png varsa sil (yanlis yere yuklenmisti)
stray = "assets/factory.png"
if os.path.exists(stray):
    os.remove(stray)
    print("silindi:", stray)

# 2) gorselleri tasi + yeni yollari biriktir
moves = {}  # eski_yol -> yeni_yol
for fname in os.listdir(IMG):
    if not fname.endswith(".png"):
        continue
    folder = target_folder(fname)
    if folder is None:
        print("ATLANDI (eslesmedi):", fname)
        continue
    dest_dir = os.path.join(IMG, folder)
    os.makedirs(dest_dir, exist_ok=True)
    old = f"{IMG}/{fname}"
    new = f"{IMG}/{folder}/{fname}"
    shutil.move(old, os.path.join(dest_dir, fname))
    moves[old] = new

# 3) index_split.html icindeki yollari guncelle
html = "index_split.html"
with open(html, "r", encoding="utf-8") as f:
    code = f.read()

for old, new in moves.items():
    code = code.replace(old, new)

# build numarasini artir
code = re.sub(r"<b>build (\d+)</b>",
              lambda m: f"<b>build {int(m.group(1))+1}</b>", code)

with open(html, "w", encoding="utf-8") as f:
    f.write(code)

print(f"\nBITTI. {len(moves)} gorsel tasindi, yollar guncellendi, build artirildi.")
for folder in sorted(set(GROUPS.keys()) | {"soldier"}):
    p = os.path.join(IMG, folder)
    if os.path.isdir(p):
        print(f"  {folder}/: {len(os.listdir(p))} dosya")
