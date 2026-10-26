import React, { useState } from 'react';
import { Table, Download, X, Search, Camera, Video, Clock } from 'lucide-react';
import { MissionData, WaypointPhase } from '../types/mission';
import { generateCsvWaypoints, triggerFileDownload } from '../utils/wpmlGenerator';
import { sanitizeTextInput } from '../utils/gridGenerator';

interface WaypointTableModalProps {
  mission: MissionData;
  isOpen: boolean;
  onClose: () => void;
}

export const WaypointTableModal: React.FC<WaypointTableModalProps> = ({
  mission,
  isOpen,
  onClose,
}) => {
  const [search, setSearch] = useState('');
  const [filterPhotosOnly, setFilterPhotosOnly] = useState(false);

  if (!isOpen) return null;

  const cleanSearch = sanitizeTextInput(search, 60).toLowerCase();

  const filteredWaypoints = mission.waypoints.filter((wp) => {
    if (filterPhotosOnly && !wp.isPhotoPoint) return false;
    if (cleanSearch) {
      return (
        wp.id.toString().includes(cleanSearch) ||
        wp.lat.toFixed(6).includes(cleanSearch) ||
        wp.lng.toFixed(6).includes(cleanSearch) ||
        (wp.phaseLabel && wp.phaseLabel.toLowerCase().includes(cleanSearch))
      );
    }
    return true;
  });

  const handleDownloadCsv = () => {
    const csvContent = generateCsvWaypoints(mission);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    triggerFileDownload(blob, `waypoints_mission_${Date.now()}.csv`);
  };

  const getPhaseBadgeClass = (phase?: WaypointPhase) => {
    switch (phase) {
      case 'orbit-inner':
        return 'bg-[#38BDF8]/15 text-[#38BDF8] border-[#38BDF8]/40';
      case 'orbit-outer':
      case 'grid-cross':
        return 'bg-[#FFB300]/15 text-[#FFB300] border-[#FFB300]/40';
      case 'imported':
        return 'bg-[#E879F9]/15 text-[#E879F9] border-[#E879F9]/40';
      case 'grid-primary':
      default:
        return 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]/40';
    }
  };

  return (
    <div
      id="waypoint-table-modal"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in"
    >
      <div className="bg-[#15181E] border border-[#2D333F] rounded w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden font-sans tabular-nums">
        {/* Modal Header */}
        <div className="p-3.5 border-b border-[#2D333F] flex items-center justify-between bg-[#15181E] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#1C1F26] text-[#00E676] border border-[#2D333F] flex items-center justify-center">
              <Table className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Tabla de Waypoints Multi-Fase ({mission.waypoints.length} puntos)
              </h3>
              <p className="text-[11px] text-[#717885]">
                Inspección de coordenadas WGS84, fase de vuelo, rumbo (heading), inclinación de gimbal y Δ cota.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] text-xs font-mono flex items-center gap-1.5 border border-[#2D333F] transition-colors"
            >
              <Download className="w-3 h-3 text-[#00E676]" />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded text-[#717885] hover:text-white hover:bg-[#1C1F26] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="p-2.5 border-b border-[#2D333F] bg-[#0F1115] flex items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              maxLength={60}
              value={search}
              onChange={(e) => setSearch(e.target.value.replace(/[<>"'`\\]/g, ''))}
              placeholder="Buscar por ID, fase o coordenada..."
              className="w-full bg-[#1C1F26] border border-[#2D333F] rounded pl-7 pr-3 py-1 text-xs text-[#E0E0E0] placeholder-[#717885] focus:outline-none focus:border-[#00E676] font-mono"
            />
            <Search className="w-3 h-3 text-[#717885] absolute left-2 top-2" />
          </div>

          <label className="flex items-center gap-2 text-[#717885] hover:text-[#E0E0E0] cursor-pointer text-xs font-mono">
            <input
              type="checkbox"
              checked={filterPhotosOnly}
              onChange={(e) => setFilterPhotosOnly(e.target.checked)}
              className="accent-[#00E676] rounded cursor-pointer"
            />
            <span>Solo puntos de captura activa</span>
          </label>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-xs bg-[#0F1115]">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#15181E] text-[#717885] sticky top-0 border-b border-[#2D333F] text-[10px] uppercase">
              <tr>
                <th className="py-2 px-2.5">#</th>
                <th className="py-2 px-2.5">Fase / Patrón</th>
                <th className="py-2 px-2.5">Latitud</th>
                <th className="py-2 px-2.5">Longitud</th>
                <th className="py-2 px-2.5">Altitud (Δ Cota)</th>
                <th className="py-2 px-2.5">Rumbo (Yaw)</th>
                <th className="py-2 px-2.5">Gimbal</th>
                <th className="py-2 px-2.5">Batería</th>
                <th className="py-2 px-2.5">Acción WPML</th>
                <th className="py-2 px-2.5 text-right">Dist. Acum.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2D333F]/60 text-[#E0E0E0]">
              {filteredWaypoints.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-8 text-[#717885]">
                    No se encontraron waypoints que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : (
                filteredWaypoints.map((wp) => (
                  <tr
                    key={wp.id}
                    className={`hover:bg-[#1C1F26]/60 transition-colors text-[11px] ${
                      wp.isBatterySwapPoint ? 'bg-[#F27D26]/10' : ''
                    }`}
                  >
                    <td className="py-1.5 px-2.5 font-bold text-[#00E676]">{wp.id}</td>
                    <td className="py-1.5 px-2.5">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${getPhaseBadgeClass(
                          wp.phase
                        )}`}
                      >
                        {wp.phaseLabel || 'Grilla'}
                      </span>
                    </td>
                    <td className="py-1.5 px-2.5">{wp.lat.toFixed(7)}</td>
                    <td className="py-1.5 px-2.5">{wp.lng.toFixed(7)}</td>
                    <td className="py-1.5 px-2.5 text-white">
                      {wp.altitude}m
                      {wp.terrainDeltaM !== undefined && wp.terrainDeltaM !== 0 && (
                        <span className="text-[9px] text-[#38BDF8] ml-1">
                          ({wp.terrainDeltaM > 0 ? `+${wp.terrainDeltaM}` : wp.terrainDeltaM}m)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-white font-bold">{wp.heading}°</td>
                    <td className="py-1.5 px-2.5 text-[#00E676]">{wp.gimbalPitch}°</td>
                    <td className="py-1.5 px-2.5">
                      {wp.isBatterySwapPoint ? (
                        <span className="text-[#F27D26] text-[9px] font-bold">
                          🔋 RECAMBIO BAT {wp.batteryIndex}⇄{(wp.batteryIndex || 1) + 1}
                        </span>
                      ) : (
                        <span className="text-[#717885] text-[9px]">Bat {wp.batteryIndex || 1}</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5">
                      {wp.actionType === 'startRecord' ? (
                        <span className="text-[#FF5252] text-[9px] flex items-center gap-1 w-max font-bold">
                          <Video className="w-2.5 h-2.5" />
                          <span>startRecord</span>
                        </span>
                      ) : wp.actionType === 'stopRecord' ? (
                        <span className="text-[#FFB300] text-[9px] flex items-center gap-1 w-max font-bold">
                          <Video className="w-2.5 h-2.5" />
                          <span>stopRecord</span>
                        </span>
                      ) : wp.actionType === 'takePhoto' ? (
                        <span className="text-[#00E676] text-[9px] flex items-center gap-1 w-max">
                          <Camera className="w-2.5 h-2.5" />
                          <span>takePhoto</span>
                        </span>
                      ) : (
                        <span className="text-[#717885] text-[9px] flex items-center gap-1 w-max">
                          <Clock className="w-2.5 h-2.5" />
                          <span>Gimbal / Timed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2.5 text-right text-[#717885]">
                      {wp.distanceFromStartM.toFixed(1)}m
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-2.5 border-t border-[#2D333F] bg-[#15181E] flex items-center justify-between text-xs text-[#717885] shrink-0 font-mono">
          <span>
            Mostrando {filteredWaypoints.length} de {mission.waypoints.length} waypoints
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
