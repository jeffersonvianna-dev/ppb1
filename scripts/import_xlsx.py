"""
ETL: carrega 1 ou 2 xlsx da Prova Paulista B1 em "2026_ppb1".resultados_turmas.

- Mantém apenas as colunas que o dashboard usa
- Deriva `serie` localmente (regex em pandas)
- Valida que não há duplicatas em (URE, Escola, Turma, DIA_PROVA) antes de subir
- COPY FROM STDIN (psycopg2) para velocidade
- Idempotente: TRUNCATE antes de carregar

Uso típico (2 arquivos: D1 + D2):
    SUPABASE_DB_URL=... \
    XLSX_DIA1="C:/.../Dados Completos  Dia 1-...xlsx" \
    XLSX_DIA2="C:/.../Dados Completos  Dia 2-...xlsx" \
    python scripts/import_xlsx.py

Comportamento dos arquivos (validado em 14/abr):
- "Dia 1" file pode conter linhas dos 2 dias — filtramos para DIA_PROVA=1
- "Dia 2" file: já vem só com DIA_PROVA=2 — usado integralmente
"""
import io
import os
import re
import sys
import time
import pandas as pd
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
F1 = os.environ.get("XLSX_DIA1") or os.environ.get("XLSX_PATH")
F2 = os.environ.get("XLSX_DIA2")
if not DB_URL:
    print("ERRO: defina SUPABASE_DB_URL", file=sys.stderr); sys.exit(1)
if not F1:
    print("ERRO: defina XLSX_DIA1 (ou XLSX_PATH)", file=sys.stderr); sys.exit(1)

# Mapeamento xlsx → snake_case (apenas o que precisamos)
RENAME = {
    "URE": "ure", "Escola": "escola", "Turma": "turma",
    "Bimestre": "bimestre", "Tipo_Prova": "tipo_prova", "DIA_PROVA": "dia_prova",
    "Total_Alunos_Turma": "total_alunos_turma",
    "gabaritos_lidos_cmspp": "gabaritos_lidos_cmspp",
    "Atualizacao": "atualizacao",
    # nome_prova_* só para derivar serie — não vai pro banco
    "nome_prova_Roxo": "_np_roxo", "nome_prova_Laranja": "_np_laranja",
    "nome_prova_Verde": "_np_verde", "nome_prova_Amarela": "_np_amarela",
}

DB_COLS = ["ure","escola","turma","bimestre","tipo_prova","dia_prova",
           "serie","total_alunos_turma","gabaritos_lidos_cmspp","atualizacao"]

INT_COLS = ["bimestre","dia_prova","total_alunos_turma","gabaritos_lidos_cmspp"]

SERIE_RE = re.compile(r'^\s*(\d+)')
def derive_serie(np_text):
    if not isinstance(np_text, str) or not np_text:
        return None
    m = SERIE_RE.match(np_text)
    if not m:
        return None
    n = m.group(1)
    return f"{n}EF" if "ano" in np_text.lower() else f"{n}EM"

def load(path, label, expect_dia=None):
    print(f"[ler] {label}: {path}")
    df = pd.read_excel(path, sheet_name=0)
    print(f"       {len(df):,} linhas brutas")
    keep = [c for c in RENAME if c in df.columns]
    df = df[keep].rename(columns=RENAME)
    if expect_dia is not None:
        before = len(df)
        df = df[df["dia_prova"] == expect_dia]
        if len(df) != before:
            print(f"       filtro dia_prova={expect_dia}: {before:,} -> {len(df):,}")
    return df

t0 = time.time()
parts = [load(F1, "DIA1 file", expect_dia=1)]
if F2:
    parts.append(load(F2, "DIA2 file", expect_dia=2))
df = pd.concat(parts, ignore_index=True)
print(f"\n[concat] total: {len(df):,} linhas")

# Deriva serie a partir do primeiro nome_prova não-nulo
np_cols = [c for c in ["_np_roxo","_np_laranja","_np_verde","_np_amarela"] if c in df.columns]
df["_nome_prova"] = df[np_cols].bfill(axis=1).iloc[:, 0] if np_cols else None
df["serie"] = df["_nome_prova"].map(derive_serie)
print("[serie]", df["serie"].value_counts(dropna=False).to_dict())

# Cast para Int64 (suporta NaN sem virar float)
for c in INT_COLS:
    if c in df.columns:
        df[c] = df[c].astype("Int64")

# Drop linhas sem chave essencial
need = ["ure","escola","turma","dia_prova"]
before = len(df)
df = df.dropna(subset=need)
if before != len(df):
    print(f"[clean] removidas {before-len(df):,} linhas com chave nula")

# Valida duplicatas em (ure,escola,turma,dia_prova)
key = ["ure","escola","turma","dia_prova"]
dups = df.duplicated(subset=key, keep=False)
n_dups = int(dups.sum())
if n_dups > 0:
    print(f"[ALERTA] {n_dups:,} linhas duplicadas em (URE+Escola+Turma+DIA_PROVA)")
    print(df[dups].sort_values(key).head(10).to_string())
    # Mantém última ocorrência (assume que a posterior é mais atualizada)
    df = df.drop_duplicates(subset=key, keep="last")
    print(f"[ALERTA] após drop_duplicates: {len(df):,} linhas")

# Projeta apenas colunas do banco
df = df[[c for c in DB_COLS if c in df.columns]]
print(f"\n[final] {len(df):,} linhas × {len(df.columns)} colunas: {list(df.columns)}")

# Gera CSV em memória para COPY
buf = io.StringIO()
df.to_csv(buf, index=False, na_rep="", sep="\t")
buf.seek(0)

print("\n[db] conectando, TRUNCATE + COPY")
conn = psycopg2.connect(DB_URL); conn.autocommit = False
try:
    with conn.cursor() as cur:
        cur.execute('TRUNCATE TABLE "2026_ppb1".resultados_turmas')
        cols_sql = ",".join(df.columns)
        copy_sql = f'COPY "2026_ppb1".resultados_turmas ({cols_sql}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, DELIMITER E\'\\t\', NULL \'\')'
        cur.copy_expert(copy_sql, buf)
    conn.commit()
finally:
    conn.close()

# Sanity check
conn = psycopg2.connect(DB_URL)
with conn.cursor() as cur:
    cur.execute('SELECT COUNT(*), COUNT(DISTINCT turma_id), COUNT(DISTINCT escola_id), COUNT(DISTINCT ure) FROM "2026_ppb1".resultados_turmas')
    n, t, e, u = cur.fetchone()
    print(f"\nOK — {n:,} linhas | {t:,} turmas | {e:,} escolas | {u} UREs (em {time.time()-t0:.1f}s)")
conn.close()
