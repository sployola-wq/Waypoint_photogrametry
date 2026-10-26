import React, { useState, useRef } from 'react';
import {
  Sliders,
  Plane,
  Compass,
  ArrowUpRight,
  Shield,
  Download,
  RotateCw,
  Eye,
  AlertCircle,
  Sparkles,
  ChevronDown,
  BatteryCharging,
  Home,
  Navigation,
  RotateCcw,
  Upload,
  FileJson,
  Grid,
  Orbit,
  Layers,
  ArrowLeftRight,
  CornerUpRight,
  Mountain,
  Video,
  Camera,
  Clock,
  ClipboardPaste,
  CheckCircle2,
} from 'lucide-react';
import {
  MissionParameters,
  CustomSensorConfig,
  PhotogrammetryMetrics,
  MissionPattern,
  ImportedKmzMetadata,
} from '../types/mission';
import { DRONE_PROFILES, DEFAULT_DRONE_PROFILE } from '../utils/droneProfiles';
import { clampNumber } from '../utils/gridGenerator';
import { TelemetryCard } from './TelemetryCard';

interface MissionPanelProps {
  parameters: MissionParameters;
  metrics: PhotogrammetryMetrics;
  hasPolygon: boolean;
  importedKmzMeta?: ImportedKmzMetadata | null;
  isFetchingTerrain?: boolean;
  terrainSourceLabel?: string | null;
  onParametersChange: (newParams: Partial<MissionParameters>) => void;
  onOptimizeFlightAngle: () => void;
  onFetchTerrainDem: () => void;
  onExportKmz: () => void;
  onExportKml: () => void;
  onExportGeoJson: () => void;
  onExportCsv: () => void;
  onExportMissionJson: () => void;
  onImportMissionJson: (jsonText: string) => void;
  onImportKmzFile: (file: File) => void;
  onResetDefaults: () => void;
  isExporting: boolean;
}

export const MissionPanel: React.FC<MissionPanelProps> = ({
  parameters,
  metrics,
  hasPolygon,
  importedKmzMeta,
  isFetchingTerrain,
  terrainSourceLabel,
  onParametersChange,
  onOptimizeFlightAngle,
  onFetchTerrainDem,
  onExportKmz,
  onExportKml,
  onExportGeoJson,
  onExportCsv,
  onExportMissionJson,
  onImportMissionJson,
  onImportKmzFile,
  onResetDefaults,
  isExporting,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showCustomSensor, setShowCustomSensor] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showPasteJsonBox, setShowPasteJsonBox] = useState(false);
  const [pastedJsonText, setPastedJsonText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedDrone =
    DRONE_PROFILES.find((d) => d.id === parameters.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const isAir3S = selectedDrone.id.startsWith('dji-air-3s');
  const isOblique = Math.abs(parameters.gimbalPitch) < 89;

  const handleDroneChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const droneId = e.target.value;
    const nextDrone = DRONE_PROFILES.find((d) => d.id === droneId) || DEFAULT_DRONE_PROFILE;
    const patch: Partial<MissionParameters> = {
      droneProfileId: droneId,
      speed: Math.min(parameters.speed, nextDrone.maxSpeedMs),
    };
    if (nextDrone.recommendedSafeBatteryMin) {
      patch.batteryFlightTimeMin = nextDrone.recommendedSafeBatteryMin;
    }
    onParametersChange(patch);
    if (droneId === 'custom') {
      setShowCustomSensor(true);
    }
  };

  const handlePatternSelect = (pattern: MissionPattern) => {
    const patch: Partial<MissionParameters> = { missionPattern: pattern };
    if (pattern === 'double-grid' && parameters.gimbalPitch === -90) {
      patch.gimbalPitch = -65;
    } else if (pattern === 'orbit-poi' && parameters.gimbalPitch === -90) {
      patch.gimbalPitch = -60;
    } else if (pattern === 'single-grid' && parameters.missionPattern !== 'single-grid') {
      patch.gimbalPitch = -90;
    }
    onParametersChange(patch);
  };

  const handleCustomSensorChange = (field: keyof CustomSensorConfig, value: number) => {
    const current = parameters.customSensor || {
      sensorWidthMm: selectedDrone.sensorWidthMm,
      sensorHeightMm: selectedDrone.sensorHeightMm,
      focalLengthMm: selectedDrone.focalLengthMm,
      imageWidthPx: selectedDrone.imageWidthPx,
      imageHeightPx: selectedDrone.imageHeightPx,
    };
    onParametersChange({
      customSensor: {
        ...current,
        [field]: value,
      },
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith('.kmz')) {
      onImportKmzFile(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result;
        if (typeof content === 'string') {
          onImportMissionJson(content);
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  const handleConfirmPasteJson = () => {
    if (!pastedJsonText.trim()) return;
    onImportMissionJson(pastedJsonText.trim());
    setPastedJsonText('');
    setShowPasteJsonBox(false);
  };

  return (
    <aside
      id="mission-parameters-sidebar"
      className="w-full md:w-88 lg:w-[400px] bg-[#15181E] border-r border-[#2D333F] flex flex-col h-full z-20 shadow-2xl overflow-hidden select-none text-[#E0E0E0] tabular-nums"
    >
      {/* Sidebar Header with KMZ / JSON Import & Persistence Actions */}
      <div className="p-3 border-b border-[#2D333F] flex items-center justify-between shrink-0 bg-[#15181E]">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-[#00E676]" />
          <h2 className="text-xs font-bold tracking-wider uppercase font-mono text-white">
            Configuración de Misión
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".kmz,.json,.geojson"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            id="btn-import-mission-file"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Importar archivo .KMZ de DJI Fly / RC 2 o .JSON de WaypointMap"
            className="px-2 py-0.5 rounded bg-[#00E676]/15 hover:bg-[#00E676]/25 border border-[#00E676]/50 text-[9px] font-mono font-bold text-[#00E676] flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-2.5 h-2.5 text-[#00E676]" />
            <span>Importar KMZ/JSON</span>
          </button>
          <button
            id="btn-toggle-paste-json"
            type="button"
            onClick={() => setShowPasteJsonBox(!showPasteJsonBox)}
            title="Pegar array JSON de waypoints (formato Legacy WaypointMap)"
            className={`px-1.5 py-0.5 rounded border text-[9px] font-mono flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 ${
              showPasteJsonBox
                ? 'bg-[#00E676] text-black border-[#00E676] font-bold'
                : 'bg-[#1C1F26] hover:bg-[#252A34] border-[#2D333F] text-[#E0E0E0]'
            }`}
          >
            <ClipboardPaste className="w-2.5 h-2.5" />
            <span>Pegar</span>
          </button>
          <button
            id="btn-reset-defaults"
            type="button"
            onClick={onResetDefaults}
            title="Restaurar configuración y polígono por defecto"
            className="px-1.5 py-0.5 rounded bg-[#1C1F26] hover:bg-[#252A34] border border-[#2D333F] text-[9px] font-mono text-[#717885] hover:text-white flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-2.5 h-2.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Scrollable Configuration Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
        {/* Optional Paste Legacy JSON Box */}
        {showPasteJsonBox && (
          <div className="p-2.5 bg-[#0F1115] border border-[#00E676]/50 rounded space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#00E676]">
              <span className="font-bold uppercase">
                Pegar JSON WaypointMap / Proyecto
              </span>
              <button
                type="button"
                onClick={() => setShowPasteJsonBox(false)}
                className="text-[#717885] hover:text-white"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={3}
              value={pastedJsonText}
              onChange={(e) => setPastedJsonText(e.target.value)}
              placeholder='[{"altitude": 60, "Latitude": -34.985, "Longitude": -71.240, "heading": 90, "gimbalAngle": -60, "speed": 6, "action": "takePhoto"}]'
              className="w-full bg-[#1C1F26] border border-[#2D333F] rounded p-2 text-[10px] font-mono text-[#E0E0E0] focus:outline-none focus:border-[#00E676]"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={handleConfirmPasteJson}
                className="px-2.5 py-1 rounded bg-[#00E676] text-black font-mono font-bold text-[10px] uppercase"
              >
                Cargar Waypoints en Mapa
              </button>
            </div>
          </div>
        )}

        {/* Imported DJI RC 2 KMZ Metadata Banner */}
        {importedKmzMeta && (
          <div className="p-2.5 bg-[#0F1115] border border-[#00E676]/50 rounded space-y-1 font-mono text-[10px]">
            <div className="flex items-center justify-between text-[#00E676] font-bold">
              <span className="flex items-center gap-1.5 truncate">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">KMZ RC 2 Cargado: {importedKmzMeta.originalFileName}</span>
              </span>
              <span className="text-[9px] text-[#717885] shrink-0">
                ID #{importedKmzMeta.templateId ?? 0}
              </span>
            </div>
            <p className="text-[9.5px] text-[#A0AAB8] font-sans leading-snug">
              Metadatos originales preservados ({importedKmzMeta.importedWaypointCount} WPs). Puedes mantener la ruta importada o aplicar cualquier receta de vuelo y exportar manteniendo el nombre UUID para reemplazar en DJI Fly.
            </p>
          </div>
        )}

        {/* Polygon Status Alert if not drawn */}
        {!hasPolygon && (
          <div
            id="polygon-required-warning"
            className="p-2.5 bg-[#1C1F26] border border-[#F27D26]/50 rounded flex items-start gap-2 text-xs"
          >
            <AlertCircle className="w-4 h-4 text-[#F27D26] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-white block">Área de Interés (AOI) requerida</span>
              <p className="text-[10px] text-[#717885] mt-0.5">
                Dibuja un polígono en el visor, importa un archivo .KMZ/.JSON o selecciona un área demo.
              </p>
            </div>
          </div>
        )}

        {/* NEW PILLAR 1: Intelligent Mission Modes & 1-Click Multi-Phase Recipes */}
        <div
          id="mission-pattern-selector"
          className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
            <h3 className="text-[10px] font-mono uppercase text-[#00E676] tracking-widest flex items-center gap-1.5 font-bold">
              <Layers className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Tipo de Misión / Receta Multi-Fase</span>
            </h3>
            <span className="text-[9px] font-mono text-[#717885]">1-Clic</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {/* 1. Single Grid */}
            <button
              id="pattern-single-grid"
              type="button"
              onClick={() => handlePatternSelect('single-grid')}
              className={`p-2 rounded border text-left transition-all flex flex-col justify-between ${
                parameters.missionPattern === 'single-grid'
                  ? 'bg-[#00E676]/15 border-[#00E676] text-white'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white hover:border-[#717885]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-[#00E676]">
                  1. Grilla Simple
                </span>
                <Grid className="w-3 h-3 text-[#00E676]" />
              </div>
              <span className="text-[9px] text-[#717885] mt-0.5 leading-tight">
                2D Ortofoto Lawnmower clásico
              </span>
            </button>

            {/* 2. Double Grid */}
            <button
              id="pattern-double-grid"
              type="button"
              onClick={() => handlePatternSelect('double-grid')}
              className={`p-2 rounded border text-left transition-all flex flex-col justify-between ${
                parameters.missionPattern === 'double-grid'
                  ? 'bg-[#00E676]/15 border-[#00E676] text-white'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white hover:border-[#717885]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-[#00E676]">
                  2. Grilla Doble 3D
                </span>
                <Layers className="w-3 h-3 text-[#00E676]" />
              </div>
              <span className="text-[9px] text-[#717885] mt-0.5 leading-tight">
                Cruzada N-S + E-O Oblicua
              </span>
            </button>

            {/* 3. Circular Orbit POI */}
            <button
              id="pattern-orbit-poi"
              type="button"
              onClick={() => handlePatternSelect('orbit-poi')}
              className={`p-2 rounded border text-left transition-all flex flex-col justify-between ${
                parameters.missionPattern === 'orbit-poi'
                  ? 'bg-[#00E676]/15 border-[#00E676] text-white'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white hover:border-[#717885]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-[#00E5FF]">
                  3. Órbita / POI
                </span>
                <Orbit className="w-3 h-3 text-[#00E5FF]" />
              </div>
              <span className="text-[9px] text-[#717885] mt-0.5 leading-tight">
                Anillo perimetral mirando al centro
              </span>
            </button>

            {/* 4. Star Mode: Combo 3DGS Pro */}
            <button
              id="pattern-combo-3dgs-pro"
              type="button"
              onClick={() => handlePatternSelect('combo-3dgs-pro')}
              className={`p-2 rounded border text-left transition-all flex flex-col justify-between ${
                parameters.missionPattern === 'combo-3dgs-pro'
                  ? 'bg-[#00E676]/20 border-[#00E676] text-white shadow-[0_0_12px_rgba(0,230,118,0.18)]'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white hover:border-[#00E676]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-[#FFB300]">
                  4. Combo 3DGS Pro
                </span>
                <Sparkles className="w-3 h-3 text-[#FFB300]" />
              </div>
              <span className="text-[9px] text-[#E0E0E0]/80 mt-0.5 leading-tight">
                Órbita -75° + Nadir -90° + Órbita -45°
              </span>
            </button>
          </div>

          {/* 3-Phase Breakdown Banner when Combo 3DGS Pro is active */}
          {parameters.missionPattern === 'combo-3dgs-pro' && (
            <div className="p-2 bg-[#0F1115] border border-[#00E676]/40 rounded space-y-1 font-mono text-[9.5px]">
              <div className="text-[#00E676] font-bold uppercase tracking-wider text-[9px]">
                Secuencia Multi-Fase 3D Gaussian Splatting:
              </div>
              <div className="flex items-center justify-between text-[#00E5FF]">
                <span>• Fase 1: Órbita Perimetral Interna</span>
                <span className="font-bold">Gimbal -75° ➔ POI</span>
              </div>
              <div className="flex items-center justify-between text-[#00E676]">
                <span>• Fase 2: Grilla Lawnmower Central</span>
                <span className="font-bold">Gimbal -90° (Nadir)</span>
              </div>
              <div className="flex items-center justify-between text-[#FFB300]">
                <span>• Fase 3: Órbita Externa (Radio +15%)</span>
                <span className="font-bold">Gimbal -45° ➔ Fachadas</span>
              </div>
            </div>
          )}

          {/* Orbit Waypoints Count Slider when Orbit or Combo 3DGS Pro is active */}
          {(parameters.missionPattern === 'orbit-poi' ||
            parameters.missionPattern === 'combo-3dgs-pro') && (
            <div className="pt-1 border-t border-[#2D333F] flex items-center justify-between gap-2 text-xs font-mono">
              <span className="text-[9.5px] text-[#717885] uppercase">
                Puntos por Anillo Orbital:
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="8"
                  max="36"
                  step="2"
                  value={parameters.orbitPointsCount || 16}
                  onChange={(e) =>
                    onParametersChange({
                      orbitPointsCount: clampNumber(e.target.value, 8, 48, 16),
                    })
                  }
                  className="w-24 accent-[#00E5FF] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
                />
                <span className="text-xs font-bold text-[#00E5FF] w-8 text-right">
                  {parameters.orbitPointsCount || 16}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* NEW PILLAR 2: Practical Trajectory & Action Controls (WaypointMap Pro Style) */}
        <div
          id="practical-trajectory-controls"
          className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-2.5"
        >
          <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
            <h3 className="text-[10px] font-mono uppercase text-[#00E676] tracking-widest flex items-center gap-1.5 font-bold">
              <CornerUpRight className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Opciones Prácticas de Trazado y Captura</span>
            </h3>
          </div>

          {/* 1. Waypoint Density Mode */}
          <div className="space-y-1">
            <label className="text-[9.5px] text-[#717885] uppercase font-mono block">
              Densidad de Waypoints en Grilla
            </label>
            <div className="grid grid-cols-2 gap-1 p-0.5 bg-[#0F1115] border border-[#2D333F] rounded">
              <button
                type="button"
                onClick={() => onParametersChange({ waypointDensity: 'all-photo-points' })}
                className={`py-1 px-2 rounded text-[9.5px] font-mono transition-colors whitespace-nowrap truncate ${
                  parameters.waypointDensity === 'all-photo-points'
                    ? 'bg-[#00E676] text-black font-bold'
                    : 'text-[#A0AAB8] hover:text-white'
                }`}
              >
                Todos los puntos foto
              </button>
              <button
                type="button"
                onClick={() => onParametersChange({ waypointDensity: 'endpoints-only' })}
                className={`py-1 px-2 rounded text-[9.5px] font-mono transition-colors whitespace-nowrap truncate ${
                  parameters.waypointDensity === 'endpoints-only'
                    ? 'bg-[#00E676] text-black font-bold'
                    : 'text-[#A0AAB8] hover:text-white'
                }`}
              >
                Solo extremos (Ligero RC2)
              </button>
            </div>
          </div>

          {/* 2. Waypoint Action Selector */}
          <div className="space-y-1">
            <label className="text-[9.5px] text-[#717885] uppercase font-mono block">
              Acción Generada en Waypoints (WPML Action)
            </label>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => onParametersChange({ waypointAction: 'takePhoto' })}
                className={`py-1.5 px-1.5 rounded border text-[9px] font-mono flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                  parameters.waypointAction === 'takePhoto'
                    ? 'bg-[#00E676]/15 border-[#00E676] text-[#00E676] font-bold'
                    : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white'
                }`}
              >
                <Camera className="w-3 h-3 shrink-0" />
                <span>Foto</span>
              </button>
              <button
                type="button"
                onClick={() => onParametersChange({ waypointAction: 'recordVideo' })}
                className={`py-1.5 px-1.5 rounded border text-[9px] font-mono flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                  parameters.waypointAction === 'recordVideo'
                    ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#00E5FF] font-bold'
                    : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white'
                }`}
              >
                <Video className="w-3 h-3 shrink-0" />
                <span>Video 4K (3DGS)</span>
              </button>
              <button
                type="button"
                onClick={() => onParametersChange({ waypointAction: 'none' })}
                className={`py-1.5 px-1.5 rounded border text-[9px] font-mono flex items-center justify-center gap-1 transition-colors whitespace-nowrap ${
                  parameters.waypointAction === 'none'
                    ? 'bg-[#FFB300]/15 border-[#FFB300] text-[#FFB300] font-bold'
                    : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white'
                }`}
              >
                <Clock className="w-3 h-3 shrink-0" />
                <span>Intervalómetro</span>
              </button>
            </div>
          </div>

          {/* 3. Quick Toggles: Reverse Flight Path & Straighten Flight Paths */}
          <div className="grid grid-cols-2 gap-1.5 pt-0.5">
            <button
              id="btn-reverse-flight-path"
              type="button"
              onClick={() =>
                onParametersChange({ reverseFlightPath: !parameters.reverseFlightPath })
              }
              className={`p-2 rounded border text-[9.5px] font-mono flex items-center justify-between transition-colors ${
                parameters.reverseFlightPath
                  ? 'bg-[#00E676]/15 border-[#00E676] text-[#00E676] font-bold'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <ArrowLeftRight className="w-3 h-3 shrink-0" />
                <span>Invertir Ruta</span>
              </span>
              <span>{parameters.reverseFlightPath ? 'ON' : 'OFF'}</span>
            </button>

            <button
              id="btn-straighten-paths"
              type="button"
              onClick={() =>
                onParametersChange({ straightenPaths: !parameters.straightenPaths })
              }
              className={`p-2 rounded border text-[9.5px] font-mono flex items-center justify-between transition-colors ${
                parameters.straightenPaths
                  ? 'bg-[#00E676]/15 border-[#00E676] text-[#00E676] font-bold'
                  : 'bg-[#1C1F26] border-[#2D333F] text-[#A0AAB8] hover:text-white'
              }`}
            >
              <span className="flex items-center gap-1.5 truncate">
                <CornerUpRight className="w-3 h-3 shrink-0" />
                <span>Giros Rectos</span>
              </span>
              <span>{parameters.straightenPaths ? 'ON' : 'Curvo'}</span>
            </button>
          </div>

          {/* 4. Dynamic Terrain Follow / Slope Offset Compensation */}
          <div className="pt-2 border-t border-[#2D333F] space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-[10px] font-mono text-[#00E676] font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={parameters.terrainFollowEnabled}
                  onChange={(e) =>
                    onParametersChange({ terrainFollowEnabled: e.target.checked })
                  }
                  className="accent-[#00E676] rounded cursor-pointer"
                />
                <Mountain className="w-3.5 h-3.5 text-[#00E676]" />
                <span>Corrección Dinámica de Terreno (AGL)</span>
              </label>

              <button
                type="button"
                onClick={onFetchTerrainDem}
                disabled={!hasPolygon || isFetchingTerrain}
                className="px-2 py-0.5 rounded bg-[#1C1F26] hover:bg-[#252A34] border border-[#2D333F] text-[8.5px] font-mono text-[#00E5FF] flex items-center gap-1 disabled:opacity-40"
              >
                <Mountain className="w-2.5 h-2.5" />
                <span>{isFetchingTerrain ? 'Consultando DEM...' : 'Consultar DEM API'}</span>
              </button>
            </div>

            {parameters.terrainFollowEnabled && (
              <div className="p-2 bg-[#0F1115] border border-[#2D333F] rounded space-y-2 text-[9.5px] font-mono">
                <div className="flex items-center justify-between text-[#A0AAB8]">
                  <span>Pendiente Terreno (°):</span>
                  <span className="text-white font-bold">{parameters.terrainSlopeDeg}°</span>
                </div>
                <input
                  type="range"
                  min="-20"
                  max="20"
                  step="1"
                  value={parameters.terrainSlopeDeg}
                  onChange={(e) =>
                    onParametersChange({
                      terrainSlopeDeg: clampNumber(e.target.value, -25, 25, 0),
                    })
                  }
                  className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
                />
                <div className="flex items-center justify-between text-[#A0AAB8]">
                  <span>Dirección Ladera Ascendente:</span>
                  <span className="text-white font-bold">
                    {parameters.terrainSlopeDirectionDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={parameters.terrainSlopeDirectionDeg}
                  onChange={(e) =>
                    onParametersChange({
                      terrainSlopeDirectionDeg: clampNumber(e.target.value, 0, 360, 0),
                    })
                  }
                  className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
                />
                <div className="flex items-center justify-between pt-1 border-t border-[#2D333F] text-[9px]">
                  <span className="text-[#717885]">
                    {terrainSourceLabel || 'GSD constante sobre pendiente'}
                  </span>
                  <span className="text-[#00E676] font-bold">
                    Δ Cota: {metrics.minTerrainDeltaM ?? 0}m a +{metrics.maxTerrainDeltaM ?? 0}m
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Telemetry HUD Card */}
        <TelemetryCard
          metrics={metrics}
          parameters={parameters}
          hasPolygon={hasPolygon}
          onApplyPatch={onParametersChange}
        />

        {/* 1. Drone & Camera Selection */}
        <div className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
            <h3 className="text-[10px] font-mono uppercase text-[#00E676] tracking-widest flex items-center gap-1.5">
              <Plane className="w-3 h-3 text-[#00E676]" />
              <span>Drone & Perfil Óptico</span>
            </h3>
            <span className="text-[9px] font-mono text-[#717885]">
              Obturador {selectedDrone.shutterType === 'mechanical' ? 'Mecánico' : 'Electrónico'} · Mín {selectedDrone.minPhotoIntervalSec}s
            </span>
          </div>

          <div className="relative">
            <select
              id="select-drone-profile"
              value={parameters.droneProfileId}
              onChange={handleDroneChange}
              className="w-full bg-[#1C1F26] border border-[#2D333F] text-[#E0E0E0] rounded px-2.5 py-1.5 pr-7 text-xs font-mono focus:outline-none focus:border-[#00E676] cursor-pointer appearance-none truncate"
            >
              {DRONE_PROFILES.map((drone) => (
                <option key={drone.id} value={drone.id} className="bg-[#1C1F26] text-[#E0E0E0]">
                  {drone.name}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#717885] absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {/* Quick Optical Mode Switcher when DJI Air 3S is active */}
          {isAir3S && (
            <div className="grid grid-cols-2 gap-1 pt-0.5">
              {[
                { id: 'dji-air-3s-wide-12mp', label: '24mm · 12MP (3DGS/Foto)' },
                { id: 'dji-air-3s-wide-50mp', label: '24mm · 50MP (Alta Res)' },
                { id: 'dji-air-3s-tele-12mp', label: '70mm · 12MP (Tele 3DGS)' },
                { id: 'dji-air-3s-tele-48mp', label: '70mm · 48MP (Inspección)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    const target = DRONE_PROFILES.find((d) => d.id === opt.id);
                    onParametersChange({
                      droneProfileId: opt.id,
                      batteryFlightTimeMin: target?.recommendedSafeBatteryMin || 30,
                    });
                  }}
                  className={`px-2 py-1 rounded text-[9px] font-mono border text-left truncate transition-colors ${
                    parameters.droneProfileId === opt.id
                      ? 'bg-[#00E676]/15 border-[#00E676] text-[#00E676] font-bold'
                      : 'bg-[#1C1F26] border-[#2D333F] text-[#717885] hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Sensor Info Summary */}
          <div className="grid grid-cols-3 gap-1 text-[9px] font-mono bg-[#1C1F26] p-2 rounded border border-[#2D333F] text-[#717885]">
            <div>
              <span className="text-[#717885] block uppercase">Sensor CMOS</span>
              <span className="text-white font-medium">
                {selectedDrone.sensorWidthMm}×{selectedDrone.sensorHeightMm}mm
              </span>
            </div>
            <div>
              <span className="text-[#717885] block uppercase">Focal Real / Eq</span>
              <span className="text-white font-medium">
                {selectedDrone.focalLengthMm}mm ({selectedDrone.focalEquivalentMm}mm)
              </span>
            </div>
            <div>
              <span className="text-[#717885] block uppercase">Resolución</span>
              <span className="text-white font-medium">
                {selectedDrone.imageWidthPx}×{selectedDrone.imageHeightPx}
              </span>
            </div>
          </div>

          {/* Custom Sensor Drawer */}
          {(parameters.droneProfileId === 'custom' || showCustomSensor) &&
            parameters.droneProfileId === 'custom' && (
              <div className="pt-2 border-t border-[#2D333F] space-y-2">
                <div className="text-[10px] text-[#00E676] font-mono uppercase tracking-wider">
                  Configuración Sensor Manual
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[9px] text-[#717885] block uppercase font-mono">
                      Ancho Sensor (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="100"
                      value={parameters.customSensor?.sensorWidthMm ?? 13.2}
                      onChange={(e) =>
                        handleCustomSensorChange(
                          'sensorWidthMm',
                          clampNumber(e.target.value, 1, 100, 13.2)
                        )
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#717885] block uppercase font-mono">
                      Alto Sensor (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="100"
                      value={parameters.customSensor?.sensorHeightMm ?? 8.8}
                      onChange={(e) =>
                        handleCustomSensorChange(
                          'sensorHeightMm',
                          clampNumber(e.target.value, 1, 100, 8.8)
                        )
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#717885] block uppercase font-mono">
                      Distancia Focal (mm)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="200"
                      value={parameters.customSensor?.focalLengthMm ?? 8.58}
                      onChange={(e) =>
                        handleCustomSensorChange(
                          'focalLengthMm',
                          clampNumber(e.target.value, 1, 200, 8.58)
                        )
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-[#717885] block uppercase font-mono">
                      Ancho Imagen (px)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="100"
                      max="20000"
                      value={parameters.customSensor?.imageWidthPx ?? 4096}
                      onChange={(e) =>
                        handleCustomSensorChange(
                          'imageWidthPx',
                          Math.round(clampNumber(e.target.value, 100, 20000, 4096))
                        )
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* 2. Primary Flight Parameters (Altitude, Speed, Overlaps, Gimbal, Heading) */}
        <div className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-3">
          <div className="border-b border-[#2D333F] pb-1.5">
            <h3 className="text-[10px] font-mono uppercase text-[#00E676] tracking-widest flex items-center gap-1.5">
              <ArrowUpRight className="w-3 h-3 text-[#00E676]" />
              <span>Parámetros de Vuelo y Fotogrametría</span>
            </h3>
          </div>

          {/* Altitude Slider (15m to 500m) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Altitud de Vuelo (H)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="15"
                  max="500"
                  value={parameters.altitude}
                  onChange={(e) =>
                    onParametersChange({
                      altitude: clampNumber(e.target.value, 15, 500, 75),
                    })
                  }
                  className="w-14 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#00E676] focus:outline-none focus:border-[#00E676]"
                />
                <span className="text-[10px] text-[#717885] font-mono">m</span>
              </div>
            </div>
            <input
              id="input-altitude-slider"
              type="range"
              min="15"
              max="500"
              step="5"
              value={parameters.altitude}
              onChange={(e) =>
                onParametersChange({ altitude: clampNumber(e.target.value, 15, 500, 75) })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>15m (Detalle)</span>
              <span>120m (Estándar)</span>
              <span>500m (Máx)</span>
            </div>
          </div>

          {/* Speed Slider (1 m/s to 15 m/s) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Velocidad de Vuelo (V)
              </label>
              <div className="flex items-center gap-1.5">
                {parameters.speed > metrics.recommendedMaxSpeedMs && (
                  <button
                    type="button"
                    onClick={() =>
                      onParametersChange({ speed: metrics.recommendedMaxSpeedMs })
                    }
                    title="Ajustar a la velocidad máxima recomendada para evitar saturación de buffer o motion blur"
                    className="px-1.5 py-0.5 rounded bg-[#FFB300]/20 border border-[#FFB300] text-[#FFB300] text-[8px] font-mono font-bold uppercase"
                  >
                    Sugerido: {metrics.recommendedMaxSpeedMs}m/s
                  </button>
                )}
                <input
                  type="number"
                  min="1"
                  max="15"
                  step="0.5"
                  value={parameters.speed}
                  onChange={(e) =>
                    onParametersChange({
                      speed: clampNumber(e.target.value, 1, 15, 7),
                    })
                  }
                  className="w-14 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#00E676] focus:outline-none focus:border-[#00E676]"
                />
                <span className="text-[10px] text-[#717885] font-mono">m/s</span>
              </div>
            </div>
            <input
              id="input-speed-slider"
              type="range"
              min="1"
              max="15"
              step="0.5"
              value={parameters.speed}
              onChange={(e) =>
                onParametersChange({ speed: clampNumber(e.target.value, 1, 15, 7) })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>1 m/s</span>
              <span>
                {Math.round(parameters.speed * 3.6)} km/h · Máx Rec: {metrics.recommendedMaxSpeedMs} m/s
              </span>
              <span>15 m/s</span>
            </div>
          </div>

          {/* Front Overlap Slider (10% to 95%) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Solapamiento Frontal
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="10"
                  max="95"
                  value={parameters.frontOverlap}
                  onChange={(e) =>
                    onParametersChange({
                      frontOverlap: clampNumber(e.target.value, 10, 95, 75),
                    })
                  }
                  className="w-12 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#00E676] focus:outline-none focus:border-[#00E676]"
                />
                <span className="text-[10px] text-[#717885] font-mono">%</span>
              </div>
            </div>
            <input
              id="input-front-overlap-slider"
              type="range"
              min="10"
              max="95"
              step="1"
              value={parameters.frontOverlap}
              onChange={(e) =>
                onParametersChange({
                  frontOverlap: clampNumber(e.target.value, 10, 95, 75),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>10%</span>
              <span className="text-[#00E676]">75% - 85% (Fotogrametría / 3DGS)</span>
              <span>95%</span>
            </div>
          </div>

          {/* Side Overlap Slider (10% to 95%) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Solapamiento Lateral
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="10"
                  max="95"
                  value={parameters.sideOverlap}
                  onChange={(e) =>
                    onParametersChange({
                      sideOverlap: clampNumber(e.target.value, 10, 95, 65),
                    })
                  }
                  className="w-12 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#00E676] focus:outline-none focus:border-[#00E676]"
                />
                <span className="text-[10px] text-[#717885] font-mono">%</span>
              </div>
            </div>
            <input
              id="input-side-overlap-slider"
              type="range"
              min="10"
              max="95"
              step="1"
              value={parameters.sideOverlap}
              onChange={(e) =>
                onParametersChange({
                  sideOverlap: clampNumber(e.target.value, 10, 95, 65),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>10%</span>
              <span className="text-[#00E676]">65% - 75% Recomendado</span>
              <span>95%</span>
            </div>
          </div>

          {/* Camera Tilt (Gimbal Pitch -90° to 0°) + Oblique Look-Ahead Offset */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Inclinación Gimbal (Pitch)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="-90"
                  max="0"
                  value={parameters.gimbalPitch}
                  onChange={(e) =>
                    onParametersChange({
                      gimbalPitch: clampNumber(e.target.value, -90, 0, -90),
                    })
                  }
                  className="w-12 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#00E676] focus:outline-none focus:border-[#00E676]"
                />
                <span className="text-[10px] text-[#717885] font-mono">°</span>
              </div>
            </div>
            <input
              id="input-gimbal-pitch-slider"
              type="range"
              min="-90"
              max="0"
              step="5"
              value={parameters.gimbalPitch}
              onChange={(e) =>
                onParametersChange({
                  gimbalPitch: clampNumber(e.target.value, -90, 0, -90),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <button
                type="button"
                onClick={() => onParametersChange({ gimbalPitch: -90 })}
                className={`hover:text-[#00E676] ${
                  parameters.gimbalPitch === -90 ? 'text-[#00E676] font-bold' : ''
                }`}
              >
                -90° (Nadir 2D)
              </button>
              <button
                type="button"
                onClick={() => onParametersChange({ gimbalPitch: -60 })}
                className={`hover:text-[#00E676] ${
                  parameters.gimbalPitch === -60 ? 'text-[#00E676] font-bold' : ''
                }`}
              >
                -60° (Oblicuo 3DGS)
              </button>
              <button
                type="button"
                onClick={() => onParametersChange({ gimbalPitch: -45 })}
                className={`hover:text-[#00E676] ${
                  parameters.gimbalPitch === -45 ? 'text-[#00E676] font-bold' : ''
                }`}
              >
                -45° (Fachadas / 3DGS)
              </button>
            </div>

            {/* Oblique Optical Center Offset Callout */}
            {isOblique && (
              <div className="p-2 bg-[#0F1115] border border-[#00E676]/40 rounded text-[9.5px] font-mono space-y-1">
                <div className="flex items-center justify-between text-[#00E676] font-bold">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    <span>Compensación Oblicua / 3DGS ({parameters.gimbalPitch}°):</span>
                  </span>
                  <span>d = +{metrics.lookAheadOffsetM} m</span>
                </div>
                <p className="text-[9px] text-[#A0AAB8] leading-snug font-sans">
                  El centro óptico se proyecta <strong>{metrics.lookAheadOffsetM} m hacia adelante</strong> respecto a la vertical del dron (<code className="text-[#00E676]">H·tan(90°-|Pitch|)</code>).
                </p>
              </div>
            )}
          </div>

          {/* Flight Angle (Grid heading) + Auto Optimize */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono flex items-center gap-1">
                <Compass className="w-3 h-3 text-[#00E676]" />
                <span>Rumbo de Pasadas</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  id="btn-optimize-flight-angle"
                  type="button"
                  onClick={onOptimizeFlightAngle}
                  disabled={!hasPolygon}
                  title="Alinear ángulo automáticamente con el lado más largo del polígono"
                  className="px-1.5 py-0.5 rounded text-[9px] bg-[#1C1F26] hover:bg-[#252A34] text-[#00E676] border border-[#2D333F] flex items-center gap-1 font-mono uppercase tracking-wider disabled:opacity-40"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Auto Optimizar
                </button>
                <span className="font-mono text-xs font-bold text-white">
                  {parameters.flightAngle}°
                </span>
              </div>
            </div>
            <input
              id="input-flight-angle-slider"
              type="range"
              min="0"
              max="360"
              step="1"
              value={parameters.flightAngle}
              onChange={(e) =>
                onParametersChange({
                  flightAngle: clampNumber(e.target.value, 0, 360, 0),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>0° (N-S)</span>
              <span>90° (E-O)</span>
              <span>180°</span>
              <span>270°</span>
              <span>360°</span>
            </div>
          </div>

          {/* Safety Margin */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#717885] uppercase tracking-wider font-mono">
                Margen de Seguridad (Buffer)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={parameters.margin}
                  onChange={(e) =>
                    onParametersChange({
                      margin: clampNumber(e.target.value, 0, 100, 0),
                    })
                  }
                  className="w-12 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-white focus:outline-none"
                />
                <span className="text-[10px] text-[#717885] font-mono">m</span>
              </div>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              step="2"
              value={parameters.margin}
              onChange={(e) =>
                onParametersChange({
                  margin: clampNumber(e.target.value, 0, 100, 0),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
          </div>

          {/* Altitud de Despegue y Tránsito Autónomo al Punto de Inicio */}
          <div className="pt-2 border-t border-[#2D333F] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#00E676] uppercase tracking-wider font-mono flex items-center gap-1 font-bold">
                <Navigation className="w-3.5 h-3.5 text-[#00E676]" />
                <span>Altitud Despegue & Tránsito Inicial</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="5"
                  max="200"
                  step="5"
                  value={parameters.takeOffSecurityHeight || 30}
                  onChange={(e) =>
                    onParametersChange({
                      takeOffSecurityHeight: clampNumber(e.target.value, 5, 200, 30),
                    })
                  }
                  className={`w-12 bg-[#1C1F26] border rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold focus:outline-none ${
                    (parameters.takeOffSecurityHeight || 30) < 25
                      ? 'border-[#FFB300] text-[#FFB300]'
                      : 'border-[#2D333F] text-[#00E676] focus:border-[#00E676]'
                  }`}
                />
                <span className="text-[10px] text-[#717885] font-mono">m</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="120"
              step="5"
              value={parameters.takeOffSecurityHeight || 30}
              onChange={(e) =>
                onParametersChange({
                  takeOffSecurityHeight: clampNumber(e.target.value, 5, 200, 30),
                })
              }
              className="w-full accent-[#00E676] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {[
                { label: '25m (Mín Seguro)', val: 25 },
                { label: '30m (Estándar)', val: 30 },
                { label: '50m', val: 50 },
                { label: `Igual a Mapeo (${parameters.altitude}m)`, val: parameters.altitude },
              ].map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => onParametersChange({ takeOffSecurityHeight: chip.val })}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    (parameters.takeOffSecurityHeight || 30) === chip.val
                      ? 'bg-[#00E676]/20 border-[#00E676] text-[#00E676] font-bold'
                      : 'bg-[#1C1F26] border-[#2D333F] text-[#717885] hover:text-white'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Autonomía de Batería & Retorno a Pies del Piloto */}
          <div className="pt-2 border-t border-[#2D333F] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="text-[10px] text-[#F27D26] uppercase tracking-wider font-mono flex items-center gap-1 font-bold">
                <BatteryCharging className="w-3.5 h-3.5 text-[#F27D26]" />
                <span>Autonomía Operativa Segura</span>
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="5"
                  max="50"
                  value={parameters.batteryFlightTimeMin || 30}
                  onChange={(e) =>
                    onParametersChange({
                      batteryFlightTimeMin: clampNumber(e.target.value, 5, 50, 30),
                    })
                  }
                  className="w-12 bg-[#1C1F26] border border-[#2D333F] rounded px-1.5 py-0.5 text-right font-mono text-xs font-bold text-[#F27D26] focus:outline-none"
                />
                <span className="text-[10px] text-[#717885] font-mono">min</span>
              </div>
            </div>
            <input
              type="range"
              min="10"
              max="40"
              step="1"
              value={parameters.batteryFlightTimeMin || 30}
              onChange={(e) =>
                onParametersChange({
                  batteryFlightTimeMin: clampNumber(e.target.value, 5, 50, 30),
                })
              }
              className="w-full accent-[#F27D26] h-1.5 bg-[#1C1F26] rounded cursor-pointer"
            />
            <div className="flex justify-between text-[8px] text-[#717885] font-mono">
              <span>15 min</span>
              <span className="text-[#F27D26]">
                28-32 min (Air 3S Seguro · 45m nominal)
              </span>
              <span>40 min</span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {[
                { label: '20m (Estándar)', val: 20 },
                { label: '28m (Air 3S Viento)', val: 28 },
                { label: '30m (Air 3S Óptimo)', val: 30 },
                { label: '32m (Air 3S Máx)', val: 32 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onParametersChange({ batteryFlightTimeMin: preset.val })}
                  className={`text-[9px] font-mono px-2 py-0.5 rounded border transition-colors ${
                    (parameters.batteryFlightTimeMin || 30) === preset.val
                      ? 'bg-[#F27D26]/20 border-[#F27D26] text-[#F27D26] font-bold'
                      : 'bg-[#1C1F26] border-[#2D333F] text-[#717885] hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Advanced WPML / Drone Mission Settings */}
        <div className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-2.5">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between text-xs font-mono uppercase text-[#00E676] tracking-wider"
          >
            <span className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-[#00E676]" />
              <span>Parámetros WPML 3.0 (DJI Fly / Pilot 2)</span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#717885] transition-transform ${
                showAdvanced ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showAdvanced && (
            <div className="space-y-2.5 pt-2 border-t border-[#2D333F] text-xs">
              <div>
                <label className="text-[10px] text-[#717885] block mb-1 uppercase font-mono">
                  Acción al Finalizar Misión
                </label>
                <select
                  value={parameters.finishAction}
                  onChange={(e) => onParametersChange({ finishAction: e.target.value as any })}
                  className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1.5 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                >
                  <option value="goHome">Regresar al punto de despegue (RTH)</option>
                  <option value="autoLand">Aterrizaje Automático en último WP</option>
                  <option value="gotoFirstWaypoint">Ir al primer Waypoint</option>
                  <option value="noAction">Mantener posición (Hover)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[#717885] block mb-1 uppercase font-mono">
                  Modo de Giro de Waypoint
                </label>
                <select
                  value={parameters.turnMode}
                  onChange={(e) => onParametersChange({ turnMode: e.target.value as any })}
                  className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1.5 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                >
                  <option value="toPointAndStopWithHeading">
                    Detenerse y orientar rumbo (Preciso)
                  </option>
                  <option value="coordinateTurn">Giro Coordinado en curva continua</option>
                  <option value="toPointAndStopWithDiscontinuityCurvature">
                    Detenerse con curvatura discontinua (Recto)
                  </option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-[#717885] block mb-1 uppercase font-mono">
                  Sistema de Altura (executeHeightMode)
                </label>
                <select
                  value={parameters.heightMode}
                  onChange={(e) => onParametersChange({ heightMode: e.target.value as any })}
                  className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1.5 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                >
                  <option value="relativeToStartPoint">
                    Relativo al Despegue (relativeToStartPoint - Estándar DJI Fly)
                  </option>
                  <option value="WGS84">WGS84 (Elipsoidal DJI Pilot 2 / RTK)</option>
                  <option value="realTimeFollowSurface">
                    Seguimiento de Terreno (realTimeFollowSurface)
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-[#717885] block mb-0.5 uppercase font-mono">
                    Altitud Segura Despegue
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="5"
                      max="200"
                      value={parameters.takeOffSecurityHeight}
                      onChange={(e) =>
                        onParametersChange({
                          takeOffSecurityHeight: clampNumber(e.target.value, 5, 200, 30),
                        })
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                    <span className="text-[#717885] font-mono text-[10px]">m</span>
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-[#717885] block mb-0.5 uppercase font-mono">
                    Altitud RTH
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="15"
                      max="500"
                      value={parameters.rthAltitude}
                      onChange={(e) =>
                        onParametersChange({
                          rthAltitude: clampNumber(e.target.value, 15, 500, 60),
                        })
                      }
                      className="w-full bg-[#1C1F26] border border-[#2D333F] rounded px-2 py-1 text-xs text-[#E0E0E0] font-mono focus:outline-none focus:border-[#00E676]"
                    />
                    <span className="text-[#717885] font-mono text-[10px]">m</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Action Footer */}
      <div className="p-3 border-t border-[#2D333F] bg-[#15181E] shrink-0 space-y-2">
        <div className="flex gap-2">
          <button
            id="btn-export-dji-kmz"
            type="button"
            onClick={onExportKmz}
            disabled={!hasPolygon || isExporting}
            className="flex-1 py-2.5 px-4 rounded bg-[#00E676] hover:bg-[#00C853] text-[#000] font-bold text-xs uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(0,230,118,0.2)] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isExporting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Generando KMZ...</span>
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>
                  {importedKmzMeta
                    ? `Exportar Reemplazo RC 2 (.KMZ)`
                    : `Checklist & Exportar KMZ`}
                </span>
              </>
            )}
          </button>

          {/* Secondary formats dropdown */}
          <div className="relative">
            <button
              id="btn-more-export-formats"
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              disabled={!hasPolygon}
              className="h-full px-2.5 bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F] rounded transition-colors disabled:opacity-40"
              title="Más formatos de exportación y respaldo"
            >
              <ChevronDown className="w-4 h-4" />
            </button>

            {showExportMenu && (
              <div
                id="export-formats-menu"
                className="absolute right-0 bottom-full mb-2 w-56 bg-[#15181E] border border-[#2D333F] rounded shadow-2xl p-1.5 z-50 text-xs font-mono"
              >
                <div className="px-2 py-1 text-[9px] font-mono text-[#00E676] uppercase tracking-wider border-b border-[#2D333F] pb-1">
                  Formatos GIS & Respaldo
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onExportMissionJson();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1C1F26] text-[#00E676] flex items-center justify-between font-bold"
                >
                  <span>Proyecto Misión (.JSON)</span>
                  <span className="text-[9px] text-[#717885]">Backup</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportKml();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1C1F26] text-[#E0E0E0] flex items-center justify-between"
                >
                  <span>Google Earth (.KML)</span>
                  <span className="text-[9px] text-[#717885]">GIS</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportGeoJson();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1C1F26] text-[#E0E0E0] flex items-center justify-between"
                >
                  <span>GeoJSON Vector (.JSON)</span>
                  <span className="text-[9px] text-[#717885]">Vector</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onExportCsv();
                    setShowExportMenu(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded hover:bg-[#1C1F26] text-[#E0E0E0] flex items-center justify-between"
                >
                  <span>Waypoints CSV (.CSV)</span>
                  <span className="text-[9px] text-[#717885]">Data</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-[9px] text-center text-[#717885] font-mono">
          Compatible DJI Fly (RC 2 / RC-N2) & Pilot 2: <code className="text-[#00E676]">wpmz/template.kml</code> +{' '}
          <code className="text-[#00E676]">waylines.wpml</code>
        </p>
      </div>
    </aside>
  );
};
