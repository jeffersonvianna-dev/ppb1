# PP B1 — Contexto para Claude

Dashboard de inserção de cartões-resposta da Prova Paulista (Bimestre 1/2026), com aba Resumo (por série) + drilldown SEDUC → URE → Escola → Turma. Em uso ativo durante os dias de prova — atualizado várias vezes por dia.

## Stack
- **Frontend:** React 19 + Vite 8 + TypeScript + TanStack React Query
- **Deploy:** Vercel auto-deploy do `main` → https://ppb1.vercel.app
- **Dados:** **bundle estático JSON na CDN do Vercel** (sem `@supabase/supabase-js` em runtime)
- **Supabase:** `aingjvjyqhijogpyikii` / schema `2026_ppb1` (só usado pelo ETL e como fonte do bundle)

## Decisão arquitetural (importante)

**Front lê `/bundle.json` (~15MB JSON, 3MB brotli) — NUNCA chama Supabase no runtime.**
Drilldown e filtros (busca, série) são `Array.filter()` em memória. Resultado: zero queries no Postgres, dashboard escala sem comer cota Supabase no NANO compartilhado com Copa+Guia.

Trade-off aceito: bundle precisa ser regerado e committed quando os dados mudam — automatizado em `scripts/refresh.py`.

## Fluxo de atualização (várias vezes/dia)

```bash
# Detecta automaticamente a versão mais recente de Dia 1 e Dia 2 nos Downloads
export PYTHONIOENCODING=utf-8
export SUPABASE_DB_URL="postgresql://postgres.aingjvjyqhijogpyikii:SENHA@aws-1-us-east-1.pooler.supabase.com:5432/postgres"
D1=$(python -c "import glob,os; print(sorted(glob.glob('C:/Users/jeffe/Downloads/*Dia 1*.xlsx'), key=os.path.getmtime)[-1])")
D2=$(python -c "import glob,os; print(sorted(glob.glob('C:/Users/jeffe/Downloads/*Dia 2*.xlsx'), key=os.path.getmtime)[-1])")
XLSX_DIA1="$D1" XLSX_DIA2="$D2" python scripts/refresh.py
```

`refresh.py` faz: ETL (~75s) → bundle (~10s) → `git commit` + `git push` → Vercel deploy automático.

**Forçar deploy imediato (caso o auto-deploy demore):**
```bash
DEPLOY=$(npx vercel --prod --yes 2>&1 | grep -oE "ppb1-[a-z0-9]+" | head -1)
npx vercel alias set "$DEPLOY-jeffersonvianna-devs-projects.vercel.app" ppb1.vercel.app
```

**Override manual do timestamp do header** (quando quiser exibir hora diferente da do xlsx):
```bash
psql "$SUPABASE_DB_URL" -c "update \"2026_ppb1\".resultados_turmas set atualizacao = '2026-04-14 20:00:00+00';"  # 17h BRT
python scripts/build_bundle.py   # regera bundle
git add public/bundle.json && git commit -m "data: timestamp 17h" && git push
```

## Anomalias dos arquivos-fonte

O sistema-fonte trava em ~100k linhas. Dependendo do dia os xlsx chegam de duas formas:

1. **D1 file misto + D2 file limpo**: "Dia 1 file" tem D1+D2 truncado em 100k; "Dia 2 file" só com D2 completo. ~50k overlap. ETL filtra `dia_prova=1` no Dia1 file → resolve.
2. **D1 e D2 limpos**: cada arquivo só com seu dia, sem overlap (cenário desejado).

ETL é robusto às duas: sempre filtra `dia_prova=1` do Dia1 file e dedupa em `(URE+Escola+Turma+DIA_PROVA)` mantendo a última ocorrência.

## Schema slim `2026_ppb1.resultados_turmas` (10 colunas + 2 generated)

Apenas o essencial — colunas dispensáveis (id_publicacao_*, id_modelo_*, qtd_envios_iptv_*, qtd_gabaritos_*, datas, municipio, nome_prova_*) NÃO são carregadas. `serie` é derivada localmente em pandas antes do COPY.

```
ure, escola, turma          (text NOT NULL)
bimestre, tipo_prova
dia_prova                   (1 ou 2)
serie                       (4EF..9EF / 1EM..3EM, derivada via regex em pandas)
total_alunos_turma          (denominador)
gabaritos_lidos_cmspp       (numerador)
atualizacao                 (timestamptz — exibido no header)

-- generated
escola_id  text  generated always as md5(ure || '|' || escola)
turma_id   text  generated always as md5(ure || '|' || escola || '|' || turma)

-- proteção extra
UNIQUE (turma_id, dia_prova)
```

## Métricas

- `%DiaN = SUM(gabaritos_lidos_cmspp WHERE dia_prova=N) / SUM(total_alunos_turma WHERE dia_prova=N)`
- `total_alunos = SUM(MAX(total_alunos_turma) por turma_id)` — não duplica entre dias

## Snapshot — 14/abr 17h (dia 1 da prova)

163.005 linhas | 81.518 turmas | 4.991 escolas | 91 UREs | total alunos 2.596.540
- D1: 37,41% (em evolução durante o dia)
- D2: 0,08% (começou tarde)

## Estrutura

```
public/bundle.json                # gerado, COMMITTED
scripts/
  import_xlsx.py                  # 2 xlsx → Supabase (psycopg2 COPY + dedup)
  build_bundle.py                 # Supabase → public/bundle.json
  refresh.py                      # ETL + bundle + commit + push
src/
  lib/bundle.ts                   # fetch único, cache: 'default' (revalida ETag)
  lib/helpers.ts                  # fmtInt, fmtPct
  components/
    Header.tsx                    # título + atualização em horário BRT
    FilterSelect.tsx              # combobox c/ busca; prop `compact` (120px)
    SummaryCards.tsx              # 3 cards (total alunos / %D1 / %D2)
    DataTable.tsx                 # tabela genérica + variant resumo
    tableColumns.ts               # COLUMNS por aba
  App.tsx                         # estado, navegação por URL (pushState/popstate)
  main.tsx                        # QueryClient com staleTime: Infinity
supabase/migrations/              # init + add_resumo_and_serie + slim_schema
vercel.json                       # Cache-Control para /bundle.json
```

## RPCs no `public` (security definer)

Mantidas como contrato "online" caso voltemos a consultar Supabase. **Não usadas pelo front atual** (que lê do bundle).
- `ppb1_get_available_filters`, `ppb1_get_summary_cards`, `ppb1_get_resumo_table`,
  `ppb1_get_seduc_table`, `ppb1_get_ure_table`, `ppb1_get_escola_table`, `ppb1_get_last_updated`

## UX/UI

- Tabs: **RESUMO / SEDUC / URE / ESCOLA** (caps, default = SEDUC)
- Resumo: tabela compacta centralizada com linha **TOTAL** azul pinned no fim
- Default sort alfabético em SEDUC/URE/Escola; por `serie_order` no Resumo
- Filtro **Série** aparece só em ESCOLA (compact, 120px, com "Todas")
- **Voltar do browser funcional**: estado serializado em URL (`?view=ure&ure=ADAMANTINA&escola_id=...`)
- Cores % badges: verde ≥80, âmbar ≥50, vermelho <50
- Cache: `staleTime: Infinity` no React Query + `cache: 'default'` no fetch (revalida via ETag a cada 5min, dispensa hard refresh quando dados mudam)

## Pegadinhas conhecidas

- Filenames do sistema-fonte usam `‑` U+2011 (non-breaking hyphen). **Sempre exportar `PYTHONIOENCODING=utf-8`** antes de rodar scripts no Windows.
- MCP Supabase está conectado ao **projeto 2 (SARESP)**, não ao projeto 1. Aplicar migrations no proj 1 via psycopg2 direto (já está no `refresh.py`).
- Schema `"2026_ppb1"` precisa ser quotado em SQL (prefixo numérico).
- `cache: 'force-cache'` no fetch fazia navegador segurar bundle velho — trocado por `'default'` que respeita ETag.

## Variáveis de ambiente

`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas no Vercel mas **não usadas atualmente** (lib supabase removida). Manter por compatibilidade caso voltemos ao modo online.
