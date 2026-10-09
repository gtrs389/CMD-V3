'use client';

import { useState } from 'react';
import { Ban, Check, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * "Seções com 0 voto (PDF)": um toque e baixa. Toda secao das escolas do
 * municipio onde qualquer um dos candidatos escolhidos teve 0 voto, no
 * desenho do "Seção por seção" do Raio-X, com a gente que cada Lider
 * cadastrou na secao. O municipio e o do filtro do mapa.
 */
export function BotaoDasZeradas({
  candidatos,
  municipios,
  onBaixar,
}: {
  candidatos: number;
  municipios: string[];
  onBaixar: () => Promise<void>;
}) {
  const [estado, setEstado] = useState<'parado' | 'montando' | 'pronto' | 'erro'>('parado');
  if (candidatos === 0) return null;
  const semMunicipio = municipios.length === 0;

  async function baixar() {
    if (estado === 'montando' || semMunicipio) return;
    setEstado('montando');
    try {
      await onBaixar();
      setEstado('pronto');
      window.setTimeout(() => setEstado('parado'), 1800);
    } catch {
      setEstado('erro');
      window.setTimeout(() => setEstado('parado'), 2500);
    }
  }

  return (
    <button
      type="button"
      onClick={baixar}
      disabled={semMunicipio || estado === 'montando'}
      title={
        semMunicipio
          ? 'Escolha o município no filtro do mapa'
          : `Toda seção de ${municipios.join(', ')} onde ${candidatos > 1 ? 'qualquer um dos candidatos' : 'o candidato'} teve 0 voto, com os líderes de cada seção`
      }
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-control border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed',
        estado === 'pronto'
          ? 'border-success-600/40 bg-success-50 text-success-700'
          : semMunicipio
            ? 'border-line bg-ink-50 text-ink-400'
            : 'border-danger-600 bg-danger-600 text-white hover:bg-danger-700',
      )}
    >
      {estado === 'montando' ? (
        <span aria-hidden="true" className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : estado === 'pronto' ? (
        <Check aria-hidden="true" className="size-3.5" />
      ) : estado === 'erro' ? (
        <RotateCcw aria-hidden="true" className="size-3.5" />
      ) : (
        <Ban aria-hidden="true" className="size-3.5" />
      )}
      {estado === 'montando'
        ? 'Montando o PDF...'
        : estado === 'pronto'
          ? 'Baixado'
          : estado === 'erro'
            ? 'Tente de novo'
            : semMunicipio
              ? 'Seções com 0 voto: escolha o município'
              : 'Seções com 0 voto (PDF)'}
    </button>
  );
}
