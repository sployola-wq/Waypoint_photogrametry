import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  X,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Plane,
  BatteryCharging,
  Camera,
  Navigation,
  Wrench,
} from 'lucide-react';
import { MissionData, MissionParameters } from '../types/mission';
import { DRONE_PROFILES, DEFAULT_DRONE_PROFILE } from '../utils/droneProfiles';

interface ExportModalProps {
  mission: MissionData;
  isOpen: boolean;
  onClose: () => void;
  onConfirmDownload: () => void;
  onApplyPatch?: (patch: Partial<MissionParameters>) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  mission,
  isOpen,
  onClose,
  onConfirmDownload,
  onApplyPatch,
}) => {
  const [activeGuideTab, setActiveGuideTab] = useState<'djifly' | 'pilot2'>('djifly');

  if (!isOpen) return null;

  const { parameters, metrics, waypoints } = mission;
  const selectedDrone =
    DRONE_PROFILES.find((d) => d.id === parameters.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const fileName = `DJI_WPML_${selectedDrone.id}_${Date.now()}.kmz`;
  const hasCriticalWarnings = metrics.safetyWarnings.some((w) => w.severity === 'critical');
  const isOblique = Math.abs(parameters.gimbalPitch) < 89;

  return (
    <div
      id="export-dji-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in"
    >
      <div className="bg-[#15181E] border border-[#2D333F] rounded w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden font-sans tabular-nums">
        {/* Header */}
        <div className="p-3.5 border-b border-[#2D333F] flex items-center justify-between bg-[#15181E] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#00E676] flex items-center justify-center text-black font-bold shadow-[0_0_12px_rgba(0,230,118,0.3)]">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Checklist Pre-Vuelo & Exportación DJI WPML 3.0 (.KMZ)
              </h3>
              <p className="text-[11px] text-[#717885]">
                Verificación operacional para DJI Fly (RC 2 / RC-N2) y DJI Pilot 2
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#717885] hover:text-white hover:bg-[#1C1F26] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-3.5 text-xs text-[#E0E0E0] overflow-y-auto custom-scrollbar">
          {/* Pre-Flight Checklist Grid */}
          <div
            id="preflight-checklist-summary"
            className="p-3 bg-[#0F1115] border border-[#2D333F] rounded space-y-2.5 font-mono"
          >
            <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#00E676] flex items-center gap-1.5">
                <Plane className="w-3.5 h-3.5 text-[#00E676]" />
                <span>Resumen de Verificación Pre-Vuelo</span>
              </span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                  hasCriticalWarnings
                    ? 'bg-[#FF5252]/20 text-[#FF5252] border border-[#FF5252]/40'
                    : metrics.safetyWarnings.length > 0
                    ? 'bg-[#FFB300]/20 text-[#FFB300] border border-[#FFB300]/40'
                    : 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/30'
                }`}
              >
                {hasCriticalWarnings
                  ? 'REVISAR ALERTAS CRÍTICAS'
                  : metrics.safetyWarnings.length > 0
                  ? 'PRECAUCIÓN OPERACIONAL'
                  : 'PARÁMETROS NOMINALES OK'}
              </span>
            </div>

            {/* Selected Drone Row */}
            <div className="flex items-center justify-between text-[11px] bg-[#15181E] px-2.5 py-1.5 rounded border border-[#2D333F]">
              <span className="text-[#717885]">Drone & Sensor Seleccionado:</span>
              <span className="text-white font-bold truncate max-w-[340px]">
                {selectedDrone.name}
              </span>
            </div>

            {/* 6 Key Verification Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase">
                  GSD Resultante {isOblique ? '(Nadir / Oblicuo)' : ''}
                </span>
                <span className="text-[#00E676] font-bold text-xs">
                  {metrics.gsdCmPx} cm/px
                  {isOblique ? ` (${metrics.effectiveGsdCmPx} cm/px)` : ''}
                </span>
              </div>

              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase flex items-center gap-1">
                  <Camera className="w-2.5 h-2.5 text-[#00E676]" />
                  <span>Intervalo de Disparo</span>
                </span>
                <span
                  className={`font-bold text-xs ${
                    metrics.photoIntervalSec < metrics.minSafeIntervalSec
                      ? 'text-[#FF5252]'
                      : 'text-white'
                  }`}
                >
                  {metrics.photoIntervalSec}s{' '}
                  <span className="text-[9px] font-normal text-[#717885]">
                    (mín {metrics.minSafeIntervalSec}s)
                  </span>
                </span>
              </div>

              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase flex items-center gap-1">
                  <BatteryCharging className="w-2.5 h-2.5 text-[#F27D26]" />
                  <span>Baterías Estimadas</span>
                </span>
                <span className="text-[#F27D26] font-bold text-xs">
                  {metrics.batteryCount} {metrics.batteryCount === 1 ? 'batería' : 'baterías'}{' '}
                  <span className="text-[9px] font-normal text-[#717885]">
                    ({parameters.batteryFlightTimeMin}m/bat)
                  </span>
                </span>
              </div>

              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase flex items-center gap-1">
                  <Navigation className="w-2.5 h-2.5 text-[#00E676]" />
                  <span>Altitud Tránsito / RTH</span>
                </span>
                <span
                  className={`font-bold text-xs ${
                    parameters.takeOffSecurityHeight < 25 ? 'text-[#FFB300]' : 'text-white'
                  }`}
                >
                  Tránsito {parameters.takeOffSecurityHeight}m · RTH {parameters.rthAltitude}m
                </span>
              </div>

              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase">
                  Motion Blur & Velocidad
                </span>
                <span className="text-white font-bold text-xs">
                  {metrics.estimatedMotionBlurPx} px a {parameters.speed} m/s
                </span>
              </div>

              <div className="p-2 bg-[#15181E] border border-[#2D333F] rounded">
                <span className="text-[9px] text-[#717885] block uppercase">
                  Pitch & Offset Óptico
                </span>
                <span className="text-white font-bold text-xs">
                  {parameters.gimbalPitch}°{' '}
                  <span className="text-[9px] font-normal text-[#00E676]">
                    ({isOblique ? `+${metrics.lookAheadOffsetM}m offset` : 'Nadir 0m'})
                  </span>
                </span>
              </div>
            </div>

            {/* Active Pre-Flight Warnings inside Checklist */}
            {metrics.safetyWarnings.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {metrics.safetyWarnings.map((warn) => {
                  const isCrit = warn.severity === 'critical';
                  return (
                    <div
                      key={warn.id}
                      className={`p-2 rounded border flex items-center justify-between gap-2 text-[10px] ${
                        isCrit
                          ? 'bg-[#2A1215] border-[#FF5252] text-[#FF8A80]'
                          : 'bg-[#261E12] border-[#FFB300] text-[#FFE082]'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {isCrit ? (
                          <ShieldAlert className="w-4 h-4 text-[#FF5252] shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-[#FFB300] shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold">{warn.title}</div>
                          <div className="text-[9.5px] text-[#E0E0E0]/90 font-sans">
                            {warn.message}
                          </div>
                        </div>
                      </div>
                      {warn.fixActionLabel && warn.suggestedPatch && onApplyPatch && (
                        <button
                          type="button"
                          onClick={() => onApplyPatch(warn.suggestedPatch!)}
                          className={`px-2.5 py-1 rounded text-[9px] font-mono font-bold uppercase shrink-0 flex items-center gap-1 ${
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
          </div>

          {/* Internal ZIP structure notice */}
          <div className="p-2.5 bg-[#0F1115] border border-[#00E676]/30 rounded space-y-1 font-mono">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#00E676] font-semibold text-xs">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Estructura WPML 3.0 Verificada ({waypoints.length} Waypoints · {metrics.photoCount} Fotos)</span>
              </div>
              <span className="text-[9px] text-[#717885]">
                executeHeightMode: {parameters.heightMode}
              </span>
            </div>
            <div className="text-[10px] text-[#00E676] pl-2 py-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
              <span>📦 {fileName}</span>
              <span className="text-[#E0E0E0]">├── wpmz/template.kml</span>
              <span className="text-[#E0E0E0]">└── wpmz/waylines.wpml</span>
            </div>
          </div>

          {/* Step by Step Loading Instructions (Tabs for DJI Fly RC 2/RC-N2 vs DJI Pilot 2) */}
          <div className="space-y-2 font-mono">
            <div className="flex items-center justify-between border-b border-[#2D333F] pb-1.5">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#00E676]">
                Guía de Carga en Control Remoto DJI
              </h4>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setActiveGuideTab('djifly')}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-colors ${
                    activeGuideTab === 'djifly'
                      ? 'bg-[#00E676] text-black font-bold'
                      : 'bg-[#1C1F26] text-[#717885] hover:text-white border border-[#2D333F]'
                  }`}
                >
                  DJI Fly (Air 3S / Mini 4 Pro · RC 2 / RC-N2)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveGuideTab('pilot2')}
                  className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase transition-colors ${
                    activeGuideTab === 'pilot2'
                      ? 'bg-[#00E676] text-black font-bold'
                      : 'bg-[#1C1F26] text-[#717885] hover:text-white border border-[#2D333F]'
                  }`}
                >
                  DJI Pilot 2 (Enterprise)
                </button>
              </div>
            </div>

            {activeGuideTab === 'djifly' ? (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    1
                  </div>
                  <div>
                    <strong className="text-white block text-xs">
                      Crear misión base en DJI Fly (RC 2 o Smartphone RC-N2)
                    </strong>
                    <span className="text-[#717885] text-[10px]">
                      En DJI Fly abre <strong>Waypoints</strong>, guarda una ruta vacía de 2 puntos para generar la carpeta con su identificador UUID.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    2
                  </div>
                  <div>
                    <strong className="text-white block text-xs">
                      Reemplazar el archivo .KMZ en la carpeta de DJI Fly
                    </strong>
                    <span className="text-[#717885] text-[10px]">
                      Conecta el RC 2 o teléfono por USB-C (MTP) o SD, navega a{' '}
                      <code className="text-[#00E676] bg-[#1C1F26] px-1 py-0.5 rounded border border-[#2D333F]">
                        Android/data/dji.go.v5/files/waypoint/&lt;UUID&gt;/
                      </code>{' '}
                      y reemplaza el archivo <code className="text-white">&lt;UUID&gt;.kmz</code> por el descargado aquí manteniendo el mismo nombre.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    3
                  </div>
                  <div>
                    <strong className="text-white block text-xs">
                      Abrir Misión en DJI Fly y Verificar Altura RTH
                    </strong>
                    <span className="text-[#717885] text-[10px]">
                      Carga la misión desde el historial de Waypoints en DJI Fly, verifica que la cámara esté en modo <strong>{selectedDrone.imageWidthPx > 6000 ? '50MP/48MP' : '12MP'}</strong> y pulsa <strong>Iniciar</strong>.
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    1
                  </div>
                  <div>
                    <strong className="text-white block text-xs">Descargar el archivo .KMZ</strong>
                    <span className="text-[#717885] text-[10px]">
                      Guarda el archivo en tu computadora o transfiérelo directamente a una tarjeta MicroSD / USB.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    2
                  </div>
                  <div>
                    <strong className="text-white block text-xs">
                      Copiar a la memoria del control DJI Enterprise
                    </strong>
                    <span className="text-[#717885] text-[10px]">
                      Inserta la tarjeta SD en el control DJI RC Pro Enterprise o copia en{' '}
                      <code className="text-[#00E676] bg-[#1C1F26] px-1 py-0.5 rounded border border-[#2D333F]">
                        /DJI/waypoint/
                      </code>
                      .
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2 bg-[#0F1115] border border-[#2D333F] rounded">
                  <div className="w-4 h-4 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center font-bold text-[10px] shrink-0">
                    3
                  </div>
                  <div>
                    <strong className="text-white block text-xs">
                      Abrir e Iniciar en DJI Pilot 2
                    </strong>
                    <span className="text-[#717885] text-[10px]">
                      Entra a <strong>DJI Pilot 2 &gt; Flight Route &gt; Importar KMZ</strong> y pulsa <strong>Ejecutar Misión</strong>.
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[#2D333F] bg-[#15181E] flex items-center justify-between gap-2 shrink-0 font-mono">
          <span className="text-[10px] text-[#717885] hidden sm:inline">
            {hasCriticalWarnings
              ? '⚠️ Existen alertas de intervalo/velocidad pendientes'
              : '✓ Checklist pre-vuelo verificado'}
          </span>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#717885] hover:text-white text-xs border border-[#2D333F] transition-colors"
            >
              Cancelar
            </button>

            <button
              id="btn-confirm-download-kmz"
              type="button"
              onClick={() => {
                onConfirmDownload();
                onClose();
              }}
              className="px-4 py-1.5 rounded bg-[#00E676] hover:bg-[#00C853] text-black font-bold text-xs uppercase flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,230,118,0.25)] transition-all font-mono"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Confirmar y Descargar .KMZ</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
