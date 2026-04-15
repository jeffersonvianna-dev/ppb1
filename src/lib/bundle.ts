// Bundle estático pré-agregado, servido pela CDN do Vercel.
// Gerado por `scripts/build_bundle.py`. Sem fetch no Supabase em runtime.

export interface SummaryRow {
  total_alunos: number;
  total_lidos_dia1: number;
  total_lidos_dia2: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface ResumoRow {
  serie: string;
  serie_order: number;
  total_alunos: number;
  lidos_dia1: number;
  lidos_dia2: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface SeducRow {
  ure: string;
  total_escolas: number;
  total_turmas: number;
  total_alunos: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface EscolaRow {
  ure: string;
  escola_id: string;
  escola: string;
  total_turmas: number;
  total_alunos: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface TurmaRow {
  escola_id: string;
  turma_id: string;
  turma: string;
  serie: string | null;
  total_alunos: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface Bundle {
  atualizacao: string | null;
  summary: SummaryRow;
  resumo: ResumoRow[];
  seduc: SeducRow[];
  escolas: EscolaRow[];
  turmas: TurmaRow[];
}

let cache: Promise<Bundle> | null = null;

export function loadBundle(): Promise<Bundle> {
  if (!cache) {
    // `default`: navegador respeita Cache-Control do Vercel (max-age=300, SWR 3600).
    // Revalida via ETag a cada 5min — quando reloadamos o bundle, usuários veem o novo
    // sem precisar de hard refresh.
    cache = fetch('/bundle.json', { cache: 'default' }).then((r) => {
      if (!r.ok) throw new Error(`Falha ao carregar bundle: ${r.status}`);
      return r.json() as Promise<Bundle>;
    });
  }
  return cache;
}
