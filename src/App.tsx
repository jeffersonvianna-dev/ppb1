import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from './components/Header';
import FilterSelect from './components/FilterSelect';
import SummaryCards from './components/SummaryCards';
import DataTable from './components/DataTable';
import { COLUMNS, type ActiveView } from './components/tableColumns';
import {
  fetchAvailableFilters,
  fetchEscolaView,
  fetchSeducView,
  fetchSummary,
  fetchUreView,
  type AggRow,
} from './lib/api';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('seduc');
  const [selectedUre, setSelectedUre] = useState('');
  const [selectedEscolaId, setSelectedEscolaId] = useState('');
  const [selectedEscolaLabel, setSelectedEscolaLabel] = useState('');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'perc_dia2', direction: 'asc' });

  const { data: filters } = useQuery({ queryKey: ['filters'], queryFn: fetchAvailableFilters });

  const bimestre = filters?.bimestres[0] ?? null;
  const tipoProva = filters?.tipos_prova[0] ?? '';
  const ready = bimestre !== null && !!tipoProva;

  const { data: summary = null, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['summary', bimestre, tipoProva],
    queryFn: () => fetchSummary(bimestre!, tipoProva),
    enabled: ready,
  });

  const { data: seducData = [], isLoading: isLoadingSeduc } = useQuery({
    queryKey: ['seduc', bimestre, tipoProva],
    queryFn: () => fetchSeducView(bimestre!, tipoProva),
    enabled: ready,
  });

  const ureOptions = useMemo(
    () => seducData.map((r) => ({ value: String(r.ure), label: String(r.ure) })),
    [seducData]
  );
  const resolvedUre = useMemo(() => {
    if (ureOptions.length === 0) return '';
    return ureOptions.find((o) => o.value === selectedUre) ? selectedUre : ureOptions[0].value;
  }, [ureOptions, selectedUre]);

  const { data: ureData = [], isLoading: isLoadingUre } = useQuery({
    queryKey: ['ure', bimestre, tipoProva, resolvedUre],
    queryFn: () => fetchUreView(bimestre!, tipoProva, resolvedUre),
    enabled: ready && !!resolvedUre,
  });

  const escolaOptions = useMemo(
    () => ureData.map((r) => ({ value: String(r.escola_id), label: String(r.escola) })),
    [ureData]
  );
  const resolvedEscolaId = useMemo(() => {
    if (escolaOptions.length === 0) return '';
    return escolaOptions.find((o) => o.value === selectedEscolaId) ? selectedEscolaId : escolaOptions[0].value;
  }, [escolaOptions, selectedEscolaId]);

  const { data: escolaData = [], isLoading: isLoadingEscola } = useQuery({
    queryKey: ['escola', bimestre, tipoProva, resolvedEscolaId],
    queryFn: () => fetchEscolaView(bimestre!, tipoProva, resolvedEscolaId),
    enabled: ready && !!resolvedEscolaId && activeView === 'escola',
  });

  useEffect(() => {
    setSearch('');
  }, [activeView]);

  const rawData =
    activeView === 'seduc' ? seducData : activeView === 'ure' ? ureData : escolaData;
  const isLoadingData =
    activeView === 'seduc' ? isLoadingSeduc : activeView === 'ure' ? isLoadingUre : isLoadingEscola;

  const visibleData = useMemo(() => {
    let rows: AggRow[] = [...rawData];
    if (search) {
      const q = search.toLowerCase();
      const key = activeView === 'seduc' ? 'ure' : activeView === 'ure' ? 'escola' : 'turma';
      rows = rows.filter((r) => String(r[key] ?? '').toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      const va = a[sortConfig.key];
      const vb = b[sortConfig.key];
      if (typeof va === 'string' || typeof vb === 'string') {
        const ta = String(va ?? '');
        const tb = String(vb ?? '');
        return sortConfig.direction === 'asc' ? ta.localeCompare(tb, 'pt-BR') : tb.localeCompare(ta, 'pt-BR');
      }
      const na = Number(va ?? 0);
      const nb = Number(vb ?? 0);
      return sortConfig.direction === 'asc' ? na - nb : nb - na;
    });
    return rows;
  }, [rawData, search, sortConfig, activeView]);

  const handleSort = (key: string) => {
    if (sortConfig.key === key) {
      setSortConfig({ key, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      setSortConfig({ key, direction: 'asc' });
    }
  };

  const handleRowClick = (row: AggRow) => {
    if (activeView === 'seduc' && row.ure) {
      setSelectedUre(String(row.ure));
      setActiveView('ure');
    } else if (activeView === 'ure' && row.escola_id) {
      setSelectedEscolaId(String(row.escola_id));
      setSelectedEscolaLabel(String(row.escola ?? ''));
      setActiveView('escola');
    }
  };

  return (
    <div>
      <Header lastUpdated="14 de abril de 2026" />
      <main className="page">
        <SummaryCards summary={summary} isLoading={isLoadingSummary} />

        <div className="table-section">
          <div className="table-top">
            <div className="tabs">
              <button className={`tab-button ${activeView === 'seduc' ? 'active' : ''}`} onClick={() => setActiveView('seduc')}>SEDUC</button>
              <button className={`tab-button ${activeView === 'ure' ? 'active' : ''}`} onClick={() => setActiveView('ure')}>URE</button>
              <button className={`tab-button ${activeView === 'escola' ? 'active' : ''}`} onClick={() => setActiveView('escola')}>Escola</button>
            </div>

            <div className="table-filters">
              {(activeView === 'ure' || activeView === 'escola') && (
                <FilterSelect
                  label="URE"
                  options={ureOptions}
                  value={resolvedUre}
                  onChange={(v) => { setSelectedUre(v); setSelectedEscolaId(''); }}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar URE..."
                />
              )}
              {activeView === 'escola' && (
                <FilterSelect
                  label="Escola"
                  options={escolaOptions}
                  value={resolvedEscolaId}
                  onChange={(v) => {
                    setSelectedEscolaId(v);
                    const opt = escolaOptions.find((o) => o.value === v);
                    if (opt) setSelectedEscolaLabel(opt.label);
                  }}
                  placeholder="Selecione"
                  searchPlaceholder="Buscar escola..."
                />
              )}
              <div className="field field-inline search-field">
                <label htmlFor="search">Busca</label>
                <input
                  id="search"
                  type="search"
                  placeholder="Filtrar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {activeView === 'escola' && selectedEscolaLabel && (
            <div className="table-subheader">
              Turmas de <strong>{selectedEscolaLabel}</strong>
            </div>
          )}

          <DataTable
            columns={COLUMNS[activeView]}
            data={visibleData}
            isLoading={isLoadingData}
            sortConfig={sortConfig}
            onSort={handleSort}
            onRowClick={activeView !== 'escola' ? handleRowClick : undefined}
          />
        </div>
      </main>
    </div>
  );
}
