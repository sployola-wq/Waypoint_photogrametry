import React from 'react';
import {
  Camera,
  Maximize2,
  Grid,
  TrendingUp,
  BatteryCharging,
  Home,
  AlertTriangle,
  ShieldAlert,
  Gauge,
  Eye,
  Wrench,
  Layers,
  Mountain,
} from 'lucide-react';
import { PhotogrammetryMetrics, MissionParameters } from '../types/mission';
import { DRONE_PROFILES, DEFAULT_DRONE_PROFILE } from '../utils/droneProfiles';

interface TelemetryCardProps {
  metrics: PhotogrammetryMetrics;
  parameters: MissionParameters;
  hasPolygon: boolean;
  onApplyPatch?: (patch: Partial<MissionParameters>) => void;
}

export const TelemetryCard: React.FC<TelemetryCardProps> = ({
  metrics,
  parameters,
  hasPolygon,
  onApplyPatch,
}) => {
  const selectedDrone =
    DRONE_PROFILES.find((d) => d.id === parameters.droneProfileId) || DEFAULT_DRONE_PROFILE;

  // Format seconds to mm:ss
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.floor(totalSeconds % 60);
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const isOblique = Math.abs(parameters.gimbalPitch) < 89;
  const isIntervalCritical =
    metrics.photoIntervalSec < (selectedDrone.isHighResBufferMode ? 3.0 : 2.0);
  const isIntervalWarning =
    !isIntervalCritical &&
    selectedDrone.isHighResBufferMode &&
    metrics.photoIntervalSec < 3.5;

  const isSpeedOverRecommended = parameters.speed > metrics.recommendedMaxSpeedMs;

  return (
    <div
      id="telemetry-dashboard-card"
      className="bg-[#15181E] border border-[#2D333F] rounded p-3 space-y-3 tabular-nums"
    >
      <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
        <h2 className="text-[10px] font-mono uppercase text-[#00E676] tracking-widest flex items-center gap-1.5">
          <span>Telemetría y Estimación de Vuelo</span>
        </h2>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#1C1F26] border border-[#2D333F] text-[#00E676] tracking-wider">
          GSD: {metrics.gsdCmPx} cm/px
        </span>
      </div>

      {/* Pre-Flight Safety Warnings (Yellow / Red Alerts) */}
      {metrics.safetyWarnings && metrics.safetyWarnings.length > 0 && (
        <div id="safety-warnings-panel" className="space-y-1.5">
          {metrics.safetyWarnings.map((warn) => {
            const isCrit = warn.severity === 'critical';
            return (
              <div
                key={warn.id}
                className={`p-2 rounded border text-[10px] font-mono space-y-1 ${
                  isCrit
                    ? 'bg-[#2A1215] border-[#FF5252] text-[#FF8A80]'
                    : 'bg-[#261E12] border-[#FFB300] text-[#FFE082]'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    {isCrit ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-[#FF5252] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 text-[#FFB300] shrink-0" />
                    )}
                    <span className={isCrit ? 'text-[#FF5252]' : 'text-[#FFB300]'}>
                      {warn.title}
                    </span>
                  </div>
                </div>
                <p className="text-[9.5px] leading-snug text-[#E0E0E0]/90 font-sans">
                  {warn.message}
                </p>
                {warn.fixActionLabel && warn.suggestedPatch && onApplyPatch && (
                  <button
                    type="button"
                    onClick={() => onApplyPatch(warn.suggestedPatch!)}
                    className={`mt-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-colors ${
                      isCrit
                        ? 'bg-[#FF5252] text-black hover:bg-[#FF1744]'
                        : 'bg-[#FFB300] text-black hover:bg-[#FFA000]'
                    }`}
                  >
                    <Wrench className="w-2.5 h-2.5" />
                    <span>{warn.fixActionLabel}</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4-cell High Density Summary Grid */}
      <div className="grid grid-cols-2 gap-2 bg-[#1C1F26] p-2.5 rounded border border-[#2D333F]">
        <div className="text-center border-r border-[#2D333F] pr-1">
          <div className="text-base font-mono font-bold text-white">
            {hasPolygon ? metrics.areaHa : '--'}{' '}
            <span className="text-[9px] font-normal text-[#717885]">ha</span>
          </div>
          <div className="text-[8px] text-[#717885] uppercase tracking-wider font-mono">
            Área Mapeo
          </div>
        </div>

        <div className="text-center pl-1">
          <div className="text-base font-mono font-bold text-[#00E676]">
            {hasPolygon ? formatTime(metrics.estimatedFlightTimeSec) : '--'}
          </div>
          <div className="text-[8px] text-[#717885] uppercase tracking-wider font-mono">
            Tiempo Fotogrametría
          </div>
        </div>

        <div className="text-center border-r border-[#2D333F] pt-2 mt-1 border-t border-[#2D333F] pr-1">
          <div className="text-base font-mono font-bold text-white">
            {hasPolygon ? metrics.photoCount : '--'}
            {hasPolygon && metrics.waypointCount !== metrics.photoCount && (
              <span className="text-[9px] font-normal text-[#38BDF8] ml-1">
                ({metrics.waypointCount} WPs)
              </span>
            )}
          </div>
          <div className="text-[8px] text-[#717885] uppercase tracking-wider font-mono">
            {parameters.waypointDensity === 'endpoints-only'
              ? 'Fotos Est. (Modo Ligero)'
              : 'Fotos / Waypoints'}
          </div>
        </div>

        <div className="text-center pt-2 mt-1 border-t border-[#2D333F] pl-1">
          <div className="text-base font-mono font-bold text-[#F27D26] flex items-center justify-center gap-1">
            <span>{hasPolygon ? metrics.batteryCount : '--'}</span>
            <span className="text-[10px] font-normal text-[#717885]">
              {metrics.batteryCount === 1 ? 'batería' : 'baterías'}
            </span>
          </div>
          <div className="text-[8px] text-[#717885] uppercase tracking-wider font-mono">
            {hasPolygon && metrics.batterySwapPoints && metrics.batterySwapPoints.length > 0
              ? `${metrics.batterySwapPoints.length} ${metrics.batterySwapPoints.length === 1 ? 'relevo' : 'relevos'} en vuelo`
              : '1 vuelo continuo'}
          </div>
        </div>
      </div>

      {/* Multi-Phase 3DGS / Double Grid Summary Badge */}
      {hasPolygon && parameters.missionPattern !== 'single-grid' && (
        <div className="p-2 bg-[#0F1115] border border-[#2D333F] rounded space-y-1 font-mono text-[10px]">
          <div className="flex items-center justify-between text-[#00E676]">
            <span className="flex items-center gap-1 font-bold uppercase text-[9px] tracking-wider">
              <Layers className="w-3 h-3" />
              <span>
                {parameters.missionPattern === 'combo-3dgs-pro'
                  ? 'Receta Combo 3DGS Pro (3 Fases)'
                  : parameters.missionPattern === 'double-grid'
                  ? 'Grilla Doble Cruzada 3D'
                  : parameters.missionPattern === 'orbit-poi'
                  ? 'Órbita Perimetral POI'
                  : 'Misión KMZ Importada'}
              </span>
            </span>
            <span className="text-[9px] text-white font-bold">
              {metrics.waypointCount} WPs totales
            </span>
          </div>
          {parameters.missionPattern === 'combo-3dgs-pro' && metrics.phaseCounts && (
            <div className="grid grid-cols-3 gap-1 pt-1 text-[9px]">
              <div className="bg-[#15181E] border border-[#38BDF8]/40 rounded px-1.5 py-1 text-center">
                <div className="text-[#38BDF8] font-bold">
                  F1 ({parameters.comboInnerPitch}°)
                </div>
                <div className="text-white">{metrics.phaseCounts['orbit-inner']} WPs</div>
              </div>
              <div className="bg-[#15181E] border border-[#00E676]/40 rounded px-1.5 py-1 text-center">
                <div className="text-[#00E676] font-bold">F2 (-90°)</div>
                <div className="text-white">{metrics.phaseCounts['grid-primary']} WPs</div>
              </div>
              <div className="bg-[#15181E] border border-[#FFB300]/40 rounded px-1.5 py-1 text-center">
                <div className="text-[#FFB300] font-bold">
                  F3 ({parameters.comboOuterPitch}°)
                </div>
                <div className="text-white">{metrics.phaseCounts['orbit-outer']} WPs</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terrain Follow Elevation Delta Summary */}
      {hasPolygon && parameters.terrainFollowEnabled && (
        <div className="p-2 bg-[#0F1115] border border-[#00E676]/40 rounded flex items-center justify-between font-mono text-[10px]">
          <span className="flex items-center gap-1.5 text-[#00E676] font-bold">
            <Mountain className="w-3.5 h-3.5" />
            <span>Δ Cota Terreno (AGL Constante):</span>
          </span>
          <span className="text-white font-bold">
            {metrics.minTerrainDeltaM >= 0 ? `+${metrics.minTerrainDeltaM}` : metrics.minTerrainDeltaM}m a{' '}
            {metrics.maxTerrainDeltaM >= 0 ? `+${metrics.maxTerrainDeltaM}` : metrics.maxTerrainDeltaM}m
          </span>
        </div>
      )}

      {/* Electronic Rolling Shutter Physics & Trigger Interval Telemetry */}
      <div
        id="rolling-shutter-telemetry"
        className="p-2 bg-[#0F1115] border border-[#2D333F] rounded space-y-1.5 font-mono text-[10px]"
      >
        <div className="flex items-center justify-between border-b border-[#2D333F] pb-1">
          <span className="text-[9px] uppercase tracking-wider text-[#00E676] font-bold flex items-center gap-1">
            <Gauge className="w-3 h-3 text-[#00E676]" />
            <span>Física de Obturador & Buffer SD</span>
          </span>
          <span className="text-[9px] text-[#717885]">
            {selectedDrone.shutterType === 'electronic' ? 'Rolling Shutter' : 'Global / Mecánico'}
          </span>
        </div>

        {/* Trigger Interval Row */}
        <div className="flex items-center justify-between">
          <span className="text-[#A0AAB8]">Intervalo Disparo (t = d/V):</span>
          <span
            className={`font-bold ${
              isIntervalCritical
                ? 'text-[#FF5252]'
                : isIntervalWarning
                ? 'text-[#FFB300]'
                : 'text-[#00E676]'
            }`}
          >
            {metrics.photoIntervalSec}s{' '}
            <span className="text-[9px] font-normal text-[#717885]">
              (mín {metrics.minSafeIntervalSec}s)
            </span>
          </span>
        </div>

        {/* Motion Blur Row */}
        <div className="flex items-center justify-between">
          <span className="text-[#A0AAB8]">Motion Blur Est. (1/800s):</span>
          <span
            className={`font-bold ${
              metrics.estimatedMotionBlurPx > 1.0
                ? 'text-[#FF5252]'
                : metrics.estimatedMotionBlurPx > 0.75
                ? 'text-[#FFB300]'
                : 'text-white'
            }`}
          >
            {metrics.estimatedMotionBlurPx} px{' '}
            <span className="text-[9px] font-normal text-[#717885]">
              ({metrics.estimatedMotionBlurMm} mm)
            </span>
          </span>
        </div>

        {/* Max Recommended Speed Row */}
        <div className="flex items-center justify-between">
          <span className="text-[#A0AAB8]">Vel. Máx Recomendada:</span>
          <span
            className={`font-bold ${
              isSpeedOverRecommended ? 'text-[#FFB300]' : 'text-[#00E676]'
            }`}
          >
            ≤ {metrics.recommendedMaxSpeedMs} m/s{' '}
            <span className="text-[9px] font-normal text-[#717885]">
              ({Math.round(metrics.recommendedMaxSpeedMs * 3.6)} km/h)
            </span>
          </span>
        </div>

        {/* Oblique Look-Ahead Offset Row (shown when gimbal pitch is not Nadir) */}
        {isOblique && (
          <div className="pt-1 border-t border-[#2D333F] flex items-center justify-between text-[#00E676]">
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>Offset Centro Óptico ({parameters.gimbalPitch}°):</span>
            </span>
            <span className="font-bold text-white">
              +{metrics.lookAheadOffsetM} m{' '}
              <span className="text-[9px] font-normal text-[#717885]">
                (GSD Oblicuo {metrics.effectiveGsdCmPx} cm/px)
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Battery & Pilot RTH Summary Card */}
      {hasPolygon && (
        <div className="p-2 bg-[#0F1115] border border-[#2D333F] rounded space-y-1.5 font-mono text-[10px]">
          <div className="flex items-center justify-between text-[#E0E0E0]">
            <span className="flex items-center gap-1 text-[#F27D26]">
              <BatteryCharging className="w-3 h-3" />
              <span>Autonomía Operativa:</span>
            </span>
            <span className="text-white font-bold">
              {parameters.batteryFlightTimeMin || 30} min/bat
              {selectedDrone.nominalBatteryMin
                ? ` (${selectedDrone.nominalBatteryMin}m nom.)`
                : ''}
            </span>
          </div>

          <div className="flex items-center justify-between text-[#E0E0E0]">
            <span className="flex items-center gap-1 text-[#00E676]">
              <Home className="w-3 h-3" />
              <span>Retorno a Pies del Piloto:</span>
            </span>
            <span className="text-[#00E676] font-bold">
              {parameters.finishAction === 'goHome'
                ? `Activo (RTH ${parameters.rthAltitude}m)`
                : parameters.finishAction}
            </span>
          </div>

          {metrics.transitDistanceM > 0 && (
            <div className="flex items-center justify-between text-[#717885] text-[9px] pt-1 border-t border-[#2D333F]">
              <span>Tránsito total (Despegue + RTH + Swaps):</span>
              <span className="text-white font-mono">{metrics.transitDistanceM} m</span>
            </div>
          )}
        </div>
      )}

      {/* High Density Detailed Telemetry Values */}
      <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
        {/* Footprint */}
        <div className="bg-[#1C1F26] border border-[#2D333F] rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717885] text-[9px] uppercase tracking-wider">
            <span>Pisada Tierra</span>
            <Maximize2 className="w-2.5 h-2.5 text-[#00E676]" />
          </div>
          <div className="text-xs font-bold text-white mt-1">
            {metrics.groundFootprintWidthM}×{metrics.groundFootprintHeightM}m
          </div>
        </div>

        {/* Line spacing */}
        <div className="bg-[#1C1F26] border border-[#2D333F] rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717885] text-[9px] uppercase tracking-wider">
            <span>Espaciado Pasadas</span>
            <Grid className="w-2.5 h-2.5 text-[#00E676]" />
          </div>
          <div className="text-xs font-bold text-white mt-1">
            {hasPolygon
              ? `${metrics.lineSpacingM}m (${metrics.transectCount} líneas)`
              : `${metrics.lineSpacingM}m`}
          </div>
        </div>

        {/* Photo trigger spacing */}
        <div className="bg-[#1C1F26] border border-[#2D333F] rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717885] text-[9px] uppercase tracking-wider">
            <span>Disparo / Foto</span>
            <Camera className="w-2.5 h-2.5 text-[#00E676]" />
          </div>
          <div className="text-xs font-bold text-white mt-1">
            c/{metrics.photoSpacingM}m ({metrics.photoIntervalSec}s)
          </div>
        </div>

        {/* Distance */}
        <div className="bg-[#1C1F26] border border-[#2D333F] rounded p-2 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[#717885] text-[9px] uppercase tracking-wider">
            <span>Distancia Mapeo</span>
            <TrendingUp className="w-2.5 h-2.5 text-[#00E676]" />
          </div>
          <div className="text-xs font-bold text-white mt-1">
            {hasPolygon
              ? metrics.totalDistanceM >= 1000
                ? `${(metrics.totalDistanceM / 1000).toFixed(2)} km`
                : `${metrics.totalDistanceM} m`
              : '--'}
          </div>
        </div>
      </div>
    </div>
  );
};
