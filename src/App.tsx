import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Header from './components/Header';
import FilterSelect from './components/FilterSelect';
import SummaryCards from './components/SummaryCards';
import DataTable from './components/DataTable';
import { COLUMNS, type ActiveView } from './components/tableColumns';
import {
  fetchAvailableFilters,
  fetchEscolaList,
  fetchEscolaView,
  fetchSeducView,
  fetchSummary,
  fetchUreList,
  fetchUreView,
  type AggRow,
} from './lib/api';

type SortConfig = { key: string; direction: 'asc' | 'desc' };

export default function App() {
  const [bimestre, setBimestre] = useState<number | null>(null);
  const [tipoProva, setTipoProva] = useState<string>('');
  const [activeView, setActiveView] = useState<ActiveView>('seduc');
  const [selectedUre, setSelectedUre] = useState('');
  const [selectedEscolaId, setSelectedEscolaId] = useState('');
  const [search, setSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'perc_dia2', direction: 'asc' });

  const { data: filters } = useQuery({
    queryKey: ['filters'],
    queryFn: fetchAvailableFilters,
  });

  useEffect(() => {
    if (filters && bimestre === null && filters.bimestres.length > 0) {
      setBimestre(filters.bimestres[0]);
    }
    if (filters && !tipoProva && filters.tipos_prova.length > 0) {
      setTipoProva(filters.tipos_prova[0]);
    }
  }, [filters, bimestre, tipoProva]);

  const ready = bimestre !== null && !!tipoProva;

  const { data: summary = null, isLoading: isLoadingSummary } = useQuery({
    queryKey: ['summary', bimestre, tipoProva],
    queryFn: () => fetchSummary(bimestre!, tipoProva),
    enabled: ready,
  });

  const { data: ureList = [] } = useQuery({
    queryKey: ['ureList', bimestre, tipoProva],
    queryFn: () => fetchUreList(bimestre!, tipoProva),
    enabled: ready,
  });

  const resolvedUre = useMemo(() => {
    if (ureList.length === 0) return '';
    return ureList.includes(selectedUre) ? selectedUre : ureList[0];
  }, [ureList, selectedUre]);

  const { data: escolaList = [] } = useQuery({
    queryKey: ['escolaList', bimestre, tipoProva, resolvedUre],
    queryFn: () => fetchEscolaList(bimestre!, tipoProva, resolvedUre),
    enabled: ready && !!resolvedUre && activeView !== 'seduc',
  });

  const resolvedEscolaId = useMemo(() => {
    if (escolaList.length === 0) return '';
    return escolaList.find((e) => e.escola_id === selectedEscolaId) ? selectedEscolaId : escolaList[0].escola_id;
  }, [escolaList, selectedEscolaId]);

  const { data: rawData = [], isLoading: isLoadingData } = useQuery({
    queryKey: ['view', activeView, bimestre, tipoProva, resolvedUre, resolvedEscolaId],
    queryFn: () => {
      if (activeView === 'seduc') return fetchSeducView(bimestre!, tipoProva);
      if (activeView === 'ure' && resolvedUre) return fetchUreView(bimestre!, tipoProva, resolvedUre);
      if (activeView === 'escola' && resolvedEscolaId) return fetchEscolaView(bimestre!, tipoProva, resolvedEscolaId);
      return Promise.resolve([]);
    },
    enabled: ready,
  });

  const isLoading = isLoadingSummary || isLoadingData;

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
      setActiveView('escola');
    }
  };

  const bimestreOptions = (filters?.bimestres ?? []).map((b) => ({ value: String(b), label: `Bimestre ${b}` }));
  const tipoOptions = (filters?.tipos_prova ?? []).map((t) => ({ value: t, label: t.replace(/_/g, ' ') }));
  const ureOptions = ureList.map((u) => ({ value: u, label: u }));
  const escolaOptions = escolaList.map((e) => ({ value: e.escola_id, label: e.escola }));

  return (
    <div>
      <Header lastUpdated="14 de abril de 2026" />
      <main className="page">
        <div className="filter-bar">
          <FilterSelect
            label="Bimestre"
            options={bimestreOptions}
            value={bimestre !== null ? String(bimestre) : ''}
            onChange={(v) => setBimestre(Number(v))}
            placeholder="Selecione o bimestre"
            searchPlaceholder="Buscar..."
          />
          <FilterSelect
            label="Tipo de prova"
            options={tipoOptions}
            value={tipoProva}
            onChange={setTipoProva}
            placeholder="Selecione"
            searchPlaceholder="Buscar..."
          />
          <div className="field search-field">
            <label htmlFor="search">Busca nesta lista</label>
            <input
              id="search"
              type="search"
              placeholder="Filtrar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <SummaryCards summary={summary} isLoading={isLoadingSummary} />

        <div className="table-section">
          <div className="table-top">
            <div className="tabs">
              <button className={`tab-button ${activeView === 'seduc' ? 'active' : ''}`} onClick={() => setActiveView('seduc')}>SEDUC</button>
              <button className={`tab-button ${activeView === 'ure' ? 'active' : ''}`} onClick={() => setActiveView('ure')}>URE</button>
              <button className={`tab-button ${activeView === 'escola' ? 'active' : ''}`} onClick={() => setActiveView('escola')}>Escola</button>
            </div>
            <div className="table-filters" style={{ display: activeView !== 'seduc' ? 'flex' : 'none' }}>
              {(activeView === 'ure' || activeView === 'escola') && (
                <FilterSelect
                  label="URE"
                  options={ureOptions}
                  value={resolvedUre}
                  onChange={setSelectedUre}
                  placeholder="Selecione uma URE"
                  searchPlaceholder="Buscar URE..."
                />
              )}
              {activeView === 'escola' && (
                <FilterSelect
                  label="Escola"
                  options={escolaOptions}
                  value={resolvedEscolaId}
                  onChange={setSelectedEscolaId}
                  placeholder="Selecione uma escola"
                  searchPlaceholder="Buscar escola..."
                />
              )}
            </div>
          </div>

          <DataTable
            columns={COLUMNS[activeView]}
            data={visibleData}
            isLoading={isLoading}
            sortConfig={sortConfig}
            onSort={handleSort}
            onRowClick={activeView !== 'escola' ? handleRowClick : undefined}
          />
        </div>
      </main>
    </div>
  );
}
