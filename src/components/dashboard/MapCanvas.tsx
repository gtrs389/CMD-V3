'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
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
import { formatPhone } from '@/lib/utils/phone';
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

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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
function pinElement(
  kind: MapPin['locationKind'],
  src: string | null,
  label: string | null,
): HTMLElement {
  const color = COLORS[kind];

  const root = document.createElement('span');
  root.style.cssText = `position:relative;display:block;width:${PIN_SIZE}px;` +
    `height:${PIN_SIZE + PIN_TIP}px;filter:drop-shadow(0 2px 3px rgb(16 24 40 / 0.35))`;

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

  root.append(frame, tip);
  return root;
}

function markerIcon(
  kind: MapPin['locationKind'],
  src: string | null,
  /** Iniciais da pessoa. Nulo na escola: la a reserva e o predio. */
  label: string | null = null,
): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [PIN_SIZE, PIN_SIZE + PIN_TIP],
    // A ponta encosta na coordenada; o balao abre logo acima do pino.
    iconAnchor: [PIN_SIZE / 2, PIN_SIZE + PIN_TIP],
    popupAnchor: [0, -(PIN_SIZE + PIN_TIP - 2)],
    html: pinElement(kind, src, label),
  });
}

function clusterIcon(total: number, kinds: MapPin['locationKind'][]): L.DivIcon {
  const color = kinds.includes('RESIDENCE') ? COLORS.RESIDENCE : COLORS.POLLING_PLACE;
  const size = total > 99 ? 48 : total > 9 ? 42 : 36;

  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;
                   border-radius:9999px;background:${color};color:#fff;font-weight:600;font-size:13px;
                   border:3px solid rgb(255 255 255 / 0.85);box-shadow:0 2px 6px rgb(16 24 40 / 0.3)">
        ${total}
      </span>`,
  });
}

/** Enquadra os pinos a cada mudanca de filtro ou de dados. */
function FitBounds({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  const signature = pins.map((pin) => `${pin.latitude},${pin.longitude}`).join('|');
  const last = useRef('');

  useEffect(() => {
    if (pins.length === 0 || last.current === signature) return;
    last.current = signature;

    const bounds = L.latLngBounds(pins.map((pin) => [pin.latitude, pin.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [map, pins, signature]);

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
function PinDetails({ pin, onOpenMember }: { pin: MapPin; onOpenMember: (memberId: string) => void }) {
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
      </div>
    </div>
  );
}

function ClusterMarker({
  cluster,
  onOpenMember,
}: {
  cluster: PinCluster;
  onOpenMember: (memberId: string) => void;
}) {
  const map = useMap();
  const single = cluster.pins.length === 1 ? cluster.pins[0] : null;

  // Sozinha, a pessoa aparece pela propria foto; agrupadas, vale a contagem.
  // O icone e guardado para a foto nao ser buscada de novo a cada desenho.
  const icon = useMemo(
    () =>
      single
        ? markerIcon(single.locationKind, single.memberPhoto, initials(single.memberName))
        : clusterIcon(cluster.pins.length, cluster.pins.map((pin) => pin.locationKind)),
    [cluster.pins, single],
  );

  if (single) {
    return (
      <Marker position={[single.latitude, single.longitude]} icon={icon}>
        <Popup>
          <PinDetails pin={single} onOpenMember={onOpenMember} />
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
        className="h-24 w-full rounded-control border border-line object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex h-24 w-full items-center justify-center rounded-control border border-line bg-ink-50 text-ink-400"
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
function PlaceVotes({ place }: { place: PollingPlacePin }) {
  return (
    <section className="rounded-control border border-brand-100 bg-brand-50 px-2.5 py-2">
      <p className="text-[0.6875rem] font-semibold tracking-wide text-brand-800 uppercase">
        {ESTIMATED_VOTES_LABEL}
      </p>
      <p className="text-2xl leading-tight font-semibold text-brand-900">
        {formatNumber(estimatedVotes(place))}
      </p>

      <dl className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-ink-500">
        {voteBreakdown(place).map((item) => (
          <div key={item.label} className="flex gap-1">
            <dt>{item.label}:</dt>
            <dd className="font-semibold text-ink-900">{formatNumber(item.value)}</dd>
          </div>
        ))}
      </dl>

      <PlaceSections place={place} compact />

      <p className="mt-1 text-[0.625rem] text-ink-500 italic">{ESTIMATED_VOTES_HINT}</p>
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
  onOpen,
}: {
  place: PollingPlacePin;
  onOpen: (place: PollingPlacePin) => void;
}) {
  // A fachada da escola no lugar do desenho; sem foto, fica o predio.
  const icon = useMemo(() => markerIcon('POLLING_PLACE', place.imageUrl), [place.imageUrl]);

  return (
    <Marker position={[place.latitude, place.longitude]} icon={icon}>
      <Popup>
        <div className="map-popup w-56 space-y-1.5">
          <PlaceImage place={place} />

          <p className="text-sm font-semibold text-ink-900">
            {place.title ?? 'Local de votação'}
          </p>
          {place.address ? <p className="text-xs text-ink-500">{place.address}</p> : null}
          <p className="text-xs text-ink-500">
            {[place.city, place.state].filter(Boolean).join('/') || '--'}
          </p>

          <PlaceVotes place={place} />

          <button
            type="button"
            onClick={() => onOpen(place)}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-control bg-brand-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-800"
          >
            Ver pessoas
          </button>
        </div>
      </Popup>
    </Marker>
  );
}

export default function MapCanvas({
  pins,
  places = [],
  onOpenPlace,
  onOpenMember,
}: {
  pins: MapPin[];
  places?: PollingPlacePin[];
  onOpenPlace?: (place: PollingPlacePin) => void;
  /** Abre a ficha da pessoa sobre o mapa, sem sair dele. */
  onOpenMember?: (memberId: string) => void;
}) {
  const [zoom, setZoom] = useState(4);
  const clusters = useMemo(() => clusterPins(pins, zoom), [pins, zoom]);
  const focus = useMemo(
    () => [...pins, ...places.map((place) => ({ ...place }) as unknown as MapPin)],
    [pins, places],
  );

  return (
    <MapContainer
      center={[-14.235, -51.9253]}
      zoom={4}
      scrollWheelZoom
      preferCanvas
      // Sem a faixa de credito no canto do mapa.
      attributionControl={false}
      className="h-full w-full"
    >
      <TileLayer url={TILE_URL} maxZoom={19} />

      <FitBounds pins={focus} />
      <ZoomWatcher onChange={setZoom} />

      {clusters.map((cluster) => (
        <ClusterMarker
          key={cluster.id}
          cluster={cluster}
          onOpenMember={onOpenMember ?? (() => {})}
        />
      ))}

      {places.map((place) => (
        <PlaceMarker key={place.locationId} place={place} onOpen={onOpenPlace ?? (() => {})} />
      ))}
    </MapContainer>
  );
}

/** Mantem o agrupamento coerente com o zoom atual. */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const update = () => onChange(map.getZoom());
    update();
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map, onChange]);

  return null;
}
