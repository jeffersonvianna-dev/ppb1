"""
Pipeline diário: ETL + bundle + commit + push.

Uso:
    SUPABASE_DB_URL=... \
    XLSX_DIA1=... XLSX_DIA2=... \
    python scripts/refresh.py

Faz:
  1. python scripts/import_xlsx.py
  2. python scripts/build_bundle.py
  3. git add public/bundle.json + commit + push
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

def run(cmd, **kw):
    print(f"\n$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    r = subprocess.run(cmd, cwd=ROOT, **kw)
    if r.returncode != 0:
        sys.exit(r.returncode)
    return r

# 1. Carrega no Supabase
run([sys.executable, "scripts/import_xlsx.py"])

# 2. Gera bundle estático
run([sys.executable, "scripts/build_bundle.py"])

# 3. Commit + push (dispara deploy automático no Vercel)
run(["git", "add", "public/bundle.json"])
diff = subprocess.run(["git", "diff", "--cached", "--quiet", "public/bundle.json"], cwd=ROOT)
if diff.returncode == 0:
    print("\n[skip] bundle.json sem mudanças, nada para commitar.")
    sys.exit(0)

import datetime as dt
ts = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
run([
    "git", "-c", "user.email=jefferson.vianna.dev@gmail.com",
    "-c", "user.name=Jefferson Vianna",
    "commit", "-m", f"data: refresh bundle {ts}"
])
run(["git", "push"])
print("\n✓ refresh concluído — Vercel deploy em ~30s, CDN em ≤5min")
