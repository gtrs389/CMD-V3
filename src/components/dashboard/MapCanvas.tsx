'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin, PollingPlacePin } from '@/lib/domain/map-pin';
import { clusterPins, precisionLabel, type PinCluster } from '@/lib/domain/map-pin';
import { formatPhone } from '@/lib/utils/phone';
import { formatNumber } from '@/lib/utils/text';
import { initials } from '@/lib/utils/text';

/**
 * Desenho do mapa.
 *
 * Carregado apenas no navegador (o Leaflet depende de `window`), por isso
 * vive separado do cartao. Os tiles vem do OpenStreetMap, com a atribuicao
 * sempre visivel; nenhuma regiao ou nivel de zoom e pre-carregado.
 */

const TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Azul do CMD para a moradia; laranja para o local de votacao. */
const COLORS: Record<MapPin['locationKind'], string> = {
  RESIDENCE: '#1f4e6d',
  POLLING_PLACE: '#c2610a',
};

/** Desenho do pino: casa para moradia, predio para o local de votacao. */
const GLYPHS: Record<MapPin['locationKind'], string> = {
  RESIDENCE:
    '<path d="M4 10 L12 4 L20 10 V19 H14 V14 H10 V19 H4 Z" fill="none" stroke="white" stroke-width="1.8" stroke-linejoin="round"/>',
  POLLING_PLACE:
    '<path d="M4 19 H20 M5 19 V9 M19 19 V9 M12 3 L21 9 H3 Z M9 19 V13 H15 V19" fill="none" stroke="white" stroke-width="1.6" stroke-linejoin="round"/>',
};

function markerIcon(kind: MapPin['locationKind']): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [32, 40],
    iconAnchor: [16, 38],
    popupAnchor: [0, -34],
    html: `
      <span style="display:block;width:32px;height:40px;filter:drop-shadow(0 2px 3px rgb(16 24 40 / 0.35))">
        <svg viewBox="0 0 32 40" width="32" height="40" aria-hidden="true">
          <path d="M16 39C16 39 30 24.5 30 15.5A14 14 0 1 0 2 15.5C2 24.5 16 39 16 39Z" fill="${COLORS[kind]}"/>
          <g transform="translate(4 3) scale(0.5)">${GLYPHS[kind]}</g>
        </svg>
      </span>`,
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
  if (pin.memberPhoto) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={pin.memberPhoto}
        alt={`Foto de ${pin.memberName}`}
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
function PinDetails({ pin }: { pin: MapPin }) {
  const local = [pin.place, pin.district].filter(Boolean).join(' - ');
  const municipio = [pin.city, pin.state].filter(Boolean).join('/');

  return (
    <div className="flex min-w-52 gap-2.5">
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

        <Link
          href={`/candidatos/${pin.clientId}?integrante=${pin.memberId}`}
          className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          Ver ficha completa
        </Link>
      </div>
    </div>
  );
}

function ClusterMarker({ cluster }: { cluster: PinCluster }) {
  const map = useMap();
  const single = cluster.pins.length === 1 ? cluster.pins[0] : null;

  if (single) {
    return (
      <Marker position={[single.latitude, single.longitude]} icon={markerIcon(single.locationKind)}>
        <Popup>
          <PinDetails pin={single} />
        </Popup>
      </Marker>
    );
  }

  return (
    <Marker
      position={[cluster.latitude, cluster.longitude]}
      icon={clusterIcon(cluster.pins.length, cluster.pins.map((pin) => pin.locationKind))}
      eventHandlers={{
        click: () => map.setView([cluster.latitude, cluster.longitude], Math.min(map.getZoom() + 3, 18)),
      }}
    >
      <Popup>
        <div className="max-h-56 min-w-52 space-y-2 overflow-y-auto">
          <p className="text-xs font-semibold text-ink-700">
            {cluster.pins.length} integrantes neste ponto
          </p>
          {cluster.pins.map((pin) => (
            <PinDetails key={`${pin.memberId}-${pin.locationKind}`} pin={pin} />
          ))}
        </div>
      </Popup>
    </Marker>
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
  return (
    <Marker position={[place.latitude, place.longitude]} icon={markerIcon('POLLING_PLACE')}>
      <Popup>
        <div className="w-56 space-y-1.5">
          {place.imageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={place.imageUrl}
              alt={place.title ?? 'Local de votação'}
              className="h-24 w-full rounded-control border border-line object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-24 w-full items-center justify-center rounded-control border border-line bg-ink-50 text-ink-400"
            >
              <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4 20h16M5 20V10M19 20V10M12 3l9 7H3zM9 20v-6h6v6" />
              </svg>
            </span>
          )}

          <p className="text-sm font-semibold text-ink-900">
            {place.title ?? 'Local de votação'}
          </p>
          {place.address ? <p className="text-xs text-ink-500">{place.address}</p> : null}
          <p className="text-xs text-ink-500">
            {[place.city, place.state].filter(Boolean).join('/') || '--'}
          </p>

          <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-ink-500">
            <div className="col-span-2 flex gap-1">
              <dt>Pessoas que votam aqui:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(place.total)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Homens:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(place.men)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Mulheres:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(place.women)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Não informado:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(place.others)}</dd>
            </div>
            <div className="flex gap-1">
              <dt>Com telefone:</dt>
              <dd className="font-semibold text-ink-900">{formatNumber(place.withPhone)}</dd>
            </div>
          </dl>

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
}: {
  pins: MapPin[];
  places?: PollingPlacePin[];
  onOpenPlace?: (place: PollingPlacePin) => void;
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
      className="h-full w-full"
    >
      <TileLayer
        url={TILE_URL}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <FitBounds pins={focus} />
      <ZoomWatcher onChange={setZoom} />

      {clusters.map((cluster) => (
        <ClusterMarker key={cluster.id} cluster={cluster} />
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
