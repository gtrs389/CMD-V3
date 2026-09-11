'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapPin } from '@/lib/domain/map-pin';
import { clusterPins, pinLabel, precisionLabel, type PinCluster } from '@/lib/domain/map-pin';
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

function PinDetails({ pin }: { pin: MapPin }) {
  const residence = pin.locationKind === 'RESIDENCE';

  return (
    <div className="flex min-w-52 gap-2.5">
      <PinPhoto pin={pin} />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-semibold text-ink-900">{pin.memberName}</p>
        <p className="text-xs text-ink-500">{pin.clientName}</p>

        <p className="text-xs text-ink-700">{pinLabel(pin)}</p>
        {pin.district ? <p className="text-xs text-ink-500">{pin.district}</p> : null}
        <p className="text-xs text-ink-500">
          {[pin.city, pin.state].filter(Boolean).join('/') || '--'}
        </p>

        {residence ? (
          <p className="text-[0.6875rem] text-ink-500 italic">{precisionLabel(pin)}</p>
        ) : (
          <p className="text-xs text-ink-500">
            Zona {pin.zone ?? '--'} · Seção {pin.section ?? '--'}
          </p>
        )}

        <Link
          href={`/clientes/${pin.clientId}?integrante=${pin.memberId}`}
          className="mt-1 inline-flex min-h-9 items-center text-xs font-semibold text-brand-700 hover:text-brand-800"
        >
          Abrir ficha
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

export default function MapCanvas({ pins }: { pins: MapPin[] }) {
  const [zoom, setZoom] = useState(4);
  const clusters = useMemo(() => clusterPins(pins, zoom), [pins, zoom]);

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
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
        maxZoom={19}
      />

      <FitBounds pins={pins} />
      <ZoomWatcher onChange={setZoom} />

      {clusters.map((cluster) => (
        <ClusterMarker key={cluster.id} cluster={cluster} />
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
