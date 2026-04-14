# PP B1 — Contexto para Claude

Dashboard de inserção de cartões-resposta da Prova Paulista (Bimestre 1/2026) por URE / Escola / Turma + aba Resumo por série.

## Stack
- **Frontend:** React 19.2.4 + Vite 8 + TypeScript + TanStack React Query
- **Deploy:** Vercel auto-deploy do `main` → https://ppb1.vercel.app
- **Dados:** **bundle estático JSON na CDN do Vercel** (sem `@supabase/supabase-js` em runtime)
- **Supabase:** `aingjvjyqhijogpyikii` / schema `2026_ppb1` (só usado pelo ETL e como fonte do bundle)

## Decisão arquitetural (importante)

**Front lê `/bundle.json` (≈12MB JSON, 2.4MB brotli) — NUNCA chama Supabase no runtime.**
Drilldown SEDUC → URE → Escola e filtros (busca, série) são `Array.filter()` em memória. Resultado: zero queries no Postgres, dashboard escala sem comer cota Supabase no NANO compartilhado com Copa/Guia.

Trade-off aceito: bundle precisa ser regerado e committed quando os dados mudam.

## Fluxo de atualização de dados

```bash
# 1) carrega xlsx no Supabase
SUPABASE_DB_URL="postgresql://postgres.aingjvjyqhijogpyikii:SENHA@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
XLSX_PATH="C:/Users/jeffe/Downloads/Dados Completos ....xlsx" \
python scripts/import_xlsx.py

# 2) gera bundle pré-agregado
SUPABASE_DB_URL="..." python scripts/build_bundle.py

# 3) commit + push (Vercel deploy automático em ~30s)
git add public/bundle.json
git commit -m "data: update bundle"
git push
```

CDN repropaga em ≤5min (`Cache-Control: max-age=300, s-maxage=300, stale-while-revalidate=3600` em `vercel.json`).

## Estrutura

```
public/bundle.json                # gerado, COMMITTED
scripts/
  import_xlsx.py                  # xlsx → Supabase (psycopg2 COPY + UPDATE serie)
  build_bundle.py                 # Supabase → public/bundle.json
src/
  lib/bundle.ts                   # fetch único, cache: 'force-cache'
  lib/helpers.ts                  # fmtInt, fmtPct
  components/
    Header.tsx                    # título + atualização em horário BRT
    FilterSelect.tsx              # combobox c/ busca; prop `compact` (120px)
    SummaryCards.tsx              # 3 cards (total alunos / %D1 / %D2)
    DataTable.tsx                 # tabela genérica + variant resumo
    tableColumns.ts               # COLUMNS por aba
  App.tsx                         # estado, navegação por URL (pushState/popstate)
  main.tsx                        # QueryClient com staleTime: Infinity
supabase/migrations/
  20260414000000_init_ppb1.sql
  20260414010000_add_resumo_and_serie.sql
vercel.json                       # Cache-Control para /bundle.json
```

## Schema `2026_ppb1.resultados_turmas`

Colunas relevantes:
- `ure`, `municipio`, `escola`, `turma`
- `bimestre`, `tipo_prova`, `dia_prova` (1 ou 2 — coluna L do xlsx)
- `total_alunos_turma` (denominador), `gabaritos_lidos_cmspp` (numerador)
- `serie` (text, derivada do `nome_prova_*` via regex `^(\d+)` + `ano`→`EF` / `série`→`EM`)
- `escola_id` = `md5(ure|escola)` (generated, evita colisão)
- `turma_id` = `md5(ure|escola|turma)` (generated)
- `atualizacao` (timestamptz — exibido no header)

## Métricas

- **% Dia 1** = `SUM(gabaritos_lidos_cmspp WHERE dia_prova=1) / SUM(total_alunos_turma WHERE dia_prova=1)`
- **% Dia 2** = idem para dia 2
- **Total de alunos (sem duplicar):** `SUM(MAX(total_alunos_turma) por turma_id)`

## RPCs no `public` (security definer)

Mantidas como contrato "online" caso voltemos a consultar Supabase. **Não usadas pelo front atual.**
- `ppb1_get_available_filters`
- `ppb1_get_summary_cards(p_bimestre, p_tipo_prova)`
- `ppb1_get_resumo_table(p_bimestre, p_tipo_prova)`
- `ppb1_get_seduc_table(p_bimestre, p_tipo_prova)`
- `ppb1_get_ure_table(p_bimestre, p_tipo_prova, p_ure)`
- `ppb1_get_escola_table(p_bimestre, p_tipo_prova, p_escola_id)`
- `ppb1_get_last_updated()`

## UX/UI

- Tabs: **RESUMO / SEDUC / URE / ESCOLA** (caps, default = SEDUC)
- Resumo: tabela compacta centralizada com linha **TOTAL** azul pinned no fim
- Default sort alfabético por nome em SEDUC/URE/Escola; por `serie_order` no Resumo
- Filtro **Série** aparece só em ESCOLA (compact, 120px, com "Todas")
- **Voltar do browser funcional**: estado serializado em URL (`?view=ure&ure=ADAMANTINA&escola_id=...`) via `pushState`
- Cores % badges: verde ≥80, âmbar ≥50, vermelho <50
- Cache React Query: `staleTime: Infinity` — bundle só baixa 1× por sessão

## Variáveis de ambiente

`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas no Vercel mas **não usadas atualmente** (lib supabase removida). Manter por compatibilidade caso voltemos ao modo online.
