"""
Pipeline diário: ETL + bundle + commit + push.

Uso:
    SUPABASE_DB_URL=... \
    XLSX_DIA1=... XLSX_DIA2=... \
    python scripts/refresh.py

Faz:
  0. Sai cedo se os xlsx não mudaram (poupa Disk IO Supabase + bandwidth Vercel).
     Para forçar rerun mesmo sem mudança: FORCE=1 python scripts/refresh.py
  1. python scripts/import_xlsx.py
  2. python scripts/build_bundle.py
  3. git add public/bundle.json + commit + push
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE_FILE = ROOT / ".refresh-state.json"

def file_hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def run(cmd, **kw):
    print(f"\n$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    r = subprocess.run(cmd, cwd=ROOT, **kw)
    if r.returncode != 0:
        sys.exit(r.returncode)
    return r

# 0. Se os xlsx de entrada não mudaram, sai antes de fazer qualquer IO no Supabase
xlsx_d1 = os.environ.get("XLSX_DIA1") or os.environ.get("XLSX_PATH")
xlsx_d2 = os.environ.get("XLSX_DIA2")
state_now = {
    "xlsx_dia1": file_hash(xlsx_d1) if xlsx_d1 and Path(xlsx_d1).exists() else None,
    "xlsx_dia2": file_hash(xlsx_d2) if xlsx_d2 and Path(xlsx_d2).exists() else None,
}
if not os.environ.get("FORCE") and STATE_FILE.exists() and state_now["xlsx_dia1"]:
    try:
        if json.loads(STATE_FILE.read_text()) == state_now:
            print("[skip] xlsx inalterados desde o último refresh — nada a fazer (use FORCE=1 para rodar mesmo assim).")
            sys.exit(0)
    except json.JSONDecodeError:
        pass

# 1. Carrega no Supabase
run([sys.executable, "scripts/import_xlsx.py"])

# 2. Gera bundle estático
run([sys.executable, "scripts/build_bundle.py"])

# 3. Persiste estado dos xlsx para o próximo run
STATE_FILE.write_text(json.dumps(state_now, indent=2))

# 4. Commit + push (dispara deploy automático no Vercel)
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
