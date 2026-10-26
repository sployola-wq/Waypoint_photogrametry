import React, { useState } from 'react';
import {
  Plane,
  FileCode,
  Table,
  Play,
  Pause,
  RotateCcw,
  Search,
  Crosshair,
  Layers,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { DEMO_AREAS, DemoArea } from '../utils/demoAreas';
import { sanitizeTextInput } from '../utils/gridGenerator';

interface HeaderProps {
  onSelectDemoArea: (demo: DemoArea) => void;
  onLocateUser: () => void;
  onSearchLocation: (query: string) => void;
  onToggleXmlModal: () => void;
  onToggleTableModal: () => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  onResetSimulation: () => void;
  activeMapLayer: string;
  onSelectMapLayer: (layer: string) => void;
  hasPolygon: boolean;
  waypointCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  onSelectDemoArea,
  onLocateUser,
  onSearchLocation,
  onToggleXmlModal,
  onToggleTableModal,
  isSimulating,
  onToggleSimulation,
  onResetSimulation,
  activeMapLayer,
  onSelectMapLayer,
  hasPolygon,
  waypointCount,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showDemos, setShowDemos] = useState(false);
  const [showLayers, setShowLayers] = useState(false);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = sanitizeTextInput(searchQuery, 120);
    if (!cleaned) return;
    setIsSearching(true);
    onSearchLocation(cleaned);
    setTimeout(() => setIsSearching(false), 800);
  };

  return (
    <header
      id="app-header"
      className="h-14 bg-[#15181E] border-b border-[#2D333F] px-4 md:px-6 flex items-center justify-between gap-4 z-30 shrink-0 select-none text-[#E0E0E0]"
    >
      {/* Brand Zone */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 bg-[#00E676] rounded flex items-center justify-center text-black font-bold">
          <Plane className="w-4 h-4 transform -rotate-45" />
        </div>
        <h1 className="text-sm md:text-base font-bold tracking-tight text-white font-['Chakra_Petch'] whitespace-nowrap shrink-0">
          DJI WPML Planner
        </h1>
      </div>

      {/* Middle Tools: Geocoder Search & Presets */}
      <div className="hidden lg:flex items-center gap-2 flex-1 max-w-xl mx-4">
        {/* Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <input
            id="location-search-input"
            type="text"
            maxLength={120}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value.replace(/[<>"'`\\]/g, ''))}
            placeholder="Buscar ciudad, predio o coordenadas (ej. -34.985, -71.240)..."
            className="w-full bg-[#1C1F26] border border-[#2D333F] rounded pl-8 pr-8 py-1.5 text-xs text-[#E0E0E0] placeholder-[#717885] focus:outline-none focus:border-[#00E676] transition-all font-sans"
          />
          <Search
            className={`w-3.5 h-3.5 absolute left-2.5 top-2.5 ${
              isSearching ? 'text-[#00E676]' : 'text-[#717885]'
            }`}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-2 text-xs text-[#717885] hover:text-white"
            >
              ✕
            </button>
          )}
        </form>

        {/* My Location */}
        <button
          id="btn-locate-user"
          type="button"
          onClick={onLocateUser}
          title="Centrar en mi ubicación GPS actual"
          className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] hover:text-white border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-medium font-mono whitespace-nowrap shrink-0"
        >
          <Crosshair className="w-3.5 h-3.5 text-[#00E676]" />
          <span>GPS</span>
        </button>

        {/* Demo Areas Dropdown */}
        <div className="relative">
          <button
            id="btn-demo-areas"
            type="button"
            onClick={() => {
              setShowDemos(!showDemos);
              setShowLayers(false);
            }}
            className="px-3 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-medium font-mono whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#00E676]" />
            <span>Áreas Demo</span>
            <ChevronDown className="w-3 h-3 text-[#717885]" />
          </button>

          {showDemos && (
            <div
              id="demo-areas-dropdown"
              className="absolute left-0 mt-1.5 w-72 bg-[#15181E] border border-[#2D333F] rounded shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100"
            >
              <div className="px-2 py-1 text-[10px] font-mono text-[#00E676] uppercase tracking-widest border-b border-[#2D333F] pb-1">
                Escenarios de Misión
              </div>
              <div className="space-y-1 mt-1">
                {DEMO_AREAS.map((demo) => (
                  <button
                    key={demo.id}
                    onClick={() => {
                      onSelectDemoArea(demo);
                      setShowDemos(false);
                    }}
                    className="w-full text-left p-2 rounded hover:bg-[#1C1F26] transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#E0E0E0] group-hover:text-[#00E676] truncate">
                        {demo.name}
                      </span>
                      <span className="text-[9px] text-[#717885] font-mono shrink-0">
                        {demo.category}
                      </span>
                    </div>
                    <p className="text-[10px] text-[#717885] line-clamp-1 mt-0.5 font-sans">
                      {demo.locationName}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Map Layers Dropdown */}
        <div className="relative">
          <button
            id="btn-map-layers"
            type="button"
            onClick={() => {
              setShowLayers(!showLayers);
              setShowDemos(false);
            }}
            className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] text-[#E0E0E0] border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-medium font-mono whitespace-nowrap shrink-0"
          >
            <Layers className="w-3.5 h-3.5 text-[#00E676]" />
            <span>Capas</span>
          </button>

          {showLayers && (
            <div
              id="map-layers-dropdown"
              className="absolute left-0 mt-1.5 w-48 bg-[#15181E] border border-[#2D333F] rounded shadow-2xl p-1.5 z-50 text-xs"
            >
              {[
                { id: 'esri-sat', label: 'Esri World Satélite' },
                { id: 'google-sat', label: 'Satélite Híbrido' },
                { id: 'osm-standard', label: 'OpenStreetMap Topo' },
                { id: 'carto-dark', label: 'Carto Dark Matter' },
              ].map((layer) => (
                <button
                  key={layer.id}
                  onClick={() => {
                    onSelectMapLayer(layer.id);
                    setShowLayers(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded transition-colors flex items-center justify-between font-mono text-xs ${
                    activeMapLayer === layer.id
                      ? 'bg-[#00E676]/15 text-[#00E676] font-semibold border border-[#00E676]/30'
                      : 'text-[#E0E0E0] hover:bg-[#1C1F26]'
                  }`}
                >
                  <span>{layer.label}</span>
                  {activeMapLayer === layer.id && <span className="text-[#00E676]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Tools: Simulator, Waypoint Inspector, WPML Live Code */}
      <div className="flex items-center gap-2 shrink-0 tabular-nums">
        {/* Flight Simulator Button */}
        {hasPolygon && waypointCount > 0 && (
          <div className="flex items-center bg-[#1C1F26] p-0.5 rounded border border-[#2D333F]">
            <button
              id="btn-flight-simulation"
              type="button"
              onClick={onToggleSimulation}
              className={`px-2.5 py-1 rounded text-xs font-mono uppercase tracking-wider flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 ${
                isSimulating
                  ? 'bg-[#00E676] text-black font-bold shadow-[0_0_12px_rgba(0,230,118,0.3)]'
                  : 'text-[#E0E0E0] hover:text-white hover:bg-[#252A34]'
              }`}
            >
              {isSimulating ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  <span>Pausar Sim</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current text-[#00E676]" />
                  <span>Simular</span>
                </>
              )}
            </button>
            {isSimulating && (
              <button
                type="button"
                onClick={onResetSimulation}
                title="Reiniciar simulación al Waypoint 0"
                className="p-1 text-[#717885] hover:text-white rounded hover:bg-[#252A34]"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Waypoint Table Button */}
        <button
          id="btn-open-waypoints-table"
          type="button"
          onClick={onToggleTableModal}
          disabled={!hasPolygon || waypointCount === 0}
          className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] disabled:opacity-30 disabled:cursor-not-allowed text-[#E0E0E0] border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-mono whitespace-nowrap shrink-0"
          title="Ver tabla detallada de waypoints"
        >
          <Table className="w-3.5 h-3.5 text-[#00E676]" />
          <span className="hidden sm:inline">Waypoints</span>
          <span className="text-[10px] text-[#00E676] font-mono font-bold">
            · {waypointCount}
          </span>
        </button>

        {/* WPML Code Inspector Button */}
        <button
          id="btn-open-wpml-inspector"
          type="button"
          onClick={onToggleXmlModal}
          disabled={!hasPolygon || waypointCount === 0}
          className="px-2.5 py-1.5 rounded bg-[#1C1F26] hover:bg-[#252A34] disabled:opacity-30 disabled:cursor-not-allowed text-[#E0E0E0] border border-[#2D333F] transition-colors flex items-center gap-1.5 text-xs font-mono whitespace-nowrap shrink-0"
          title="Inspeccionar código XML WPML generado"
        >
          <FileCode className="w-3.5 h-3.5 text-[#00E676]" />
          <span className="hidden sm:inline">XML WPML</span>
        </button>
      </div>
    </header>
  );
};
