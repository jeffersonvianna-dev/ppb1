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

## Fluxo de atualização de dados (várias vezes/dia)

**Comando único:**
```bash
SUPABASE_DB_URL="postgresql://postgres.aingjvjyqhijogpyikii:SENHA@aws-1-us-east-1.pooler.supabase.com:5432/postgres" \
XLSX_DIA1="C:/Users/jeffe/Downloads/Dados Completos  Dia 1-...xlsx" \
XLSX_DIA2="C:/Users/jeffe/Downloads/Dados Completos  Dia 2-...xlsx" \
python scripts/refresh.py
```

`refresh.py` faz:
1. `import_xlsx.py` — lê os 2 xlsx, filtra `dia_prova=1` no Dia1 file (que pode vir misto), usa todo o Dia2 file, deriva `serie` em pandas, dedup em (URE+Escola+Turma+DIA_PROVA), `TRUNCATE` + `COPY` no Supabase
2. `build_bundle.py` — pré-agrega tudo em `public/bundle.json`
3. `git commit` + `git push` → Vercel deploy automático (~30s) → CDN propaga em ≤5min

**Observação importante** sobre os arquivos do Sistema X:
- "Dia 1" file vem com 100k linhas truncadas, **mistura D1 + D2** (export quebrado quando volume excede limite). Filtramos para `DIA_PROVA=1`.
- "Dia 2" file vem só com `DIA_PROVA=2`, completo.
- Sem essa filtragem teria ~50k duplicatas.

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

## Schema slim `2026_ppb1.resultados_turmas` (10 colunas)

Apenas o essencial — colunas dispensáveis (id_publicacao_*, id_modelo_*, qtd_envios_iptv_*, qtd_gabaritos_*, datas, municipio, nome_prova_*, etc.) NÃO são carregadas. `serie` é derivada localmente em pandas antes do COPY.

- `ure`, `escola`, `turma` (text, NOT NULL)
- `bimestre`, `tipo_prova`, `dia_prova` (1 ou 2)
- `serie` (text — `4EF`..`9EF`/`1EM`..`3EM`; derivada via `^(\d+)` + `ano`→`EF` / `série`→`EM` em pandas)
- `total_alunos_turma` (denominador), `gabaritos_lidos_cmspp` (numerador)
- `atualizacao` (timestamptz — exibido no header)
- **Generated:** `escola_id = md5(ure|escola)`, `turma_id = md5(ure|escola|turma)`
- **Constraint:** `UNIQUE (turma_id, dia_prova)` — proteção extra contra dups

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
