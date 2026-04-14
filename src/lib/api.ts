import { supabase } from './supabase';

export interface Filters {
  bimestres: number[];
  tipos_prova: string[];
}

export interface AggRow {
  [key: string]: string | number | null | undefined;
  ure?: string;
  escola_id?: string;
  escola?: string;
  turma_id?: string;
  turma?: string;
  serie?: string;
  total_escolas?: number;
  total_turmas?: number;
  total_alunos?: number;
  perc_dia1: number;
  perc_dia2: number;
}

export interface SummaryRow {
  total_alunos: number;
  total_lidos_dia1: number;
  total_lidos_dia2: number;
  perc_dia1: number;
  perc_dia2: number;
}

export async function fetchAvailableFilters(): Promise<Filters> {
  const { data, error } = await supabase.rpc('ppb1_get_available_filters');
  if (error) throw error;
  const row = (data && data[0]) || { bimestres: [], tipos_prova: [] };
  return {
    bimestres: row.bimestres ?? [],
    tipos_prova: row.tipos_prova ?? [],
  };
}

export async function fetchSummary(bimestre: number, tipoProva: string): Promise<SummaryRow | null> {
  const { data, error } = await supabase.rpc('ppb1_get_summary_cards', {
    p_bimestre: bimestre,
    p_tipo_prova: tipoProva,
  });
  if (error) throw error;
  return (data && data[0]) || null;
}

export async function fetchResumoView(bimestre: number, tipoProva: string): Promise<AggRow[]> {
  const { data, error } = await supabase.rpc('ppb1_get_resumo_table', {
    p_bimestre: bimestre,
    p_tipo_prova: tipoProva,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchSeducView(bimestre: number, tipoProva: string): Promise<AggRow[]> {
  const { data, error } = await supabase.rpc('ppb1_get_seduc_table', {
    p_bimestre: bimestre,
    p_tipo_prova: tipoProva,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchUreView(bimestre: number, tipoProva: string, ure: string): Promise<AggRow[]> {
  if (!ure) return [];
  const { data, error } = await supabase.rpc('ppb1_get_ure_table', {
    p_bimestre: bimestre,
    p_tipo_prova: tipoProva,
    p_ure: ure,
  });
  if (error) throw error;
  return data || [];
}

export async function fetchEscolaView(bimestre: number, tipoProva: string, escolaId: string): Promise<AggRow[]> {
  if (!escolaId) return [];
  const { data, error } = await supabase.rpc('ppb1_get_escola_table', {
    p_bimestre: bimestre,
    p_tipo_prova: tipoProva,
    p_escola_id: escolaId,
  });
  if (error) throw error;
  return data || [];
}
