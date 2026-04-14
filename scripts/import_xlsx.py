"""
ETL: lê xlsx da Prova Paulista B1 e carrega em 2026_ppb1.resultados_turmas.

Uso:
    # Requisitos: pip install pandas openpyxl psycopg2-binary
    # Variáveis de ambiente:
    #   SUPABASE_DB_URL   = postgresql://postgres:SENHA@db.aingjvjyqhijogpyikii.supabase.co:5432/postgres
    #   XLSX_PATH         = caminho/para/o.xlsx

    python scripts/import_xlsx.py
"""
import io
import os
import sys
import pandas as pd
import psycopg2

DB_URL = os.environ.get("SUPABASE_DB_URL")
XLSX = os.environ.get("XLSX_PATH") or r"C:\Users\jeffe\Downloads\Dados Completos  Atualizado-2026-04-14 9-04.xlsx"

if not DB_URL:
    print("ERRO: defina SUPABASE_DB_URL (veja .env.example)", file=sys.stderr)
    sys.exit(1)

print(f"[1/5] Lendo xlsx: {XLSX}")
df = pd.read_excel(XLSX, sheet_name="result")
print(f"       {len(df):,} linhas, {len(df.columns)} colunas")

# Fix encoding mojibake (algumas strings vêm como latin-1 dentro de utf-8)
def fix_text(v):
    if isinstance(v, str) and "\ufffd" in v:
        try:
            return v.encode("latin-1", errors="ignore").decode("utf-8", errors="ignore")
        except Exception:
            return v
    return v

print("[2/5] Normalizando colunas e texto")
rename = {
    "URE": "ure", "Municipio": "municipio", "Escola": "escola", "Turma": "turma",
    "Ano_Prova": "ano_prova", "Bimestre": "bimestre", "Tipo_Prova": "tipo_prova",
    "DIA_PROVA": "dia_prova",
    "nome_prova_Roxo": "nome_prova_roxo", "nome_prova_Laranja": "nome_prova_laranja",
    "nome_prova_Verde": "nome_prova_verde", "nome_prova_Amarela": "nome_prova_amarela",
    "ID_PUBLICACAO_Roxo": "id_publicacao_roxo", "ID_PUBLICACAO_Laranja": "id_publicacao_laranja",
    "ID_PUBLICACAO_Verde": "id_publicacao_verde", "ID_PUBLICACAO_Amarela": "id_publicacao_amarela",
    "ID_MODELO_Roxo": "id_modelo_roxo", "ID_MODELO_Laranja": "id_modelo_laranja",
    "ID_MODELO_Verde": "id_modelo_verde", "ID_MODELO_Amarela": "id_modelo_amarela",
    "qtd_envios_iptv_Roxo": "qtd_envios_iptv_roxo", "qtd_envios_iptv_Laranja": "qtd_envios_iptv_laranja",
    "qtd_envios_iptv_Verde": "qtd_envios_iptv_verde", "qtd_envios_iptv_Amarela": "qtd_envios_iptv_amarela",
    "qtd_gabaritos_Roxo": "qtd_gabaritos_roxo", "qtd_gabaritos_Laranja": "qtd_gabaritos_laranja",
    "qtd_gabaritos_Verde": "qtd_gabaritos_verde", "qtd_gabaritos_Amarela": "qtd_gabaritos_amarela",
    "Data_Vigencia_Publicacao": "data_vigencia_publicacao",
    "Data_Inicio_Agendamento": "data_inicio_agendamento",
    "Data_Fim_Agendamento": "data_fim_agendamento",
    "Total_Alunos_Turma": "total_alunos_turma",
    "gabaritos_lidos_cmspp": "gabaritos_lidos_cmspp",
    "total_gabaritos_enviados_iptv": "total_gabaritos_enviados_iptv",
    "perc_gabaritos_lidos": "perc_gabaritos_lidos",
    "Atualizacao": "atualizacao",
}
df = df.rename(columns=rename)

# Apply encoding fix to text columns
for col in ["ure", "municipio", "escola", "turma", "tipo_prova",
            "nome_prova_roxo", "nome_prova_laranja", "nome_prova_verde", "nome_prova_amarela"]:
    if col in df.columns:
        df[col] = df[col].map(fix_text)

COLS = [
    "ure","municipio","escola","turma","ano_prova","bimestre","tipo_prova","dia_prova",
    "nome_prova_roxo","nome_prova_laranja","nome_prova_verde","nome_prova_amarela",
    "id_publicacao_roxo","id_publicacao_laranja","id_publicacao_verde","id_publicacao_amarela",
    "id_modelo_roxo","id_modelo_laranja","id_modelo_verde","id_modelo_amarela",
    "qtd_envios_iptv_roxo","qtd_envios_iptv_laranja","qtd_envios_iptv_verde","qtd_envios_iptv_amarela",
    "qtd_gabaritos_roxo","qtd_gabaritos_laranja","qtd_gabaritos_verde","qtd_gabaritos_amarela",
    "data_vigencia_publicacao","data_inicio_agendamento","data_fim_agendamento",
    "total_alunos_turma","gabaritos_lidos_cmspp","total_gabaritos_enviados_iptv",
    "perc_gabaritos_lidos","atualizacao",
]
df = df[[c for c in COLS if c in df.columns]]

# Cast numeric columns to nullable Int64 so NaN doesn't force float (e.g. "2026.0")
INT_COLS = [
    "ano_prova","bimestre","dia_prova",
    "id_publicacao_roxo","id_publicacao_laranja","id_publicacao_verde","id_publicacao_amarela",
    "id_modelo_roxo","id_modelo_laranja","id_modelo_verde","id_modelo_amarela",
    "qtd_envios_iptv_roxo","qtd_envios_iptv_laranja","qtd_envios_iptv_verde","qtd_envios_iptv_amarela",
    "qtd_gabaritos_roxo","qtd_gabaritos_laranja","qtd_gabaritos_verde","qtd_gabaritos_amarela",
    "total_alunos_turma","gabaritos_lidos_cmspp","total_gabaritos_enviados_iptv","perc_gabaritos_lidos",
]
for col in INT_COLS:
    if col in df.columns:
        df[col] = df[col].astype("Int64")

print("[3/5] Gerando CSV em memória")
buf = io.StringIO()
df.to_csv(buf, index=False, na_rep="", sep="\t")
buf.seek(0)

print("[4/5] Conectando e fazendo TRUNCATE")
conn = psycopg2.connect(DB_URL)
conn.autocommit = False
try:
    with conn.cursor() as cur:
        cur.execute('TRUNCATE TABLE "2026_ppb1"."resultados_turmas"')
        cols_sql = ",".join(df.columns)
        copy_sql = f'COPY "2026_ppb1"."resultados_turmas" ({cols_sql}) FROM STDIN WITH (FORMAT CSV, HEADER TRUE, DELIMITER E\'\\t\', NULL \'\')'
        print("[5/5] Executando COPY FROM STDIN")
        cur.copy_expert(copy_sql, buf)
        # populate serie from nome_prova (NEF/NEM based on "ano"/"série")
        cur.execute(r"""
            UPDATE "2026_ppb1".resultados_turmas t
            SET serie = CASE
              WHEN np IS NULL THEN NULL
              WHEN np ILIKE '%ano%' THEN substring(np from '^(\d+)') || 'EF'
              ELSE substring(np from '^(\d+)') || 'EM'
            END
            FROM (SELECT id, coalesce(nome_prova_roxo, nome_prova_laranja,
                                      nome_prova_verde, nome_prova_amarela) AS np
                  FROM "2026_ppb1".resultados_turmas) x
            WHERE t.id = x.id
        """)
    conn.commit()
    print("OK — commit feito")
except Exception:
    conn.rollback()
    raise
finally:
    conn.close()

# Sanity check
conn = psycopg2.connect(DB_URL)
with conn.cursor() as cur:
    cur.execute('SELECT COUNT(*) FROM "2026_ppb1"."resultados_turmas"')
    (n,) = cur.fetchone()
    print(f"Linhas na tabela: {n:,}")
conn.close()
