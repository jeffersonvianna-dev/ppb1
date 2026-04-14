export default function Header({ lastUpdated }: { lastUpdated: string | null }) {
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
          {lastUpdated ? <>Atualizado em <strong>{lastUpdated}</strong></> : 'Carregando...'}
        </div>
      </div>
    </header>
  );
}
