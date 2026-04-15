export function fmtInt(v: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR').format(Number(v ?? 0));
}

export function fmtIntAbbr(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} milhões`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${k.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil`;
  }
  return new Intl.NumberFormat('pt-BR').format(n);
}

export function fmtPct(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}
