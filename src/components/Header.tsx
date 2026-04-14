import { useQuery } from '@tanstack/react-query';
import { fetchLastUpdated } from '../lib/api';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return 'Carregando...';
  const d = new Date(iso);
  // Exibe em horário de Brasília (UTC-3)
  const brt = new Date(d.getTime() - 3 * 60 * 60 * 1000);
  const dia = brt.getUTCDate();
  const mes = MESES[brt.getUTCMonth()];
  const hh = String(brt.getUTCHours()).padStart(2, '0');
  const mm = String(brt.getUTCMinutes()).padStart(2, '0');
  return `${dia} de ${mes}, ${hh}h${mm}`;
}

export default function Header() {
  const { data: lastUpdated } = useQuery({ queryKey: ['last_updated'], queryFn: fetchLastUpdated });

  return (
    <header className="header">
      <div className="header-inner">
        <div className="header-left">
          <div className="header-title">
            <h1>Prova Paulista — Bimestre 1 / 2026</h1>
            <p>Inserção de cartões-resposta por URE / Escola / Turma</p>
          </div>
        </div>
        <div className="header-stamp">
          Atualizado em <strong>{formatUpdated(lastUpdated)}</strong>
        </div>
      </div>
    </header>
  );
}
