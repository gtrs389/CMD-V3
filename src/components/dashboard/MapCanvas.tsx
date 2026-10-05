'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin, PollingPlacePin } from '@/lib/domain/map-pin';
import {
  clusterPins,
  estimatedVotes,
  precisionLabel,
  voteBreakdown,
  ESTIMATED_VOTES_HINT,
  ESTIMATED_VOTES_LABEL,
  type PinCluster,
} from '@/lib/domain/map-pin';
import { tileUrlFrom } from '@/lib/domain/map-tile';
import { formatPhone } from '@/lib/utils/phone';
import { BotaoDePdf } from './BotaoDePdf';
import { PlaceSections } from './PlaceSections';
import { formatNumber } from '@/lib/utils/text';
import { initials } from '@/lib/utils/text';

/**
 * Desenho do mapa.
 *
 * Carregado apenas no navegador (o Leaflet depende de `window`), por isso
 * vive separado do cartao. Nenhuma regiao ou nivel de zoom e pre-carregado.
 *
 * O rodape de credito do Leaflet fica desligado: o mapa nao mostra nenhuma
 * barra sobre os tiles.
 */

/**
 * Endereco dos tiles.
 *
 * A regra mora em `map-tile.ts`: sem configuracao vale o OpenStreetMap, que
 * nao usa credencial, e um valor configurado que nao serve — vazio, com
 * aspas, ou sem `{z}/{x}/{y}` — tambem cai nele. O `??` de antes so olhava
 * `undefined`, entao uma variavel cadastrada e VAZIA passava inteira e o
 * mapa ficava cinza atras dos pinos, sem erro nenhum na tela.
 */
const TILE_URL = tileUrlFrom(process.env.NEXT_PUBLIC_MAP_TILE_URL);

/** Azul do CMD para a moradia; laranja para o local de votacao. */
const COLORS: Record<MapPin['locationKind'], string> = {
  RESIDENCE: '#1f4e6d',
  POLLING_PLACE: '#c2610a',
};

/** Lado do pino e altura da ponta, em pixels. */
const PIN_SIZE = 40;
const PIN_TIP = 9;

/**
 * Reserva da escola sem foto: o predio.
 *
 * Constante do modulo, escrita aqui: nenhum dado de fora entra nesta marcacao.
 */
const PLACE_GLYPH =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4 19 H20 M5 19 V9 M19 19 V9 M12 3 L21 9 H3 Z M9 19 V13 H15 V19"/></svg>';

/**
 * Pino com foto.
 *
 * A pessoa aparece pelo proprio rosto e a escola pela fachada: o pino deixa de
 * ser um desenho vazio. A forma continua dizendo o que e o ponto mesmo com a
 * foto dentro — gente e redondo, lugar e quadrado —, e o anel mantem a cor do
 * tipo.
 *
 * O no e montado no DOM, nunca por texto: a foto assinada do integrante e a
 * imagem que veio do provedor entram como atributo `src`, entao nenhuma URL
 * de fora vira marcacao. Quando a imagem nao carrega — link assinado vencido,
 * foto removida — o pino cai na reserva que ja esta montada embaixo dela:
 * iniciais na pessoa, predio na escola.
 */
/** Dourado do Lider: o anel e o selo de estrela do pino dele. */
const LIDER_COLOR = '#e0a426';

/**
 * Quem ja apareceu no mapa nesta sessao. So a PRIMEIRA aparicao cai com a
 * animacao: trocar o zoom refaz os grupos, e cada pino caindo de novo a cada
 * scroll cansaria.
 */
const JA_APARECERAM = new Set<string>();
let ordemDeEntrada = 0;

/** Atraso escalonado da queda dos pinos (0 = sem animacao). */
function atrasoDeEntrada(chave: string): number | null {
  if (JA_APARECERAM.has(chave)) return null;
  JA_APARECERAM.add(chave);
  ordemDeEntrada += 1;
  return Math.min(ordemDeEntrada * 22, 700);
}

interface OpcoesDoPino {
  lider?: boolean;
  atraso?: number | null;
}

function pinElement(
  kind: MapPin['locationKind'],
  src: string | null,
  label: string | null,
  opcoes: OpcoesDoPino = {},
): HTMLElement {
  const color = opcoes.lider ? LIDER_COLOR : COLORS[kind];

  // Raiz: a queda (uma vez). Corpo: o realce do mouse. Separados porque a
  // animacao, terminada, prenderia o `transform` e o hover nao subiria.
  const root = document.createElement('span');
  root.className = opcoes.atraso != null ? 'cmd-pin cmd-pin-entra' : 'cmd-pin';
  if (opcoes.atraso != null) root.style.setProperty('--cmd-atraso', `${opcoes.atraso}ms`);
  root.style.cssText += `;position:relative;display:block;width:${PIN_SIZE}px;` +
    `height:${PIN_SIZE + PIN_TIP}px`;

  const corpo = document.createElement('span');
  corpo.className = opcoes.lider ? 'cmd-pin-corpo cmd-pin-lider' : 'cmd-pin-corpo';
  corpo.style.cssText = `position:relative;display:block;width:100%;height:100%;` +
    `filter:drop-shadow(0 2px 3px rgb(16 24 40 / 0.35))`;

  const frame = document.createElement('span');
  frame.style.cssText =
    `position:relative;display:flex;box-sizing:border-box;width:${PIN_SIZE}px;` +
    `height:${PIN_SIZE}px;align-items:center;justify-content:center;overflow:hidden;` +
    `border:3px solid ${color};border-radius:${kind === 'RESIDENCE' ? '9999px' : '11px'};` +
    `background:${color};color:#fff;font-size:12px;font-weight:600;line-height:1`;

  const fallback = document.createElement('span');
  fallback.style.cssText =
    'display:flex;width:100%;height:100%;align-items:center;justify-content:center';
  if (label) fallback.textContent = label;
  else fallback.innerHTML = PLACE_GLYPH;
  frame.append(fallback);

  if (src) {
    const photo = document.createElement('img');
    photo.alt = '';
    photo.decoding = 'async';
    photo.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
    photo.addEventListener('error', () => photo.remove());
    photo.src = src;
    frame.append(photo);
  }

  const tip = document.createElement('span');
  tip.style.cssText =
    `position:absolute;left:50%;top:${PIN_SIZE - 2}px;margin-left:-6px;width:0;height:0;` +
    `border-left:6px solid transparent;border-right:6px solid transparent;` +
    `border-top:${PIN_TIP}px solid ${color}`;

  corpo.append(frame, tip);

  // Selo do Lider: uma estrela dourada no canto do pino.
  if (opcoes.lider) {
    const selo = document.createElement('span');
    selo.style.cssText =
      `position:absolute;right:-5px;top:-5px;display:flex;width:18px;height:18px;align-items:center;` +
      `justify-content:center;border-radius:9999px;background:${LIDER_COLOR};border:2px solid #fff;` +
      'box-shadow:0 1px 3px rgb(16 24 40 / 0.35)';
    selo.innerHTML =
      '<svg viewBox="0 0 24 24" width="10" height="10" fill="white" aria-hidden="true"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z"/></svg>';
    corpo.append(selo);
  }

  root.append(corpo);
  return root;
}

function markerIcon(
  kind: MapPin['locationKind'],
  src: string | null,
  /** Iniciais da pessoa. Nulo na escola: la a reserva e o predio. */
  label: string | null = null,
  opcoes: OpcoesDoPino = {},
): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [PIN_SIZE, PIN_SIZE + PIN_TIP],
    // A ponta encosta na coordenada; o balao abre logo acima do pino.
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE + PIN_TIP],
    popupAnchor: [0, -(PIN_SIZE + PIN_TIP - 2)],
    html: pinElement(kind, src, label, opcoes),
  });
}

/* -------------------------------------------------------------------------
   Pino da escola: uma etiqueta com o numero
   ------------------------------------------------------------------------- */

/** Medalhas das tres maiores escolas do recorte: ouro, prata, bronze. */
const MEDALHAS = ['#e0a426', '#9aa7b4', '#b8743c'] as const;

/** "1.234" ate 9.999; dai em diante "12,3 mil". */
function numeroDoPino(n: number): string {
  if (n < 10_000) return n.toLocaleString('pt-BR');
  return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
}

interface OpcoesDaEscola {
  /** O numero da escola no recorte: estimativa da campanha ou votos do candidato. */
  valor: number;
  /** De 0 a 1, relativo a maior escola do recorte: o tamanho da etiqueta. */
  forca: number;
  /** 1, 2 ou 3: a medalha. */
  posicao: number | null;
  /** Escola do time na votacao: estimativa e apurado. */
  destaque?: { estimativa: number; apurado: number } | null;
  /** Votacao: estimativa da campanha ou votos oficiais. */
  votacao: boolean;
  apagado?: boolean;
  atraso?: number | null;
  /** Nome da escola: aparece quando o mouse passa por cima. */
  titulo: string | null;
  foto: string | null;
}

/**
 * A escola como uma etiqueta presa ao chao por uma haste: a foto da fachada
 * (ou o predio) e o NUMERO, grande — quem olha o mapa le onde esta a forca
 * sem abrir nada. O tamanho cresce com a escola, as tres maiores ganham
 * medalha, e passar o mouse revela o nome.
 *
 * Tres tons, sempre com o numero escrito: azul-marinho na campanha (a
 * estimativa); ouro nas escolas do time durante a votacao, com a conversao
 * ao lado; branco nas outras escolas da votacao.
 *
 * O no e montado no DOM, nunca por texto: o nome da escola entra como
 * `textContent` e a foto como atributo `src`.
 */
function escolaElement(o: OpcoesDaEscola): HTMLElement {
  const time = o.destaque != null;
  const tema = time
    ? { fundo: 'linear-gradient(135deg,#f8d878 0%,#e0a426 100%)', borda: '#ffffff', numero: '#0f1e35', icone: '#0f1e35', glifo: '#f2c14e', haste: '#b7801a' }
    : o.votacao
      ? { fundo: '#ffffff', borda: '#c3cdd7', numero: '#0f1e35', icone: '#8ea6c4', glifo: '#ffffff', haste: '#7b8d9d' }
      : { fundo: 'linear-gradient(135deg,#1d3050 0%,#0f1e35 100%)', borda: o.forca >= 0.66 ? '#f2c14e' : '#ffffff', numero: '#ffffff', icone: '#c2610a', glifo: '#ffffff', haste: '#0f1e35' };
  const fonte = Math.round(12 + o.forca * 4);
  const lado = Math.round(22 + o.forca * 8);

  // Raiz sem tamanho, na coordenada: a etiqueta se apoia nela pela haste.
  const root = document.createElement('span');
  root.className = o.atraso != null ? 'cmd-pin cmd-pin-entra' : 'cmd-pin';
  if (o.atraso != null) root.style.setProperty('--cmd-atraso', `${o.atraso}ms`);
  root.style.cssText += ';position:relative;display:block;width:0;height:0';

  const corpo = document.createElement('span');
  corpo.className = 'cmd-escola';
  if (o.apagado) corpo.style.cssText = 'filter:saturate(0.3);opacity:0.5';

  const capsula = document.createElement('span');
  capsula.className = 'cmd-escola-capsula';
  capsula.style.cssText =
    `background:${tema.fundo};border-color:${tema.borda};color:${tema.numero};` +
    `padding:3px ${Math.round(8 + o.forca * 3)}px 3px 3px`;

  const icone = document.createElement('span');
  icone.className = 'cmd-escola-icone';
  icone.style.cssText = `width:${lado}px;height:${lado}px;background:${tema.icone}`;
  icone.innerHTML = PLACE_GLYPH.replace('stroke="white"', `stroke="${tema.glifo}"`).replace(/width="20" height="20"/, `width="${Math.round(lado * 0.62)}" height="${Math.round(lado * 0.62)}"`);
  if (o.foto) {
    const foto = document.createElement('img');
    foto.alt = '';
    foto.decoding = 'async';
    foto.addEventListener('error', () => foto.remove());
    foto.src = o.foto;
    icone.append(foto);
  }

  const numero = document.createElement('span');
  numero.className = 'cmd-escola-numero';
  numero.style.fontSize = `${fonte}px`;
  numero.textContent = numeroDoPino(o.valor);

  capsula.append(icone, numero);

  // Escola do time na votacao: a conversao (apurado / estimativa) colada no numero.
  if (o.destaque && o.destaque.estimativa > 0) {
    const conv = Math.round((o.destaque.apurado / o.destaque.estimativa) * 100);
    const chip = document.createElement('span');
    chip.className = 'cmd-escola-chip';
    chip.style.color = conv >= 100 ? '#4ade80' : conv >= 80 ? '#f2c14e' : '#f87171';
    chip.textContent = `${conv}%`;
    capsula.append(chip);
  }

  const nome = document.createElement('span');
  nome.className = 'cmd-escola-nome';
  nome.textContent = o.titulo ?? 'Local de votação';
  capsula.append(nome);

  if (o.posicao !== null && o.posicao <= 3) {
    const medalha = document.createElement('span');
    medalha.className = 'cmd-escola-medalha';
    medalha.style.background = MEDALHAS[o.posicao - 1];
    medalha.textContent = String(o.posicao);
    capsula.append(medalha);
  }

  const haste = document.createElement('span');
  haste.className = 'cmd-escola-haste';
  haste.style.background = tema.haste;

  const chao = document.createElement('span');
  chao.className = time || o.posicao === 1 ? 'cmd-escola-chao cmd-escola-pulsa' : 'cmd-escola-chao';
  chao.style.setProperty('--cmd-cor', time ? '#e0a426' : '#c2610a');

  corpo.append(capsula, haste, chao);
  root.append(corpo);

  // Leitura para quem passa o mouse ou usa leitor de tela.
  const partes = [o.titulo ?? 'Local de votação', `${o.valor.toLocaleString('pt-BR')} ${o.votacao ? 'votos' : 'votos estimados'}`];
  if (o.destaque) partes.push(`estimativa do time ${o.destaque.estimativa.toLocaleString('pt-BR')}`);
  root.title = partes.join(' · ');
  return root;
}

function escolaIcon(o: OpcoesDaEscola): L.DivIcon {
  const altura = Math.round(22 + o.forca * 8) + 6 + 14;
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -(altura + 4)],
    html: escolaElement(o),
  });
}

function clusterIcon(total: number, kinds: MapPin['locationKind'][]): L.DivIcon {
  const color = kinds.includes('RESIDENCE') ? COLORS.RESIDENCE : COLORS.POLLING_PLACE;
  const size = total > 99 ? 48 : total > 9 ? 42 : 36;

  // `total` e um numero e `color` uma constante deste modulo: nenhum dado de
  // fora entra nesta marcacao. O anel respira em volta do grupo.
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <span class="cmd-cluster" style="--cmd-cor:${color};width:${size}px;height:${size}px">
        <span class="cmd-cluster-corpo" style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;
                     border-radius:9999px;background:${color};color:#fff;font-weight:700;font-size:13px;
                     border:3px solid rgb(255 255 255 / 0.85);box-shadow:0 2px 6px rgb(16 24 40 / 0.3)">
          ${total}
        </span>
      </span>`,
  });
}

/**
 * Coordenada que pode entrar no enquadramento.
 *
 * Nula, NaN, fora da faixa de latitude/longitude ou exatamente `0,0` — a
 * "ilha nula" no golfo da Guine, para onde vai todo campo esquecido — nao
 * dizem onde nada fica, e um unico ponto desses estica o enquadramento por
 * meio planeta, deixando o mapa inteiro sem zoom.
 */
function usableCoordinate(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude === 0 && longitude === 0) return false;
  return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

/** Enquadra os pinos a cada mudanca de filtro ou de dados. */
function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  // So o que tem coordenada utilizavel entra na conta. Sem nenhum ponto
  // valido o mapa fica onde esta — melhor manter a vista atual do que
  // enquadrar um lugar que nao existe.
  const uteis = useMemo(
    () => pins.filter((pin) => usableCoordinate(pin.latitude, pin.longitude)),
    [pins],
  );
  const signature = uteis.map((pin) => `${pin.latitude},${pin.longitude}`).join('|');
  const last = useRef('');

  useEffect(() => {
    if (uteis.length === 0 || last.current === signature) return;
    last.current = signature;

    const bounds = L.latLngBounds(uteis.map((pin) => [pin.latitude, pin.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, uteis, signature]);

  return null;
}

function PinPhoto({ pin }: { pin: MapPin }) {
  // Link assinado vencido ou foto removida: as iniciais no lugar do icone de
  // imagem quebrada, como ja acontece no pino.
  const [quebrada, setQuebrada] = useState(false);

  if (pin.memberPhoto && !quebrada) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={pin.memberPhoto}
        alt={`Foto de ${pin.memberName}`}
        onError={() => setQuebrada(true)}
        className="size-10 shrink-0 rounded-full border border-line object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-500"
    >
      {initials(pin.memberName)}
    </span>
  );
}

/** Cartao da pessoa. Telefone e e-mail so aparecem quando existem. */
function PinDetails({
  pin,
  onOpenMember,
  extra,
}: {
  pin: MapPin;
  onOpenMember: (memberId: string) => void;
  /** Acoes do Lider, quando o pino e de Lider. */
  extra?: ReactNode;
}) {
  const local = [pin.place, pin.district].filter(Boolean).join(' - ');
  const municipio = [pin.city, pin.state].filter(Boolean).join('/');

  return (
    <div className="map-popup flex min-w-52 gap-2.5">
      <PinPhoto pin={pin} />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-ink-900">{pin.memberName}</p>
        <p className="text-xs text-ink-500">{pin.clientName}</p>

        {pin.phone ? (
          <p className="text-xs text-ink-500">{formatPhone(pin.phone)}</p>
        ) : null}
        {pin.email ? <p className="truncate text-xs text-ink-500">{pin.email}</p> : null}

        {local ? <p className="text-xs text-ink-700">{local}</p> : null}
        {municipio ? <p className="text-xs text-ink-500">{municipio}</p> : null}

        <p className="text-[0.6875rem] text-ink-500 italic">{precisionLabel(pin)}</p>

        {/* Abre a ficha SOBRE o mapa. Navegar para a pagina do time custava
            a posicao, o zoom, o filtro e a escola aberta — e a ficha e uma
            leitura rapida no meio da analise, nao um destino. */}
        <button
          type="button"
          onClick={() => onOpenMember(pin.memberId)}
          className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          Ver ficha completa
        </button>
        {extra}
      </div>
    </div>
  );
}

function ClusterMarker({
  cluster,
  onOpenMember,
  renderLider,
}: {
  cluster: PinCluster;
  onOpenMember: (memberId: string) => void;
  renderLider?: (memberId: string) => ReactNode;
}) {
  const map = useMap();
  const single = cluster.pins.length === 1 ? cluster.pins[0] : null;
  const lider = single?.tier === 'LIDER';

  // Sozinha, a pessoa aparece pela propria foto; agrupadas, vale a contagem.
  // O icone e guardado para a foto nao ser buscada de novo a cada desenho.
  const icon = useMemo(
    () =>
      single
        ? markerIcon(single.locationKind, single.memberPhoto, initials(single.memberName), {
            lider: single.tier === 'LIDER',
            atraso: atrasoDeEntrada(`${single.memberId}:${single.locationKind}`),
          })
        : clusterIcon(cluster.pins.length, cluster.pins.map((pin) => pin.locationKind)),
    [cluster.pins, single],
  );

  if (single) {
    return (
      <Marker position={[single.latitude, single.longitude]} icon={icon} zIndexOffset={lider ? 500 : 0}>
        <Popup minWidth={lider ? 290 : 240}>
          <PinDetails
            pin={single}
            onOpenMember={onOpenMember}
            extra={lider && renderLider ? renderLider(single.memberId) : null}
          />
        </Popup>
      </Marker>
    );
  }

  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={icon}
      eventHandlers={{
        click: () => map.setView([cluster.latitude, cluster.longitude], Math.min(map.getZoom() + 3, 18)),
      }}
    >
      <Popup>
        <div className="map-popup max-h-56 min-w-52 space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold text-ink-700">
            {cluster.pins.length} integrantes neste ponto
          </p>
          {cluster.pins.map((pin) => (
            <PinDetails
              key={`${pin.memberId}-${pin.locationKind}`}
              pin={pin}
              onOpenMember={onOpenMember}
            />
          ))}
        </div>
      </Popup>
    </Marker>
  );
}

/** Fachada da escola. Sem imagem — ou com imagem quebrada —, fica o predio. */
function PlaceImage({ place }: { place: PollingPlacePin }) {
  const [quebrada, setQuebrada] = useState(false);

  if (place.imageUrl && !quebrada) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={place.imageUrl}
        alt={place.title ?? 'Local de votação'}
        onError={() => setQuebrada(true)}
        className="h-20 w-full rounded-control border border-line object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-14 w-full items-center justify-center rounded-control border border-line bg-ink-50 text-ink-400"
    >
      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 20h16M5 20V10M19 20V10M12 3l9 7H3zM9 20v-6h6v6" />
      </svg>
    </span>
  );
}

/**
 * Estimativa de votos da escola.
 *
 * O numero que importa na escola e quantos votos ela representa, entao ele vem
 * primeiro e grande; a divisao por genero fica embaixo, como composicao. O
 * rodape diz de que o numero e feito para ninguem ler como projecao.
 */
/**
 * Pinos da votacao oficial do TSE, no lugar da estimativa da campanha.
 *
 * O numero muda de nome (sao votos apurados, nao cadastros), a quebra por
 * genero some (a urna nao tem genero) e a lista de pessoas tambem: nao ha
 * pessoa nenhuma por tras desse numero.
 */
export interface ModoVotacao {
  /** "Votos de Fulano (15123)". */
  rotulo: string;
  /** Rodape do balao: de onde o numero vem. */
  nota: string;
  /**
   * Escolas onde o time tinha estimativa (pino -> estimativa e apurado). Elas
   * ficam douradas; as outras recuam.
   */
  destaques?: ReadonlyMap<string, { estimativa: number; apurado: number }>;
  /** Abre o raio-x da escola: estimativa x apuracao, secao por secao. */
  onRaioX?: (locationId: string) => void;
}

/** O numero de cada escola no recorte e a posicao dela: tamanho e medalha do pino. */
interface MedidaDaEscola {
  valor: number;
  forca: number;
  posicao: number;
}

function PlaceVotes({ place, votacao }: { place: PollingPlacePin; votacao?: ModoVotacao }) {
  return (
    <section className="rounded-control border border-brand-100 bg-brand-50 px-2.5 py-2">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-brand-800 uppercase">
        {votacao?.rotulo ?? ESTIMATED_VOTES_LABEL}
      </p>
      <p className="text-2xl leading-tight font-semibold text-brand-900">
        {formatNumber(estimatedVotes(place))}
      </p>

      {votacao ? null : (
        <dl className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-ink-500">
          {voteBreakdown(place).map((item) => (
            <div key={item.label} className="flex gap-1">
              <dt>{item.label}:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(item.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <PlaceSections place={place} compact limite={4} />

      {votacao ? null : <LideresNoBalao place={place} />}

      <p className="mt-1 text-[0.625rem] text-ink-500 italic">{votacao?.nota ?? ESTIMATED_VOTES_HINT}</p>
    </section>
  );
}

/** Quem cadastrou a estimativa da escola: os maiores Lideres, com quantas pessoas cada um. */
function LideresNoBalao({ place }: { place: PollingPlacePin }) {
  const lideres = [...(place.leaders ?? [])].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  if (lideres.length === 0) return null;
  const maior = lideres[0].total;
  const mostrar = lideres.slice(0, 5);
  return (
    <div className="mt-2 border-t border-brand-100 pt-1.5">
      <p className="mb-1 text-[0.625rem] font-semibold tracking-wide text-brand-800 uppercase">
        Líderes que cadastraram aqui
      </p>
      <ul className="space-y-1">
        {mostrar.map((l) => (
          <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-ink-900">{l.name}</span>
              <span className="mt-0.5 block h-1 overflow-hidden rounded-pill bg-white">
                <span className="block h-full rounded-pill bg-navy-800" style={{ width: `${Math.max(6, (l.total / maior) * 100)}%` }} />
              </span>
            </span>
            <span className="text-xs font-bold text-navy-900 tabular-nums">{formatNumber(l.total)}</span>
          </li>
        ))}
      </ul>
      {lideres.length > mostrar.length ? (
        <p className="mt-1 text-[0.625rem] text-ink-500">
          e mais {formatNumber(lideres.length - mostrar.length)} {lideres.length - mostrar.length === 1 ? 'líder' : 'líderes'}
        </p>
      ) : null}
    </div>
  );
}

/** No balao da votacao: o que o time esperava ali, e quanto virou voto. */
function ConfrontoNoBalao({ estimativa, apurado }: { estimativa: number; apurado: number }) {
  const conversao = estimativa > 0 ? Math.round((apurado / estimativa) * 100) : null;
  return (
    <section className="rounded-control border border-gold-500/40 bg-gold-50 px-2.5 py-2">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-gold-700 uppercase">★ Escola do time</p>
      <p className="mt-0.5 text-xs text-ink-700">
        Estimativa: <b className="text-ink-900">{formatNumber(estimativa)}</b> · Apurado: <b className="text-ink-900">{formatNumber(apurado)}</b>
      </p>
      {conversao !== null ? (
        <p className="text-xs text-ink-700">
          Conversão: <b className={conversao >= 100 ? 'text-success-700' : conversao >= 80 ? 'text-gold-700' : 'text-danger-700'}>{conversao}%</b>
        </p>
      ) : null}
    </section>
  );
}

/**
 * Pino do local de votacao.
 *
 * Representa a escola, nunca uma pessoa: o resumo traz apenas contagens, e os
 * nomes so aparecem depois do clique em "Ver pessoas".
 */
function PlaceMarker({
  place,
  medida,
  onOpen,
  onDownload,
  onReady,
  votacao,
}: {
  place: PollingPlacePin;
  /** Numero, tamanho e medalha da etiqueta. */
  medida: MedidaDaEscola;
  /** Pino da votacao do TSE: outro rotulo, e sem lista de pessoas. */
  votacao?: ModoVotacao;
  onOpen: (place: PollingPlacePin) => void;
  /** Baixa o PDF da escola (arquivo de verdade). */
  onDownload?: (place: PollingPlacePin) => Promise<void>;
  /** Entrega o marcador ao mapa, para o ranking conseguir abri-lo. */
  onReady?: (marker: L.Marker | null) => void;
}) {
  const destaque = votacao?.destaques?.get(place.locationId) ?? null;
  const apagado = Boolean(votacao?.destaques?.size) && !destaque;
  /**
   * Escola do time na votacao: o clique abre direto o raio-x (estimativa,
   * Lideres e apuracao), em vez de um balao pequeno com um botao para ele.
   */
  const raioX = destaque && votacao?.onRaioX ? votacao.onRaioX : null;
  const eventos = useMemo(() => (raioX ? { click: () => raioX(place.locationId) } : undefined), [raioX, place.locationId]);
  // A etiqueta da escola: fachada (ou predio), numero, medalha e nome.
  const icon = useMemo(
    () =>
      escolaIcon({
        valor: medida.valor,
        forca: medida.forca,
        posicao: medida.posicao,
        destaque,
        votacao: Boolean(votacao),
        apagado,
        atraso: atrasoDeEntrada(`local:${place.locationId}`),
        titulo: place.title,
        foto: place.imageUrl,
      }),
    // `destaque` muda de objeto a cada leitura: entram os numeros dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [medida.valor, medida.forca, medida.posicao, destaque?.estimativa, destaque?.apurado, votacao, apagado, place.locationId, place.title, place.imageUrl],
  );

  return (
    <Marker
      ref={onReady}
      position={[place.latitude, place.longitude]}
      icon={icon}
      eventHandlers={eventos}
      // A etiqueta sob o mouse passa por cima das vizinhas (o nome se abre).
      riseOnHover
      // As maiores escolas ficam por cima das menores quando se encostam.
      zIndexOffset={Math.round(medida.forca * 400) + (destaque ? 500 : 0)}
    >
      {/* Balao com teto de altura: escola com muitas secoes rola por dentro,
          em vez de cobrir o mapa (principalmente em tela cheia). */}
      {raioX ? null : (
        <Popup maxHeight={420} minWidth={240}>
          <div className="map-popup w-56 space-y-1.5">
            <PlaceImage place={place} />

            <p className="text-sm font-semibold text-ink-900">
              {place.title ?? 'Local de votação'}
            </p>
            {place.address ? <p className="text-xs text-ink-500">{place.address}</p> : null}
            <p className="text-xs text-ink-500">
              {[place.city, place.state].filter(Boolean).join('/') || '--'}
            </p>

            {/* Escola do time sem raio-x (sem quem o abra): o confronto no balao. */}
            {destaque ? <ConfrontoNoBalao estimativa={destaque.estimativa} apurado={destaque.apurado} /> : null}

            <PlaceVotes place={place} votacao={votacao} />

            {votacao ? null : (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpen(place)}
                  className="inline-flex min-h-9 flex-1 items-center justify-center rounded-control bg-brand-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
                >
                  Ver pessoas
                </button>
                {onDownload ? <BotaoDePdf onClick={() => onDownload(place)} rotulo="PDF" titulo="Baixar o PDF desta escola" /> : null}
              </div>
            )}
          </div>
        </Popup>
      )}
    </Marker>
  );
}

/** Local que o mapa deve enquadrar, pedido de fora (o ranking). */
export interface MapFocus {
  locationId: string;
  latitude: number;
  longitude: number;
  /**
   * Muda a cada pedido.
   *
   * Sem isso, clicar duas vezes no mesmo local nao faria nada: o alvo seria
   * identico e o efeito nao rodaria de novo. E comum querer voltar ao local
   * depois de arrastar o mapa.
   */
  nonce: number;
}

export default function MapCanvas({
  pins,
  places = [],
  onOpenPlace,
  onDownloadPlace,
  onOpenMember,
  renderLiderActions,
  focusPlace = null,
  resizeKey,
  fallbackCenter,
  votacao,
  valorDoLocal,
}: {
  pins: MapPin[];
  places?: PollingPlacePin[];
  onOpenPlace?: (place: PollingPlacePin) => void;
  /** Baixa o PDF da escola. Sem ele, o botao nao aparece. */
  onDownloadPlace?: (place: PollingPlacePin) => Promise<void>;
  /** Acoes do Lider no balao do pino dele (Equipe, inconsistencias, PDFs). */
  renderLiderActions?: (memberId: string) => ReactNode;
  /** Abre a ficha da pessoa sobre o mapa, sem sair dele. */
  onOpenMember?: (memberId: string) => void;
  /** Leva o mapa ate um local e abre o balao dele. */
  focusPlace?: MapFocus | null;
  /**
   * Muda quando o TAMANHO do mapa muda (entrar e sair da tela cheia).
   *
   * O Leaflet calcula os tiles a partir do tamanho do container e nao
   * percebe sozinho que ele cresceu: sem este aviso, a tela cheia abre com
   * metade do mapa cinza ate alguem arrastar.
   */
  resizeKey?: string | number;
  /**
   * Centro de partida quando ainda nao ha nenhum pino para enquadrar.
   *
   * O padrao e o centro do Brasil, que serve ao mapa geral. A pagina de um
   * time pode pedir o centro da propria regiao — e o que faz o mapa de um
   * Time DEMO abrir em Alagoas, e nao a meio caminho de outro estado.
   */
  fallbackCenter?: { latitude: number; longitude: number };
  /** Os pinos de escola sao da votacao oficial do TSE, nao da campanha. */
  votacao?: ModoVotacao;
  /**
   * O numero de cada escola no recorte (com zona, so as secoes dela). Sem
   * ele, o total da escola.
   */
  valorDoLocal?: (place: PollingPlacePin) => number;
}) {
  const [zoom, setZoom] = useState(4);
  // Numero, tamanho (relativo a maior) e posicao de cada escola do recorte.
  const medidas = useMemo(() => {
    const valores = places.map((p) => ({ id: p.locationId, valor: valorDoLocal ? valorDoLocal(p) : estimatedVotes(p) }));
    const maior = Math.max(1, ...valores.map((v) => v.valor));
    const ordem = [...valores].sort((a, b) => b.valor - a.valor);
    const posicao = new Map(ordem.map((v, i) => [v.id, v.valor > 0 ? i + 1 : Number.POSITIVE_INFINITY]));
    return new Map(
      valores.map((v) => [v.id, { valor: v.valor, forca: Math.sqrt(v.valor / maior), posicao: posicao.get(v.id) ?? Number.POSITIVE_INFINITY }]),
    );
  }, [places, valorDoLocal]);
  const markers = useRef(new Map<string, L.Marker>());
  const clusters = useMemo(() => clusterPins(pins, zoom), [pins, zoom]);
  const focus = useMemo(
    () => [...pins, ...places.map((place) => ({ ...place }) as unknown as MapPin)],
    [pins, places],
  );

  return (
    <MapContainer
      center={
        fallbackCenter ? [fallbackCenter.latitude, fallbackCenter.longitude] : [-14.235, -51.9253]
      }
      zoom={fallbackCenter ? 8 : 4}
      // A rodinha do mouse da zoom direto, sem Ctrl: em cima do mapa, rolar
      // aproxima e afasta. Passos menores deixam o zoom suave, sem pulos.
      scrollWheelZoom
      wheelPxPerZoomLevel={90}
      wheelDebounceTime={30}
      zoomSnap={0.25}
      zoomDelta={0.5}
      preferCanvas
      // Sem a faixa de credito no canto do mapa.
      attributionControl={false}
      // O + / - sai do canto superior esquerdo: la ficam os controles do
      // proprio mapa (tela cheia, filtros, ranking). Embaixo a direita ele
      // ainda fica na altura do polegar no celular.
      zoomControl={false}
      // `isolate`: as camadas do Leaflet (z 400 a 1000) nunca passam por
      // cima de uma janela aberta na pagina.
      className="isolate h-full w-full"
    >
      <ZoomControl position="bottomright" />
      <TileLayer url={TILE_URL} maxZoom={19} />

      <FitBounds pins={focus} />
      <ZoomWatcher onChange={setZoom} />
      <FlyToPlace focus={focusPlace} markers={markers} />
      <Resizer trigger={resizeKey} />

      {clusters.map((cluster) => (
        <ClusterMarker
          key={cluster.id}
          cluster={cluster}
          onOpenMember={onOpenMember ?? (() => {})}
          renderLider={renderLiderActions}
        />
      ))}

      {places.map((place) => (
        <PlaceMarker
          key={place.locationId}
          place={place}
          medida={medidas.get(place.locationId) ?? { valor: estimatedVotes(place), forca: 0, posicao: Number.POSITIVE_INFINITY }}
          onOpen={onOpenPlace ?? (() => {})}
          onDownload={onDownloadPlace}
          votacao={votacao}
          onReady={(marker) => {
            if (marker) markers.current.set(place.locationId, marker);
            else markers.current.delete(place.locationId);
          }}
        />
      ))}
    </MapContainer>
  );
}

/** Mantem o agrupamento coerente com o zoom atual. */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    // Zoom suave anda de 0,25 em 0,25: os grupos so mudam no nivel inteiro.
    const update = () => onChange(Math.round(map.getZoom()));
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map, onChange]);

  return null;
}

/**
 * Leva o mapa ate o local pedido pelo ranking.
 *
 * Aproxima sem nunca AFASTAR: quem ja estava olhando de perto nao perde o
 * enquadramento por clicar em uma linha da lista. O balao abre junto, entao
 * o clique na lista e o clique no pino chegam ao mesmo lugar.
 */
function FlyToPlace({
  focus,
  markers,
}: {
  focus: MapFocus | null;
  markers: RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;

    map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), 16), {
      duration: 0.6,
    });

    // O balao so abre depois da animacao: aberto antes, ele viaja junto com
    // o mapa e pisca na tela inteira.
    const marker = markers.current.get(focus.locationId);
    const timer = window.setTimeout(() => marker?.openPopup(), 650);
    return () => window.clearTimeout(timer);
  }, [focus, map, markers]);

  return null;
}

/** Recalcula o tamanho do mapa quando o container muda (tela cheia). */
function Resizer({ trigger }: { trigger?: string | number }) {
  const map = useMap();

  useEffect(() => {
    // Um quadro depois: o CSS da tela cheia ainda nao foi aplicado no
    // instante em que o React avisa.
    const timer = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(timer);
  }, [map, trigger]);

  return null;
}

