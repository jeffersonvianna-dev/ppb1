export function fmtInt(v: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(Number(v ?? 0));
}

export function fmtPct(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
