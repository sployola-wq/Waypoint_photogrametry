import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Maximize2,
  Trash2,
  Edit3,
  Check,
  MousePointer,
  Crosshair,
  RefreshCw,
} from 'lucide-react';
import { Waypoint, MissionData, WaypointPhase } from '../types/mission';
import { destinationPoint, calculateBearing, getPolygonCentroid } from '../utils/geoMath';

interface MapPlannerProps {
  mission: MissionData;
  onPolygonChange: (polygon: [number, number][]) => void;
  activeMapLayer: string;
  isSimulating: boolean;
  simulationWaypointIndex: number;
  gpsLocateTrigger?: number;
  onSelectWaypoint?: (wp: Waypoint | null) => void;
  onHomePointChange?: (homePoint: [number, number]) => void;
  onToggleSimulation?: () => void;
  onResetSimulation?: () => void;
}

const TILE_LAYERS: Record<string, { url: string; attribution: string; maxZoom: number }> = {
  'esri-sat': {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 19,
  },
  'google-sat': {
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps Satellite Hybrid',
    maxZoom: 20,
  },
  'osm-standard': {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  'carto-dark': {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CARTO &copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
};

function getPhaseColor(phase?: WaypointPhase): string {
  switch (phase) {
    case 'orbit-inner-75':
    case 'orbit-poi':
      return '#00E5FF'; // Cyan for Phase 1 / Orbit POI
    case 'orbit-outer-45':
    case 'grid-cross':
      return '#FFB300'; // Amber for Phase 3 Outer Orbit -45° / Cross Grid
    case 'imported':
      return '#38BDF8';
    case 'grid-nadir-90':
    case 'grid-primary':
    default:
      return '#00E676'; // Avionics Green for Nadir / Primary Grid
  }
}

export const MapPlanner: React.FC<MapPlannerProps> = ({
  mission,
  onPolygonChange,
  activeMapLayer,
  isSimulating,
  simulationWaypointIndex,
  gpsLocateTrigger,
  onSelectWaypoint,
  onHomePointChange,
  onResetSimulation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const prevAoiRef = useRef<string>('');
  const lastGpsTriggerRef = useRef<number>(0);

  // Synchronized callback and state refs
  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;

  const onHomePointChangeRef = useRef(onHomePointChange);
  onHomePointChangeRef.current = onHomePointChange;

  const onResetSimulationRef = useRef(onResetSimulation);
  onResetSimulationRef.current = onResetSimulation;

  const isSettingHomePointRef = useRef(false);

  // Layers for features
  const aoiLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const flightPathLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const waypointLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const transitLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const userLocationLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const footprintLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const droneSimMarkerRef = useRef<L.Marker | null>(null);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawPoints, setDrawPoints] = useState<[number, number][]>([]);
  const [selectedWp, setSelectedWp] = useState<Waypoint | null>(null);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSettingHomePoint, setIsSettingHomePoint] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<{
    loading: boolean;
    message: string;
    isError?: boolean;
  } | null>(null);

  useEffect(() => {
    isSettingHomePointRef.current = isSettingHomePoint;
  }, [isSettingHomePoint]);

  // Initialize Map strictly once on mount with Canvas Renderer
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter: [number, number] =
      mission.aoiPolygon.length > 0
        ? [mission.aoiPolygon[0][1], mission.aoiPolygon[0][0]]
        : [
            mission.parameters.homePoint?.[1] || -34.985,
            mission.parameters.homePoint?.[0] || -71.2405,
          ];

    const canvasRenderer = L.canvas({ padding: 0.5 });
    canvasRendererRef.current = canvasRenderer;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 16,
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      renderer: canvasRenderer,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomleft' }).addTo(map);

    let rafId: number | null = null;
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        setCursorCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        rafId = null;
      });
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isSettingHomePointRef.current) {
        if (onHomePointChangeRef.current) {
          onHomePointChangeRef.current([e.latlng.lng, e.latlng.lat]);
        }
        setIsSettingHomePoint(false);
      }
    });

    const layerConfig = TILE_LAYERS[activeMapLayer] || TILE_LAYERS['esri-sat'];
    const tileLayer = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    transitLayerGroupRef.current = L.layerGroup().addTo(map);
    aoiLayerGroupRef.current = L.layerGroup().addTo(map);
    flightPathLayerGroupRef.current = L.layerGroup().addTo(map);
    waypointLayerGroupRef.current = L.layerGroup().addTo(map);
    footprintLayerGroupRef.current = L.layerGroup().addTo(map);
    userLocationLayerGroupRef.current = L.layerGroup().addTo(map);

    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Base Tile Layer
  useEffect(() => {
    if (!mapRef.current) return;
    const layerConfig = TILE_LAYERS[activeMapLayer] || TILE_LAYERS['esri-sat'];
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    tileLayerRef.current = L.tileLayer(layerConfig.url, {
      attribution: layerConfig.attribution,
      maxZoom: layerConfig.maxZoom,
    }).addTo(mapRef.current);
  }, [activeMapLayer]);

  // Handle Map Click for Polygon Drawing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawing) return;
      const newPt: [number, number] = [e.latlng.lng, e.latlng.lat];
      setDrawPoints((prev) => [...prev, newPt]);
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isDrawing]);

  // Draw Camera Sensor Ground Footprint Rectangle (with Oblique Look-Ahead Offset support)
  const drawSensorFootprint = useCallback(
    (wp: Waypoint) => {
      const footprintGroup = footprintLayerGroupRef.current;
      if (!footprintGroup) return;

      footprintGroup.clearLayers();

      const { groundFootprintWidthM, groundFootprintHeightM } = mission.metrics;
      const halfW = groundFootprintWidthM / 2;
      const halfH = groundFootprintHeightM / 2;

      const droneOrigin: [number, number] = [wp.lng, wp.lat];
      const heading = wp.heading;

      // Compute waypoint-specific oblique look-ahead offset d = H * tan(90° - |Pitch|)
      const wpPitchAbs = Math.min(90, Math.max(10, Math.abs(wp.gimbalPitch)));
      const obliqueDeg = Math.min(80, Math.max(0, 90 - wpPitchAbs));
      const wpLookAheadM =
        obliqueDeg <= 0.5
          ? 0
          : Math.round(wp.altitude * Math.tan((obliqueDeg * Math.PI) / 180) * 10) / 10;

      const opticalCenter: [number, number] =
        wpLookAheadM > 0.2
          ? destinationPoint(droneOrigin, heading, wpLookAheadM)
          : droneOrigin;

      const cornersRel = [
        [-halfW, halfH],
        [halfW, halfH],
        [halfW, -halfH],
        [-halfW, -halfH],
      ];

      const rad = (heading * Math.PI) / 180;
      const cosH = Math.cos(rad);
      const sinH = Math.sin(rad);

      const footprintGeo: [number, number][] = cornersRel.map(([dx, dy]) => {
        const rotX = dx * cosH - dy * sinH;
        const rotY = dx * sinH + dy * cosH;
        const bearing = (Math.atan2(rotX, rotY) * 180) / Math.PI;
        const dist = Math.sqrt(rotX * rotX + rotY * rotY);
        const [cornerLng, cornerLat] = destinationPoint(
          opticalCenter,
          (bearing + 360) % 360,
          dist
        );
        return [cornerLat, cornerLng];
      });

      const phaseColor = getPhaseColor(wp.phase);

      L.polygon(footprintGeo, {
        color: phaseColor,
        weight: 1.5,
        dashArray: '3, 3',
        fillColor: phaseColor,
        fillOpacity: 0.2,
      }).addTo(footprintGroup);

      if (wpLookAheadM > 0.2) {
        L.polyline(
          [
            [droneOrigin[1], droneOrigin[0]],
            [opticalCenter[1], opticalCenter[0]],
          ],
          {
            color: '#FFB300',
            weight: 1.5,
            dashArray: '2, 4',
          }
        ).addTo(footprintGroup);

        L.circleMarker([opticalCenter[1], opticalCenter[0]], {
          radius: 3,
          color: '#FFB300',
          fillColor: '#FFB300',
          fillOpacity: 1,
        })
          .bindTooltip(`Centro Óptico (${wp.gimbalPitch}° · +${wpLookAheadM}m)`, {
            direction: 'top',
            className:
              'bg-[#15181E] border border-[#FFB300] text-[#FFB300] text-[9px] font-mono px-1.5 py-0.5 rounded',
          })
          .addTo(footprintGroup);
      }
    },
    [mission.metrics]
  );

  // Render Polygon and Draggable Vertex Handles
  useEffect(() => {
    const aoiGroup = aoiLayerGroupRef.current;
    const map = mapRef.current;
    if (!aoiGroup || !map) return;

    aoiGroup.clearLayers();

    const currentPoints = isDrawing ? drawPoints : mission.aoiPolygon;
    if (currentPoints.length === 0) return;

    const latLngs = currentPoints.map((pt) => [pt[1], pt[0]] as [number, number]);

    if (latLngs.length >= 3 && !isDrawing) {
      L.polygon(latLngs, {
        color: '#00E676',
        weight: 2,
        opacity: 0.9,
        fillColor: '#00E676',
        fillOpacity: 0.1,
        dashArray: '5, 5',
      }).addTo(aoiGroup);

      // Show POI Centroid target when Orbit POI or Combo 3DGS Pro is active
      if (
        mission.parameters.missionPattern === 'orbit-poi' ||
        mission.parameters.missionPattern === 'combo-3dgs-pro'
      ) {
        const [cLng, cLat] = getPolygonCentroid(currentPoints);
        const poiIcon = L.divIcon({
          className: 'poi-centroid-marker',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-6 h-6 rounded-full border border-[#00E5FF] bg-[#00E5FF]/20 flex items-center justify-center text-[10px]">
                🎯
              </div>
              <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#0F1115] border border-[#00E5FF] text-[#00E5FF] text-[8px] font-mono font-bold px-1 rounded whitespace-nowrap uppercase">
                POI Centro 3DGS
              </div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        L.marker([cLat, cLng], { icon: poiIcon, interactive: false }).addTo(aoiGroup);
      }

      currentPoints.forEach((pt, idx) => {
        const vertexIcon = L.divIcon({
          className: 'aoi-vertex-handle',
          html: `<div class="w-3 h-3 rounded-full bg-[#0F1115] border-2 border-[#00E676] hover:scale-125 transition-transform cursor-move shadow"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        });

        const marker = L.marker([pt[1], pt[0]], {
          icon: vertexIcon,
          draggable: true,
        }).addTo(aoiGroup);

        marker.bindTooltip(`Vértice #${idx + 1} (Arrastrar para ajustar)`, {
          permanent: false,
          direction: 'top',
          className:
            'bg-[#15181E] text-[#00E676] text-[10px] px-2 py-0.5 rounded border border-[#2D333F] font-mono',
        });

        marker.on('dragend', (ev) => {
          const newLatLng = ev.target.getLatLng();
          const updated = currentPoints.map((coord, cIdx) =>
            cIdx === idx ? ([newLatLng.lng, newLatLng.lat] as [number, number]) : coord
          );
          if (onPolygonChangeRef.current) {
            onPolygonChangeRef.current(updated);
          }
        });
      });
    } else if (isDrawing && latLngs.length > 0) {
      L.polyline(latLngs, {
        color: '#00E676',
        weight: 2,
        dashArray: '4, 4',
      }).addTo(aoiGroup);

      latLngs.forEach((ll) => {
        L.circleMarker(ll, {
          radius: 4,
          color: '#00E676',
          fillColor: '#00E676',
          fillOpacity: 1,
        }).addTo(aoiGroup);
      });
    }
  }, [mission.aoiPolygon, mission.parameters.missionPattern, drawPoints, isDrawing]);

  // Render Multi-Phase Flight Path, Heading Cones, Pilot Home, Transits & Battery Swap Breakpoints
  useEffect(() => {
    const flightGroup = flightPathLayerGroupRef.current;
    const waypointGroup = waypointLayerGroupRef.current;
    const transitGroup = transitLayerGroupRef.current;
    const map = mapRef.current;
    const canvasRenderer = canvasRendererRef.current || undefined;
    if (!flightGroup || !waypointGroup || !transitGroup || !map) return;

    flightGroup.clearLayers();
    waypointGroup.clearLayers();
    transitGroup.clearLayers();

    if (mission.waypoints.length === 0) return;

    // 1. Render Flight Path segmented by Phase so Combo 3DGS Pro / Double Grid colors shine clearly
    for (let i = 0; i < mission.waypoints.length - 1; i++) {
      const wpCurr = mission.waypoints[i];
      const wpNext = mission.waypoints[i + 1];
      const segColor = getPhaseColor(wpCurr.phase);

      L.polyline(
        [
          [wpCurr.lat, wpCurr.lng],
          [wpNext.lat, wpNext.lng],
        ],
        {
          color: segColor,
          weight: 2.3,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
          renderer: canvasRenderer,
        }
      ).addTo(flightGroup);
    }

    // Close loop visually if pure Orbit POI
    if (mission.parameters.missionPattern === 'orbit-poi' && mission.waypoints.length > 2) {
      const first = mission.waypoints[0];
      const last = mission.waypoints[mission.waypoints.length - 1];
      L.polyline(
        [
          [last.lat, last.lng],
          [first.lat, first.lng],
        ],
        {
          color: '#00E5FF',
          weight: 1.8,
          dashArray: '4, 4',
          opacity: 0.7,
          renderer: canvasRenderer,
        }
      ).addTo(flightGroup);
    }

    const firstWp = mission.waypoints[0];
    const lastWp = mission.waypoints[mission.waypoints.length - 1];

    const homeCoords: [number, number] = mission.parameters.homePoint
      ? [mission.parameters.homePoint[1], mission.parameters.homePoint[0]]
      : [firstWp.lat - 0.0003, firstWp.lng - 0.0003];

    // Pilot Home Marker (Draggable)
    const homeIconHtml = `
      <div class="relative group cursor-grab">
        <div class="w-8 h-8 rounded bg-[#0F1115] border-2 border-[#00E676] flex items-center justify-center text-[#00E676] font-bold text-xs shadow-[0_0_15px_rgba(0,230,118,0.6)] font-mono">
          <svg class="w-4 h-4 text-[#00E676]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
            <polyline points="9 22 9 12 15 12 15 22"></polyline>
          </svg>
        </div>
        <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-[#15181E] border border-[#00E676] text-[#00E676] text-[8px] font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap uppercase shadow">
          Pies del Piloto (HOME)
        </div>
      </div>
    `;

    const homeIcon = L.divIcon({
      className: 'custom-pilot-home-marker',
      html: homeIconHtml,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const homeMarker = L.marker(homeCoords, {
      icon: homeIcon,
      draggable: true,
    }).addTo(transitGroup);

    homeMarker.on('dragend', (e) => {
      const newPos = e.target.getLatLng();
      if (onHomePointChangeRef.current) {
        onHomePointChangeRef.current([newPos.lng, newPos.lat]);
      }
    });

    homeMarker.bindPopup(
      `<div class="p-2 font-mono text-xs text-[#E0E0E0] bg-[#15181E] rounded max-w-xs space-y-1.5">
        <div class="flex items-center gap-1.5 text-[#00E676] font-bold border-b border-[#2D333F] pb-1">
          <span>🏠 PUNTO DE DESPEGUE / PIES DEL PILOTO</span>
        </div>
        <p class="text-[11px] text-[#717885]">
          Ubicación física del piloto y estación de relevo de baterías / RTH.
        </p>
      </div>`
    );

    // 2. Start Point (WP #0) Marker
    if (firstWp) {
      const startIconHtml = `
        <div class="relative group cursor-pointer">
          <div class="w-7 h-7 rounded-full bg-[#00E676] text-black border-2 border-white flex items-center justify-center font-bold text-[10px] shadow-[0_0_18px_rgba(0,230,118,0.9)] font-mono">
            #0
          </div>
          <div class="absolute -top-5 left-1/2 -translate-x-1/2 bg-[#0F1115] border border-[#00E676] text-[#00E676] text-[8px] font-mono font-bold px-1.5 py-0.5 rounded whitespace-nowrap uppercase shadow">
            INICIO MISIÓN
          </div>
        </div>
      `;

      const startIcon = L.divIcon({
        className: 'custom-start-point-marker',
        html: startIconHtml,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([firstWp.lat, firstWp.lng], { icon: startIcon, zIndexOffset: 400 })
        .addTo(waypointGroup)
        .bindPopup(
          `<div class="p-2 font-mono text-xs text-[#E0E0E0] bg-[#15181E] rounded max-w-xs space-y-1.5">
            <div class="flex items-center gap-1.5 text-[#00E676] font-bold border-b border-[#2D333F] pb-1">
              <span>📍 PUNTO DE INICIO DE MISIÓN (WP #0)</span>
            </div>
            <p class="text-[11px] text-[#E0E0E0]">
              Fase: <strong>${firstWp.phaseLabel || 'Inicio'}</strong> | Gimbal: <strong>${firstWp.gimbalPitch}°</strong> | Altitud: <strong>${firstWp.altitude}m</strong>.
            </p>
          </div>`
        );
    }

    // 3. Takeoff & Initial Transit Line (Home -> WP #0)
    L.polyline([homeCoords, [firstWp.lat, firstWp.lng]], {
      color: '#00E676',
      weight: 2.2,
      dashArray: '6, 6',
      opacity: 0.9,
      renderer: canvasRenderer,
    }).addTo(transitGroup);

    // 4. Final Return to Home Line (Last WP -> Home)
    L.polyline([[lastWp.lat, lastWp.lng], homeCoords], {
      color: '#F27D26',
      weight: 2,
      dashArray: '6, 6',
      opacity: 0.85,
      renderer: canvasRenderer,
    }).addTo(transitGroup);

    // 5. Waypoint markers, Heading Direction Arrows & Battery Swap Breakpoints
    const isLargeMission = mission.waypoints.length > 250;
    const markerRadius = isLargeMission ? 2.5 : 3.5;

    for (let i = 0; i < mission.waypoints.length; i++) {
      const wp = mission.waypoints[i];
      const phaseColor = getPhaseColor(wp.phase);

      // Draw directional camera heading arrow/ray on Orbit points or every Nth point so pilot sees camera yaw
      const isOrbitWp =
        wp.phase === 'orbit-poi' ||
        wp.phase === 'orbit-inner-75' ||
        wp.phase === 'orbit-outer-45';
      const shouldDrawHeadingRay =
        isOrbitWp || !isLargeMission || i % 4 === 0 || wp.id === selectedWp?.id;

      if (shouldDrawHeadingRay) {
        const rayLenM = isOrbitWp ? 14 : 9;
        const [tipLng, tipLat] = destinationPoint([wp.lng, wp.lat], wp.heading, rayLenM);
        L.polyline(
          [
            [wp.lat, wp.lng],
            [tipLat, tipLng],
          ],
          {
            color: phaseColor,
            weight: isOrbitWp ? 2 : 1.4,
            opacity: 0.85,
            renderer: canvasRenderer,
          }
        ).addTo(flightGroup);
      }

      if (wp.isBatterySwapPoint) {
        const batIconHtml = `
          <div class="relative group cursor-pointer">
            <div class="w-7 h-7 rounded bg-[#F27D26] text-black border border-white flex items-center justify-center font-bold text-xs shadow-[0_0_15px_rgba(242,125,38,0.8)] font-mono">
              🔋
            </div>
            <div class="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#0F1115] border border-[#F27D26] text-[#F27D26] text-[8px] font-mono font-bold px-1 rounded whitespace-nowrap uppercase">
              Bat ${wp.batteryIndex}⇄${(wp.batteryIndex || 1) + 1}
            </div>
          </div>
        `;

        const batIcon = L.divIcon({
          className: 'custom-battery-swap-marker',
          html: batIconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.polyline([[wp.lat, wp.lng], homeCoords], {
          color: '#F27D26',
          weight: 1.5,
          dashArray: '4, 4',
          opacity: 0.65,
          renderer: canvasRenderer,
        }).addTo(transitGroup);

        L.marker([wp.lat, wp.lng], { icon: batIcon }).addTo(waypointGroup);
      }

      const isSelected = wp.id === selectedWp?.id;
      const marker = L.circleMarker([wp.lat, wp.lng], {
        renderer: canvasRenderer,
        radius: isSelected ? 6 : wp.isBatterySwapPoint ? 5 : markerRadius,
        color: isSelected ? '#FFFFFF' : wp.isBatterySwapPoint ? '#F27D26' : phaseColor,
        weight: isSelected || wp.isBatterySwapPoint ? 2 : 1,
        fillColor: isSelected ? phaseColor : wp.isBatterySwapPoint ? '#F27D26' : phaseColor,
        fillOpacity: 0.9,
      }).addTo(waypointGroup);

      const getTooltipHtml = (w: Waypoint) =>
        `<div class="font-mono text-[10px] leading-tight">
          <div class="font-bold" style="color:${getPhaseColor(w.phase)}">WP #${w.id} · ${
          w.phaseLabel || 'Misión'
        }</div>
          <div class="text-[#E0E0E0]">Alt: ${w.altitude}m ${
          w.terrainDeltaM ? `(Δ Cota ${w.terrainDeltaM > 0 ? '+' : ''}${w.terrainDeltaM}m)` : ''
        } | Vel: ${w.speed}m/s</div>
          <div class="text-[#A0AAB8]">Yaw Cámara: ${w.heading}° | Gimbal: ${
          w.gimbalPitch
        }° | Acción: ${w.actionType || 'takePhoto'}</div>
        </div>`;

      marker.on('click', () => {
        setSelectedWp(wp);
        if (onSelectWaypoint) onSelectWaypoint(wp);
        drawSensorFootprint(wp);
      });

      if (!isLargeMission) {
        marker.bindTooltip(getTooltipHtml(wp), {
          direction: 'top',
          className:
            'bg-[#15181E] border border-[#2D333F] text-[#E0E0E0] rounded p-1.5 shadow-2xl font-mono',
        });
      } else {
        marker.on('mouseover', () => {
          if (!marker.getTooltip()) {
            marker
              .bindTooltip(getTooltipHtml(wp), {
                direction: 'top',
                className:
                  'bg-[#15181E] border border-[#2D333F] text-[#E0E0E0] rounded p-1.5 shadow-2xl font-mono',
              })
              .openTooltip();
          }
        });
      }
    }
  }, [
    mission.waypoints,
    mission.parameters.missionPattern,
    mission.parameters.homePoint,
    mission.parameters.batteryFlightTimeMin,
    mission.parameters.takeOffSecurityHeight,
    mission.parameters.rthAltitude,
    mission.parameters.altitude,
    mission.parameters.gimbalPitch,
    selectedWp,
    drawSensorFootprint,
    onSelectWaypoint,
  ]);

  // Drone Simulation Marker Animation & Telemetry State
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!isSimulating || mission.waypoints.length === 0) {
      if (droneSimMarkerRef.current) {
        map.removeLayer(droneSimMarkerRef.current);
        droneSimMarkerRef.current = null;
      }
      return;
    }

    const firstWp = mission.waypoints[0];
    const lastWp = mission.waypoints[mission.waypoints.length - 1];
    const homeLngLat: [number, number] = mission.parameters.homePoint || [
      firstWp.lng - 0.0003,
      firstWp.lat - 0.0003,
    ];
    const homeCoords: [number, number] = [homeLngLat[1], homeLngLat[0]];

    let simLat = firstWp.lat;
    let simLng = firstWp.lng;
    let simHeading = firstWp.heading;

    if (simulationWaypointIndex === -2) {
      simLat = homeCoords[0];
      simLng = homeCoords[1];
      simHeading = calculateBearing(homeLngLat, [firstWp.lng, firstWp.lat]);
    } else if (simulationWaypointIndex === -1) {
      simLat = (homeCoords[0] + firstWp.lat) / 2;
      simLng = (homeCoords[1] + firstWp.lng) / 2;
      simHeading = calculateBearing(homeLngLat, [firstWp.lng, firstWp.lat]);
    } else if (
      simulationWaypointIndex >= 0 &&
      simulationWaypointIndex < mission.waypoints.length
    ) {
      const currentWp = mission.waypoints[simulationWaypointIndex];
      simLat = currentWp.lat;
      simLng = currentWp.lng;
      simHeading = currentWp.heading;
      drawSensorFootprint(currentWp);
    } else if (simulationWaypointIndex === mission.waypoints.length) {
      simLat = (lastWp.lat + homeCoords[0]) / 2;
      simLng = (lastWp.lng + homeCoords[1]) / 2;
      simHeading = calculateBearing([lastWp.lng, lastWp.lat], homeLngLat);
    } else {
      simLat = homeCoords[0];
      simLng = homeCoords[1];
      simHeading = 0;
    }

    const droneIconHtml = `
      <div class="relative flex items-center justify-center">
        <div class="w-9 h-9 rounded-full bg-[#00E676]/25 border border-[#00E676]/60 flex items-center justify-center animate-ping absolute"></div>
        <div class="w-8 h-8 rounded-full bg-[#0F1115] border-2 border-[#00E676] flex items-center justify-center shadow-[0_0_18px_rgba(0,230,118,0.7)] text-[#00E676]" style="transform: rotate(${
          simHeading - 45
        }deg)">
          <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
      </div>
    `;

    const droneIcon = L.divIcon({
      className: 'drone-simulation-marker',
      html: droneIconHtml,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    if (!droneSimMarkerRef.current) {
      droneSimMarkerRef.current = L.marker([simLat, simLng], {
        icon: droneIcon,
        zIndexOffset: 1000,
      }).addTo(map);
    } else {
      droneSimMarkerRef.current.setLatLng([simLat, simLng]);
      droneSimMarkerRef.current.setIcon(droneIcon);
    }
  }, [
    isSimulating,
    simulationWaypointIndex,
    mission.waypoints,
    mission.parameters.homePoint,
    mission.parameters.takeOffSecurityHeight,
    drawSensorFootprint,
  ]);

  // Auto-fit bounds when a new polygon is loaded
  useEffect(() => {
    const currentKey = JSON.stringify(mission.aoiPolygon);
    if (currentKey !== prevAoiRef.current) {
      prevAoiRef.current = currentKey;
      if (mission.aoiPolygon.length >= 3 && !isDrawing && mapRef.current) {
        const latLngs = mission.aoiPolygon.map((pt) => [pt[1], pt[0]] as [number, number]);
        mapRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50], maxZoom: 18 });
      }
    }
  }, [mission.aoiPolygon, isDrawing]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map || mission.aoiPolygon.length === 0) return;
    const latLngs = mission.aoiPolygon.map((pt) => [pt[1], pt[0]] as [number, number]);
    map.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50], maxZoom: 18 });
  };

  const handleStartDraw = () => {
    setIsDrawing(true);
    setDrawPoints([]);
    footprintLayerGroupRef.current?.clearLayers();
  };

  const handleFinishDraw = () => {
    if (drawPoints.length >= 3) {
      onPolygonChange(drawPoints);
      setIsDrawing(false);
      setDrawPoints([]);
    }
  };

  const handleCancelDraw = () => {
    setIsDrawing(false);
    setDrawPoints([]);
  };

  // Core Geolocation & Clean Canvas Handler
  const handleLocateUserGPS = useCallback(
    (clearCanvas = true) => {
      if (clearCanvas) {
        if (onPolygonChangeRef.current) {
          onPolygonChangeRef.current([]);
        }
        setSelectedWp(null);
        footprintLayerGroupRef.current?.clearLayers();
        if (onResetSimulationRef.current) {
          onResetSimulationRef.current();
        }
      }

      setGpsStatus({
        loading: true,
        message: 'Localizando tu posición satelital GPS...',
      });

      const displayLocationOnMap = (
        lat: number,
        lng: number,
        accuracy: number,
        isFallback = false
      ) => {
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 17, {
            animate: true,
            duration: 1.0,
          });
          setTimeout(() => {
            mapRef.current?.invalidateSize();
          }, 300);
        }

        if (onHomePointChangeRef.current) {
          onHomePointChangeRef.current([lng, lat]);
        }

        if (userLocationLayerGroupRef.current) {
          userLocationLayerGroupRef.current.clearLayers();
          const userIcon = L.divIcon({
            className: 'custom-user-gps-beacon',
            html: `
            <div class="relative flex items-center justify-center">
              <div class="w-10 h-10 rounded-full bg-[#00E676]/30 border border-[#00E676] animate-ping absolute"></div>
              <div class="w-6 h-6 rounded-full bg-[#0F1115] border-2 border-[#00E676] shadow-[0_0_15px_rgba(0,230,118,0.9)] flex items-center justify-center text-[#00E676] font-bold text-[10px]">
                📍
              </div>
            </div>
          `,
            iconSize: [40, 40],
            iconAnchor: [20, 20],
          });

          const marker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 800 })
            .addTo(userLocationLayerGroupRef.current)
            .bindPopup(
              `<div class="p-2 font-mono text-xs text-[#E0E0E0] bg-[#15181E] rounded max-w-xs space-y-1">
              <div class="text-[#00E676] font-bold flex items-center gap-1">
                <span>📍 ${isFallback ? 'POSICIÓN HOME ACTUAL' : 'TU POSICIÓN GPS ACTUAL'}</span>
              </div>
              <p class="text-[11px] text-[#A0AAB8]">Lat: ${lat.toFixed(6)}, Lng: ${lng.toFixed(6)}</p>
            </div>`
            );
          marker.openPopup();
        }

        if (isFallback) {
          setGpsStatus({
            loading: false,
            isError: true,
            message:
              '⚠️ Permiso de ubicación no disponible. Plano centrado en el Punto de Inicio actual.',
          });
        } else {
          setGpsStatus({
            loading: false,
            message: `✅ Ubicación GPS localizada (${lat.toFixed(5)}, ${lng.toFixed(
              5
            )} · Precisión ±${accuracy}m).`,
          });
        }

        setTimeout(() => {
          setGpsStatus(null);
        }, 5000);
      };

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = Math.round(pos.coords.accuracy || 10);
            displayLocationOnMap(lat, lng, accuracy, false);
          },
          () => {
            const fallbackLat = mission.parameters.homePoint?.[1] || -34.985;
            const fallbackLng = mission.parameters.homePoint?.[0] || -71.2405;
            displayLocationOnMap(fallbackLat, fallbackLng, 50, true);
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          }
        );
      } else {
        const fallbackLat = mission.parameters.homePoint?.[1] || -34.985;
        const fallbackLng = mission.parameters.homePoint?.[0] || -71.2405;
        displayLocationOnMap(fallbackLat, fallbackLng, 50, true);
      }
    },
    [mission.parameters.homePoint]
  );

  useEffect(() => {
    if (
      gpsLocateTrigger &&
      gpsLocateTrigger > 0 &&
      gpsLocateTrigger !== lastGpsTriggerRef.current
    ) {
      lastGpsTriggerRef.current = gpsLocateTrigger;
      handleLocateUserGPS(true);
    }
  }, [gpsLocateTrigger, handleLocateUserGPS]);

  const handleClearPolygon = () => {
    handleLocateUserGPS(true);
  };

  return (
    <div className="relative flex-1 h-full w-full overflow-hidden select-none bg-[#0B0D11]">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full z-10" />

      {/* Floating Map Overlay HUD Controls */}
      <div className="absolute top-3 left-3 z-20 flex flex-col gap-2">
        {/* Drawing & Edit Toolbar */}
        <div className="bg-[#15181E]/95 border border-[#2D333F] rounded p-1 shadow-2xl backdrop-blur-md flex items-center gap-1.5">
          {!isDrawing ? (
            <>
              <button
                id="btn-draw-polygon-aoi"
                type="button"
                onClick={handleStartDraw}
                className="px-3 py-1.5 rounded bg-[#00E676] hover:bg-[#00C853] text-[#000] font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,230,118,0.2)] transition-all font-mono"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>
                  {mission.aoiPolygon.length > 0 ? 'Redibujar AOI' : 'Dibujar Polígono AOI'}
                </span>
              </button>

              <button
                id="btn-set-home-point"
                type="button"
                onClick={() => setIsSettingHomePoint(!isSettingHomePoint)}
                title="Fijar punto de despegue y aterrizaje (Pies del Piloto)"
                className={`px-2.5 py-1.5 rounded text-xs uppercase font-mono flex items-center gap-1.5 border transition-all ${
                  isSettingHomePoint
                    ? 'bg-[#00E676] text-black border-[#00E676] font-bold'
                    : 'bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border-[#2D333F]'
                }`}
              >
                <Crosshair className="w-3.5 h-3.5 text-[#00E676]" />
                <span className="hidden sm:inline">Pies Piloto (HOME)</span>
              </button>

              <button
                id="btn-locate-gps-toolbar"
                type="button"
                onClick={() => handleLocateUserGPS(true)}
                title="Limpiar plan de vuelo y ubicar mapa en mi posición GPS"
                className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] hover:text-[#00E676] border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-mono"
              >
                <MapPin className="w-3.5 h-3.5 text-[#00E676]" />
                <span className="hidden sm:inline">Mi GPS</span>
              </button>

              {mission.aoiPolygon.length > 0 && (
                <>
                  <button
                    id="btn-fit-bounds-map"
                    type="button"
                    onClick={handleFitBounds}
                    title="Ajustar vista al polígono"
                    className="p-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F] transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    id="btn-clear-polygon"
                    type="button"
                    onClick={handleClearPolygon}
                    title="Limpiar plano de vuelo y ubicar mapa en mi posición GPS"
                    className="p-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#F27D26] hover:text-[#FF5252] border border-[#2D333F] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1">
              <span className="text-xs text-[#00E676] font-mono flex items-center gap-1.5">
                <MousePointer className="w-3.5 h-3.5" />
                <span>Haz clic en el mapa para añadir vértices ({drawPoints.length})</span>
              </span>

              <button
                id="btn-confirm-polygon"
                type="button"
                onClick={handleFinishDraw}
                disabled={drawPoints.length < 3}
                className="px-2.5 py-1 rounded bg-[#00E676] hover:bg-[#00C853] text-black font-bold text-xs uppercase font-mono flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finalizar ({drawPoints.length >= 3 ? 'Listo' : 'Min 3'})</span>
              </button>

              <button
                type="button"
                onClick={handleCancelDraw}
                className="px-2 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#717885] hover:text-white text-xs font-mono"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Set Home Point Prompt */}
        {isSettingHomePoint && (
          <div className="bg-[#15181E] border border-[#00E676] rounded px-3 py-1.5 shadow-2xl text-xs font-mono text-[#00E676] flex items-center gap-2">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Haz clic en el mapa donde estás ubicado (Pies del Piloto / Punto Despegue)</span>
          </div>
        )}

        {/* GPS Geolocation Status Notification Banner */}
        {gpsStatus && (
          <div
            className={`px-3 py-2 rounded shadow-2xl text-xs font-mono border backdrop-blur-md flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200 ${
              gpsStatus.isError
                ? 'bg-[#1C1518]/95 border-[#FF5252] text-[#FF5252]'
                : gpsStatus.loading
                ? 'bg-[#15181E]/95 border-[#00E676]/60 text-[#00E676]'
                : 'bg-[#15181E]/95 border-[#00E676] text-[#00E676]'
            }`}
          >
            {gpsStatus.loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#00E676]" />
            ) : (
              <MapPin className="w-3.5 h-3.5 text-[#00E676]" />
            )}
            <span className="font-semibold">{gpsStatus.message}</span>
          </div>
        )}
      </div>

      {/* Live Simulation HUD Overlay when active */}
      {isSimulating &&
        mission.waypoints.length > 0 &&
        (() => {
          const firstWp = mission.waypoints[0];
          const lastWp = mission.waypoints[mission.waypoints.length - 1];
          const homeLngLat: [number, number] = mission.parameters.homePoint || [
            firstWp.lng - 0.0003,
            firstWp.lat - 0.0003,
          ];

          let phaseTitle = 'Fotogrametría Activa';
          let phaseSubtitle = `WP ${simulationWaypointIndex + 1} de ${mission.waypoints.length}`;
          let currentAlt = mission.parameters.altitude;
          let currentSpeed = mission.parameters.speed;
          let currentHeading = 0;
          let currentGimbal = mission.parameters.gimbalPitch;
          let currentPhotos = 0;
          let progressPct = 0;

          if (simulationWaypointIndex === -2) {
            phaseTitle = 'Despegue Vertical Autónomo';
            phaseSubtitle = `Ascendiendo a ${mission.parameters.takeOffSecurityHeight || 30}m en Pies del Piloto`;
            currentAlt = mission.parameters.takeOffSecurityHeight || 30;
            currentSpeed = 2;
            currentHeading = Math.round(calculateBearing(homeLngLat, [firstWp.lng, firstWp.lat]));
            currentGimbal = 0;
            progressPct = 2;
          } else if (simulationWaypointIndex === -1) {
            phaseTitle = 'Tránsito Autónomo al Punto de Inicio';
            phaseSubtitle = `Volando a WP #0 a ${mission.parameters.takeOffSecurityHeight || 30}m de altura`;
            currentAlt = mission.parameters.takeOffSecurityHeight || 30;
            currentSpeed = mission.parameters.speed;
            currentHeading = Math.round(calculateBearing(homeLngLat, [firstWp.lng, firstWp.lat]));
            currentGimbal = 0;
            progressPct = 6;
          } else if (
            simulationWaypointIndex >= 0 &&
            simulationWaypointIndex < mission.waypoints.length
          ) {
            const currentWp = mission.waypoints[simulationWaypointIndex];
            currentAlt = currentWp.altitude;
            currentSpeed = currentWp.speed;
            currentHeading = currentWp.heading;
            currentGimbal = currentWp.gimbalPitch;
            currentPhotos = mission.waypoints
              .slice(0, simulationWaypointIndex + 1)
              .filter((w) => w.isPhotoPoint).length;
            progressPct =
              Math.round(((simulationWaypointIndex + 1) / mission.waypoints.length) * 90) + 6;

            if (currentWp.isBatterySwapPoint) {
              phaseTitle = `Breakpoint de Batería #${currentWp.batteryIndex}`;
              phaseSubtitle = `Límite de vuelo alcanzado | RTH para recambio y reanudación`;
            } else {
              phaseTitle = currentWp.phaseLabel || 'Fotogrametría Activa';
              phaseSubtitle = `WP #${currentWp.id} | Yaw Cámara ${currentHeading}° | Gimbal ${currentGimbal}°`;
            }
          } else if (simulationWaypointIndex === mission.waypoints.length) {
            phaseTitle = 'Retorno Automático a Casa (RTH)';
            phaseSubtitle = `Regresando a Pies del Piloto a ${
              mission.parameters.rthAltitude || mission.parameters.altitude
            }m`;
            currentAlt = mission.parameters.rthAltitude || mission.parameters.altitude;
            currentSpeed = mission.parameters.speed;
            currentHeading = Math.round(calculateBearing([lastWp.lng, lastWp.lat], homeLngLat));
            currentGimbal = 0;
            currentPhotos = mission.metrics.photoCount;
            progressPct = 98;
          } else {
            phaseTitle = 'Misión Completada - Aterrizado';
            phaseSubtitle = 'Drone en Pies del Piloto | 100% Ruta Ejecutada';
            currentAlt = 0;
            currentSpeed = 0;
            currentHeading = 0;
            currentGimbal = 0;
            currentPhotos = mission.metrics.photoCount;
            progressPct = 100;
          }

          return (
            <div
              id="flight-simulation-hud"
              className="absolute bottom-4 left-4 z-20 bg-[#15181E]/95 border border-[#00E676]/40 rounded p-3 shadow-2xl backdrop-blur-md max-w-md w-full font-mono text-xs text-[#E0E0E0] animate-in fade-in space-y-2 tabular-nums"
            >
              <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#00E676] animate-ping" />
                  <div>
                    <span className="font-bold text-[#00E676] uppercase tracking-wider text-xs block">
                      {phaseTitle}
                    </span>
                    <span className="text-[9px] text-[#A0AAB8]">{phaseSubtitle}</span>
                  </div>
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F]">
                  {simulationWaypointIndex < 0
                    ? 'FASE PREVIA'
                    : simulationWaypointIndex >= mission.waypoints.length
                    ? 'RTH / FIN'
                    : `WP ${simulationWaypointIndex + 1}/${mission.waypoints.length}`}
                </span>
              </div>

              <div className="w-full bg-[#1C1F26] rounded-full h-1.5 overflow-hidden flex">
                <div
                  className="bg-[#00E676] h-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">ALTITUD AGL</span>
                  <span className="text-white font-bold">{currentAlt} m</span>
                </div>
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">VELOCIDAD</span>
                  <span className="text-white font-bold">{currentSpeed} m/s</span>
                </div>
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">YAW CÁMARA</span>
                  <span className="text-[#00E5FF] font-bold">{currentHeading}°</span>
                </div>
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">PITCH GIMBAL</span>
                  <span className="text-[#00E676] font-bold">{currentGimbal}°</span>
                </div>
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">CAPTURA</span>
                  <span className="text-[#00E676] font-bold">
                    {mission.parameters.waypointAction === 'recordVideo'
                      ? 'REC 4K 3DGS'
                      : `${currentPhotos} / ${mission.metrics.photoCount}`}
                  </span>
                </div>
                <div>
                  <span className="text-[#717885] block text-[8px] uppercase">TIEMPO VUELO</span>
                  <span className="text-[#F27D26] font-bold">
                    {simulationWaypointIndex < 0
                      ? '0m 15s'
                      : `${Math.floor(
                          (mission.waypoints[
                            Math.min(
                              mission.waypoints.length - 1,
                              Math.max(0, simulationWaypointIndex)
                            )
                          ]?.estimatedTimeSec || 0) / 60
                        )}m ${
                          (mission.waypoints[
                            Math.min(
                              mission.waypoints.length - 1,
                              Math.max(0, simulationWaypointIndex)
                            )
                          ]?.estimatedTimeSec || 0) % 60
                        }s`}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Map Legend with Multi-Phase 3DGS Color Key */}
      <div
        id="map-legend"
        className="absolute top-3 right-3 z-20 bg-[#15181E]/95 border border-[#2D333F] rounded p-2.5 shadow-2xl backdrop-blur-md hidden md:block text-[10px] font-mono space-y-1.5 text-[#E0E0E0]"
      >
        <div className="text-[9px] uppercase tracking-wider text-[#00E676] font-bold border-b border-[#2D333F] pb-1">
          Simbología & Fases 3DGS
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#00E5FF]" />
          <span className="text-[#00E5FF]">Fase 1: Órbita Interna (-75° ➔ POI)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#00E676]" />
          <span className="text-[#00E676]">Fase 2: Grilla Lawnmower (-90° Nadir)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-0.5 bg-[#FFB300]" />
          <span className="text-[#FFB300]">Fase 3: Órbita Externa +15% (-45°)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00E676] text-black font-bold flex items-center justify-center text-[7px]">
            #0
          </div>
          <span className="text-white font-medium">Punto de Inicio (WP #0) + Vector Yaw</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#0F1115] border border-[#00E676] text-[#00E676] font-bold flex items-center justify-center text-[8px]">
            🏠
          </div>
          <span className="text-white font-medium">Pies del Piloto (Despegue/RTH)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-[#F27D26] text-black font-bold flex items-center justify-center text-[8px]">
            🔋
          </div>
          <span className="text-[#F27D26]">Breakpoint Recambio Batería</span>
        </div>
      </div>

      {/* Live Coordinate Badge at bottom center */}
      {cursorCoords && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-[#15181E]/90 border border-[#2D333F] rounded px-3 py-1 shadow-2xl backdrop-blur-md hidden sm:flex items-center gap-3 text-[10px] font-mono text-[#E0E0E0] tabular-nums">
          <span className="text-[#717885]">LAT:</span>
          <span className="text-[#00E676]">{cursorCoords.lat.toFixed(6)}°</span>
          <span className="text-[#717885]">LON:</span>
          <span className="text-[#00E676]">{cursorCoords.lng.toFixed(6)}°</span>
          <span className="text-[#717885]">WGS84</span>
        </div>
      )}
    </div>
  );
};
