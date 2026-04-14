-- Adiciona suporte à visão RESUMO (por série) e coluna `serie` derivada do nome_prova.
-- Pré-requisito: migration inicial já aplicada.

create index if not exists idx_ppb1_serie on "2026_ppb1"."resultados_turmas" (serie);

-- Backfill inicial (o ETL também faz isso pós-carga)
update "2026_ppb1".resultados_turmas t
set serie = case
  when np is null then null
  when np ilike '%ano%' then substring(np from '^(\d+)') || 'EF'
  else substring(np from '^(\d+)') || 'EM'
end
from (select id, coalesce(nome_prova_roxo, nome_prova_laranja,
                          nome_prova_verde, nome_prova_amarela) as np
      from "2026_ppb1".resultados_turmas) x
where t.id = x.id;

-- Nova RPC para a aba RESUMO (por série, ordem EF → EM)
drop function if exists public.ppb1_get_resumo_table(int,text);
create or replace function public.ppb1_get_resumo_table(p_bimestre int, p_tipo_prova text)
returns table (
  serie text, serie_order int,
  total_alunos bigint, perc_dia1 numeric, perc_dia2 numeric
)
language sql stable security definer set search_path = public
as $body$
  with por_turma as (
    select turma_id, serie,
           max(coalesce(total_alunos_turma,0)) as alunos_turma,
           sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=1) as lidos_d1,
           sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=2) as lidos_d2,
           sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=1) as alunos_d1,
           sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=2) as alunos_d2
    from "2026_ppb1".resultados_turmas
    where bimestre = p_bimestre and tipo_prova = p_tipo_prova and turma_id is not null
    group by turma_id, serie
  )
  select serie,
    case serie
      when '4EF' then 1 when '5EF' then 2 when '6EF' then 3
      when '7EF' then 4 when '8EF' then 5 when '9EF' then 6
      when '1EM' then 7 when '2EM' then 8 when '3EM' then 9
      else 99 end as serie_order,
    sum(alunos_turma)::bigint,
    case when sum(alunos_d1)>0 then round(100.0*sum(lidos_d1)/sum(alunos_d1),2) else 0 end,
    case when sum(alunos_d2)>0 then round(100.0*sum(lidos_d2)/sum(alunos_d2),2) else 0 end
  from por_turma
  where serie is not null
  group by serie
  order by serie_order;
$body$;
grant execute on function public.ppb1_get_resumo_table(int,text) to anon, authenticated;

-- get_escola_table agora retorna `serie` junto com turma
drop function if exists public.ppb1_get_escola_table(int,text,text);
create or replace function public.ppb1_get_escola_table(p_bimestre int, p_tipo_prova text, p_escola_id text)
returns table (
  turma_id text, turma text, serie text,
  total_alunos bigint, perc_dia1 numeric, perc_dia2 numeric
)
language sql stable security definer set search_path = public
as $body$
  with por_turma as (
    select turma_id, max(turma) as turma, max(serie) as serie,
           max(coalesce(total_alunos_turma,0)) as alunos_turma,
           sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=1) as lidos_d1,
           sum(coalesce(gabaritos_lidos_cmspp,0)) filter (where dia_prova=2) as lidos_d2,
           sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=1) as alunos_d1,
           sum(coalesce(total_alunos_turma,0)) filter (where dia_prova=2) as alunos_d2
    from "2026_ppb1".resultados_turmas
    where bimestre = p_bimestre and tipo_prova = p_tipo_prova
      and escola_id = p_escola_id and turma_id is not null
    group by turma_id
  )
  select turma_id, turma, serie, alunos_turma::bigint,
    case when alunos_d1>0 then round(100.0*lidos_d1/alunos_d1,2) else 0 end,
    case when alunos_d2>0 then round(100.0*lidos_d2/alunos_d2,2) else 0 end
  from por_turma order by turma;
$body$;
grant execute on function public.ppb1_get_escola_table(int,text,text) to anon, authenticated;
