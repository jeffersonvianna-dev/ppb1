"""
Gera public/bundle.json com todas as agregações.
Depois de rodar, faça commit + deploy para a CDN do Vercel servir.

Uso:
    SUPABASE_DB_URL=postgresql://... python scripts/build_bundle.py
"""
import json
import os
import sys
import time
from pathlib import Path
import psycopg2

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

DB_URL = os.environ.get("SUPABASE_DB_URL")
if not DB_URL:
    print("ERRO: defina SUPABASE_DB_URL", file=sys.stderr)
    sys.exit(1)

OUT = Path(__file__).resolve().parent.parent / "public" / "bundle.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

BIMESTRE = 1
TIPO = "PROVA_PAULISTA_IMPRESSA"

t0 = time.time()
conn = psycopg2.connect(DB_URL)
conn.autocommit = True
cur = conn.cursor()

def fetch_dicts(sql):
    cur.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]

# Agregação base por turma (reusada)
cur.execute("""
  create temporary table tmp_por_turma as
  select
    ure, escola_id, max(escola) as escola,
    turma_id, max(turma) as turma, max(serie) as serie,
    max(coalesce(total_alunos_turma,0)) as alunos_turma,
    sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=1) as lidos_d1,
    sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=2) as lidos_d2,
    sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=1) as alunos_d1,
    sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=2) as alunos_d2
  from "2026_ppb1".resultados_turmas
  where bimestre = %s and tipo_prova = %s and turma_id is not null
  group by ure, escola_id, turma_id
""", (BIMESTRE, TIPO))

# Atualizado
cur.execute('select max(atualizacao) from "2026_ppb1".resultados_turmas')
atualizacao = cur.fetchone()[0]
atualizacao_iso = atualizacao.isoformat() if atualizacao else None

# Summary
cur.execute("""
  select sum(alunos_turma)::bigint as total_alunos,
         sum(lidos_d1)::bigint as total_lidos_dia1,
         sum(lidos_d2)::bigint as total_lidos_dia2,
         case when sum(alunos_d1)>0 then round(100.0*sum(lidos_d1)/sum(alunos_d1),2) else 0 end as perc_dia1,
         case when sum(alunos_d2)>0 then round(100.0*sum(lidos_d2)/sum(alunos_d2),2) else 0 end as perc_dia2
  from tmp_por_turma
""")
cols = [d[0] for d in cur.description]
summary = dict(zip(cols, cur.fetchone()))

# Resumo por série
resumo = fetch_dicts("""
  select serie,
    case serie when '4EF' then 1 when '5EF' then 2 when '6EF' then 3
               when '7EF' then 4 when '8EF' then 5 when '9EF' then 6
               when '1EM' then 7 when '2EM' then 8 when '3EM' then 9 else 99 end as serie_order,
    sum(alunos_turma)::bigint as total_alunos,
    case when sum(alunos_d1)>0 then round(100.0*sum(lidos_d1)/sum(alunos_d1),2) else 0 end as perc_dia1,
    case when sum(alunos_d2)>0 then round(100.0*sum(lidos_d2)/sum(alunos_d2),2) else 0 end as perc_dia2
  from tmp_por_turma where serie is not null
  group by serie order by serie_order
""")

# SEDUC (por URE)
seduc = fetch_dicts("""
  select ure,
    count(distinct escola_id)::bigint as total_escolas,
    count(distinct turma_id)::bigint as total_turmas,
    sum(alunos_turma)::bigint as total_alunos,
    case when sum(alunos_d1)>0 then round(100.0*sum(lidos_d1)/sum(alunos_d1),2) else 0 end as perc_dia1,
    case when sum(alunos_d2)>0 then round(100.0*sum(lidos_d2)/sum(alunos_d2),2) else 0 end as perc_dia2
  from tmp_por_turma where ure is not null
  group by ure order by ure
""")

# Escolas (por URE × escola)
escolas = fetch_dicts("""
  select ure, escola_id, max(escola) as escola,
    count(distinct turma_id)::bigint as total_turmas,
    sum(alunos_turma)::bigint as total_alunos,
    case when sum(alunos_d1)>0 then round(100.0*sum(lidos_d1)/sum(alunos_d1),2) else 0 end as perc_dia1,
    case when sum(alunos_d2)>0 then round(100.0*sum(lidos_d2)/sum(alunos_d2),2) else 0 end as perc_dia2
  from tmp_por_turma
  group by ure, escola_id order by max(escola)
""")

# Turmas (por escola × turma) — já agregado acima, só projetar colunas mínimas
cur.execute("""
  select escola_id, turma_id, turma, serie, alunos_turma::bigint as total_alunos,
    case when alunos_d1>0 then round(100.0*lidos_d1/alunos_d1,2) else 0 end as perc_dia1,
    case when alunos_d2>0 then round(100.0*lidos_d2/alunos_d2,2) else 0 end as perc_dia2
  from tmp_por_turma
  order by turma
""")
cols = [d[0] for d in cur.description]
turmas = [dict(zip(cols, r)) for r in cur.fetchall()]

conn.close()

# Normaliza Decimal/int
def j(v):
    if v is None: return None
    if hasattr(v, 'quantize'): return float(v)
    if isinstance(v, int): return v
    return v

def clean(d):
    if isinstance(d, dict): return {k: clean(v) for k, v in d.items()}
    if isinstance(d, list): return [clean(x) for x in d]
    return j(d)

bundle = clean({
    "atualizacao": atualizacao_iso,
    "summary": summary,
    "resumo": resumo,
    "seduc": seduc,
    "escolas": escolas,
    "turmas": turmas,
})

OUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
size_mb = OUT.stat().st_size / 1024 / 1024
print(f"OK — {OUT} ({size_mb:.2f} MB, {len(turmas)} turmas, {len(escolas)} escolas, {len(seduc)} UREs) em {time.time()-t0:.1f}s")
