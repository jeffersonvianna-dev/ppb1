import { fmtInt, fmtPct } from '../lib/helpers';
import type { SummaryRow } from '../lib/api';

interface Props {
  summary: SummaryRow | null;
  isLoading: boolean;
}

export default function SummaryCards({ summary, isLoading }: Props) {
  return (
    <>
      <p className="section-label">Resumo Estadual</p>
      <div className="cards">
        {isLoading || !summary ? (
          <div className="card" style={{ gridColumn: '1/-1' }}>
            <div className="loading-wrap">
              <div className="spinner"></div><br />Carregando...
            </div>
          </div>
        ) : (
          <>
            <div className="card">
              <div className="card-label">Alunos (Dia 1)</div>
              <div className="card-value">{fmtInt(summary.total_alunos_dia1)}</div>
              <div className="card-meta">Total esperado</div>
            </div>
            <div className="card">
              <div className="card-label">Cartões lidos (Dia 1)</div>
              <div className="card-value">{fmtInt(summary.total_lidos_dia1)}</div>
              <div className="card-meta">gabaritos_lidos_cmspp</div>
            </div>
            <div className="card">
              <div className="card-label">% Dia 1</div>
              <div className="card-value">{fmtPct(summary.perc_dia1)}</div>
              <div className="card-meta">lidos / alunos</div>
            </div>
            <div className="card">
              <div className="card-label">Alunos (Dia 2)</div>
              <div className="card-value">{fmtInt(summary.total_alunos_dia2)}</div>
              <div className="card-meta">Total esperado</div>
            </div>
            <div className="card">
              <div className="card-label">Cartões lidos (Dia 2)</div>
              <div className="card-value">{fmtInt(summary.total_lidos_dia2)}</div>
              <div className="card-meta">gabaritos_lidos_cmspp</div>
            </div>
            <div className="card">
              <div className="card-label">% Dia 2</div>
              <div className="card-value">{fmtPct(summary.perc_dia2)}</div>
              <div className="card-meta">lidos / alunos</div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
