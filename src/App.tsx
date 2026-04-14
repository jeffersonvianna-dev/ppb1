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
  fetchResumoView,
  fetchSeducView,
  fetchSummary,
  fetchUreView,
  type AggRow,
} from './lib/api';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('resumo');
  const [selectedUre, setSelectedUre] = useState('');
  const [selectedEscolaId, setSelectedEscolaId] = useState('');
  const [selectedEscolaLabel, setSelectedEscolaLabel] = useState('');
  const [search, setSearch] = useState('');
  const [serieFilter, setSerieFilter] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'ure', direction: 'asc' });

  const NAME_KEY: Record<ActiveView, string> = {
    resumo: 'serie_order',
    seduc: 'ure',
    ure: 'escola',
    escola: 'turma',
  };

  // Default sort (alphabetical by name column) when changing view
  useEffect(() => {
    if (activeView === 'resumo') {
      setSortConfig({ key: 'perc_dia2', direction: 'asc' });
    } else {
      setSortConfig({ key: NAME_KEY[activeView], direction: 'asc' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  const { data: filters } = useQuery({ queryKey: ['filters'], queryFn: fetchAvailableFilters });

  const bimestre = filters?.bimestres[0] ?? null;
  const tipoProva = filters?.tipos_prova[0] ?? '';
  const ready = bimestre !== null && !!tipoProva;

  const { data: summary = null, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['summary', bimestre, tipoProva],
    queryFn: () => fetchSummary(bimestre!, tipoProva),
    enabled: ready,
  });

  const { data: resumoData = [], isLoading: isLoadingResumo } = useQuery({
    queryKey: ['resumo', bimestre, tipoProva],
    queryFn: () => fetchResumoView(bimestre!, tipoProva),
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
    setSerieFilter('');
  }, [activeView]);

  const rawData =
    activeView === 'resumo' ? resumoData :
    activeView === 'seduc' ? seducData :
    activeView === 'ure' ? ureData : escolaData;
  const isLoadingData =
    activeView === 'resumo' ? isLoadingResumo :
    activeView === 'seduc' ? isLoadingSeduc :
    activeView === 'ure' ? isLoadingUre : isLoadingEscola;

  const availableSeries = useMemo(() => {
    if (activeView !== 'escola') return [] as string[];
    const order = ['4EF','5EF','6EF','7EF','8EF','9EF','1EM','2EM','3EM'];
    const found = new Set(escolaData.map((r) => String(r.serie ?? '')).filter(Boolean));
    return order.filter((s) => found.has(s));
  }, [escolaData, activeView]);

  const visibleData = useMemo(() => {
    let rows: AggRow[] = [...rawData];
    if (activeView === 'escola' && serieFilter) {
      rows = rows.filter((r) => String(r.serie) === serieFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      const key =
        activeView === 'resumo' ? 'serie' :
        activeView === 'seduc' ? 'ure' :
        activeView === 'ure' ? 'escola' : 'turma';
      rows = rows.filter((r) => String(r[key] ?? '').toLowerCase().includes(q));
    }
    // preserve server order for resumo on default sort
    const preserveOrder = activeView === 'resumo' && sortConfig.key === 'perc_dia2' && sortConfig.direction === 'asc';
    if (!preserveOrder) rows.sort((a, b) => {
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
    // Append TOTAL row at end in resumo view (always last, never sorted/filtered)
    if (activeView === 'resumo' && summary && rawData.length > 0) {
      rows.push({
        serie: 'TOTAL',
        total_alunos: summary.total_alunos,
        perc_dia1: Number(summary.perc_dia1),
        perc_dia2: Number(summary.perc_dia2),
      });
    }
    return rows;
  }, [rawData, search, serieFilter, sortConfig, activeView, summary]);

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
      <Header />
      <main className="page">
        <SummaryCards summary={summary} isLoading={isLoadingSummary} />

        <div className="table-section">
          <div className="table-top">
            <div className="tabs">
              <button className={`tab-button ${activeView === 'resumo' ? 'active' : ''}`} onClick={() => setActiveView('resumo')}>Resumo</button>
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
              {activeView === 'escola' && availableSeries.length > 0 && (
                <FilterSelect
                  label="Série"
                  options={[{ value: '', label: 'Todas' }, ...availableSeries.map((s) => ({ value: s, label: s }))]}
                  value={serieFilter}
                  onChange={setSerieFilter}
                  placeholder="Todas"
                  searchPlaceholder="Buscar série..."
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
            onRowClick={activeView === 'seduc' || activeView === 'ure' ? handleRowClick : undefined}
            variant={activeView === 'resumo' ? 'resumo' : 'default'}
          />
        </div>
      </main>
    </div>
  );
}
