import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useDeferredValue,
} from 'react';
import { Header } from './components/Header';
import { MissionPanel } from './components/MissionPanel';
import { MapPlanner } from './components/MapPlanner';
import { WaypointTableModal } from './components/WaypointTableModal';
import { WpmlPreviewModal } from './components/WpmlPreviewModal';
import { ExportModal } from './components/ExportModal';
import { MissionParameters, MissionData, Waypoint } from './types/mission';
import { DEFAULT_DRONE_PROFILE } from './utils/droneProfiles';
import { DEMO_AREAS, DemoArea } from './utils/demoAreas';
import {
  generateLawnmowerMission,
  sanitizeMissionParameters,
  sanitizePolygon,
  sanitizeTextInput,
  clampNumber,
} from './utils/gridGenerator';
import { calculateOptimalFlightAngle } from './utils/geoMath';
import {
  createDjiKmzBlob,
  triggerFileDownload,
  generateStandardKml,
  generateGeoJson,
  generateCsvWaypoints,
  generateMissionPlanJson,
  parseMissionPlanJson,
  parseDjiKmzFile,
} from './utils/wpmlGenerator';

const STORAGE_KEY = 'DJI_WPML_PLANNER_STATE_V4';

const DEFAULT_PARAMETERS: MissionParameters = {
  altitude: 75,
  speed: 7,
  frontOverlap: 75,
  sideOverlap: 65,
  gimbalPitch: -90,
  flightAngle: 82,
  margin: 0,
  droneProfileId: DEFAULT_DRONE_PROFILE.id,
  finishAction: 'goHome',
  turnMode: 'toPointAndStopWithDiscontinuityCurvature',
  heightMode: 'relativeToStartPoint',
  takeOffSecurityHeight: 30,
  rthAltitude: 60,
  batteryFlightTimeMin: DEFAULT_DRONE_PROFILE.recommendedSafeBatteryMin || 30,
  missionPattern: 'single-grid',
  doubleGridPitch: -65,
  orbitRadiusBufferM: 0,
  orbitWaypointsCount: 16,
  comboInnerPitch: -75,
  comboOuterPitch: -45,
  comboOuterRadiusFactor: 1.15,
  waypointDensity: 'all-trigger-points',
  waypointAction: 'takePhoto',
  reverseFlightPath: false,
  straightenLegs: true,
  terrainFollowEnabled: false,
  terrainSlopeDeg: 0,
  terrainSlopeDirectionDeg: 0,
};

function loadPersistedState(): {
  parameters: MissionParameters;
  aoiPolygon: [number, number][];
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        parameters: DEFAULT_PARAMETERS,
        aoiPolygon: DEMO_AREAS[0].polygon,
      };
    }
    const parsed = JSON.parse(raw);
    const validPolygon = sanitizePolygon(parsed?.aoiPolygon);
    const validParams = sanitizeMissionParameters(
      parsed?.parameters || {},
      DEFAULT_PARAMETERS
    );
    return {
      parameters: validParams,
      aoiPolygon: validPolygon.length >= 3 ? validPolygon : DEMO_AREAS[0].polygon,
    };
  } catch (err) {
    console.warn('Could not read persisted mission state from localStorage:', err);
    return {
      parameters: DEFAULT_PARAMETERS,
      aoiPolygon: DEMO_AREAS[0].polygon,
    };
  }
}

export default function App() {
  const initialState = useMemo(() => loadPersistedState(), []);

  // Mission parameters state
  const [parameters, setParameters] = useState<MissionParameters>(initialState.parameters);

  // AOI polygon state
  const [aoiPolygon, setAoiPolygon] = useState<[number, number][]>(initialState.aoiPolygon);

  // Custom imported waypoints state (when importing .KMZ or WaypointMap JSON)
  const [customWaypoints, setCustomWaypoints] = useState<Waypoint[] | undefined>(undefined);

  // Real DEM Elevations cache (keyed by "lat.toFixed(5),lng.toFixed(5)")
  const [terrainElevationsMap, setTerrainElevationsMap] = useState<Record<string, number> | undefined>(
    undefined
  );
  const [isLoadingDem, setIsLoadingDem] = useState(false);

  // Map layer state
  const [activeMapLayer, setActiveMapLayer] = useState<string>('esri-sat');

  // Modals state
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [isXmlModalOpen, setIsXmlModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Flight simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationWaypointIndex, setSimulationWaypointIndex] = useState(0);

  // Selected waypoint for footprint inspection
  const [, setSelectedWaypoint] = useState<Waypoint | null>(null);

  // GPS Locate Trigger Counter to command MapPlanner to center on user & clean canvas
  const [gpsLocateTrigger, setGpsLocateTrigger] = useState(0);

  // Persist mission state to localStorage with try/catch safety
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        parameters,
        aoiPolygon,
        savedAt: Date.now(),
      });
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      console.warn('Failed to persist state in localStorage:', err);
    }
  }, [parameters, aoiPolygon]);

  // Deferred parameters & polygon for heavy map grid recalculation to keep UI sliders at 60 FPS
  const deferredParameters = useDeferredValue(parameters);
  const deferredPolygon = useDeferredValue(aoiPolygon);

  // Computed Mission Data
  const mission: MissionData = useMemo(() => {
    return generateLawnmowerMission(
      deferredPolygon,
      deferredParameters,
      customWaypoints,
      terrainElevationsMap
    );
  }, [deferredPolygon, deferredParameters, customWaypoints, terrainElevationsMap]);

  const hasPolygon = aoiPolygon.length >= 3;

  // Handle parameter update with strict sanitization
  const handleParametersChange = useCallback((newParams: Partial<MissionParameters>) => {
    // If user switches to a parametric pattern, release customWaypoints lock
    if (
      newParams.missionPattern &&
      newParams.missionPattern !== 'imported-custom'
    ) {
      setCustomWaypoints(undefined);
    }
    setParameters((prev) => sanitizeMissionParameters(newParams, prev));
  }, []);

  // Handle Polygon Update from Map Drawing or Vertex Drag
  const handlePolygonChange = useCallback((newPolygon: [number, number][]) => {
    const cleanPoly = sanitizePolygon(newPolygon);
    setAoiPolygon(cleanPoly);
    setCustomWaypoints(undefined);
    if (cleanPoly.length >= 3) {
      const optAngle = calculateOptimalFlightAngle(cleanPoly);
      setParameters((prev) =>
        sanitizeMissionParameters(
          {
            flightAngle: optAngle,
            missionPattern:
              prev.missionPattern === 'imported-custom' ? 'single-grid' : prev.missionPattern,
          },
          prev
        )
      );
    }
  }, []);

  // Handle Home Point update
  const handleHomePointChange = useCallback((homePt: [number, number]) => {
    setParameters((prev) => sanitizeMissionParameters({ homePoint: homePt }, prev));
  }, []);

  // Handle Select Demo Area
  const handleSelectDemoArea = useCallback((demo: DemoArea) => {
    setAoiPolygon(demo.polygon);
    setCustomWaypoints(undefined);
    setTerrainElevationsMap(undefined);
    setParameters((prev) =>
      sanitizeMissionParameters(
        {
          altitude: demo.recommendedAltitude,
          speed: demo.recommendedSpeed,
          flightAngle: demo.recommendedFlightAngle,
          missionPattern:
            prev.missionPattern === 'imported-custom' ? 'single-grid' : prev.missionPattern,
        },
        prev
      )
    );
    setIsSimulating(false);
    setSimulationWaypointIndex(0);
  }, []);

  // Reset to Default DJI Air 3S & Demo Area
  const handleResetDefaults = useCallback(() => {
    setParameters(DEFAULT_PARAMETERS);
    setAoiPolygon(DEMO_AREAS[0].polygon);
    setCustomWaypoints(undefined);
    setTerrainElevationsMap(undefined);
    setIsSimulating(false);
    setSimulationWaypointIndex(-2);
    setSelectedWaypoint(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Could not clear localStorage:', e);
    }
  }, []);

  // Optimize Flight Angle
  const handleOptimizeFlightAngle = useCallback(() => {
    if (aoiPolygon.length >= 3) {
      const optAngle = calculateOptimalFlightAngle(aoiPolygon);
      setParameters((prev) => sanitizeMissionParameters({ flightAngle: optAngle }, prev));
    }
  }, [aoiPolygon]);

  // Query Real DEM Elevations via Open-Elevation API (with safe fallback)
  const handleFetchDemElevations = useCallback(async () => {
    if (mission.waypoints.length === 0) return;
    setIsLoadingDem(true);
    try {
      const homePt = mission.homePoint || [mission.waypoints[0].lng, mission.waypoints[0].lat];
      // Sample up to 60 points (Home + waypoints) to stay well within API payload limits
      const locations: { latitude: number; longitude: number }[] = [
        { latitude: Number(homePt[1].toFixed(5)), longitude: Number(homePt[0].toFixed(5)) },
      ];
      mission.waypoints.slice(0, 80).forEach((wp) => {
        locations.push({
          latitude: Number(wp.lat.toFixed(5)),
          longitude: Number(wp.lng.toFixed(5)),
        });
      });

      const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          const map: Record<string, number> = {};
          data.results.forEach((item: { latitude: number; longitude: number; elevation: number }) => {
            const key = `${Number(item.latitude).toFixed(5)},${Number(item.longitude).toFixed(5)}`;
            map[key] = Number(item.elevation) || 0;
          });
          setTerrainElevationsMap(map);
          setParameters((prev) =>
            sanitizeMissionParameters({ terrainFollowEnabled: true }, prev)
          );
          return;
        }
      }
      // If external API is unreachable, enable simulated terrain slope automatically
      setParameters((prev) =>
        sanitizeMissionParameters(
          {
            terrainFollowEnabled: true,
            terrainSlopeDeg: prev.terrainSlopeDeg === 0 ? 6 : prev.terrainSlopeDeg,
          },
          prev
        )
      );
    } catch (err) {
      console.warn('Open-Elevation API fallback to slope model:', err);
      setParameters((prev) =>
        sanitizeMissionParameters(
          {
            terrainFollowEnabled: true,
            terrainSlopeDeg: prev.terrainSlopeDeg === 0 ? 6 : prev.terrainSlopeDeg,
          },
          prev
        )
      );
    } finally {
      setIsLoadingDem(false);
    }
  }, [mission.waypoints, mission.homePoint]);

  // Geolocation & Clean Canvas
  const handleLocateUser = useCallback(() => {
    setAoiPolygon([]);
    setCustomWaypoints(undefined);
    setIsSimulating(false);
    setSimulationWaypointIndex(0);
    setSelectedWaypoint(null);
    setGpsLocateTrigger((prev) => prev + 1);
  }, []);

  // Location Geocoder Search (with direct lat, lng parsing & XSS sanitization)
  const handleSearchLocation = useCallback(async (rawQuery: string) => {
    const query = sanitizeTextInput(rawQuery, 120);
    if (!query) return;

    // Check if user entered direct coordinates like "-34.985, -71.240"
    const coordMatch = query.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = clampNumber(parseFloat(coordMatch[1]), -85, 85, -34.985);
      const lon = clampNumber(parseFloat(coordMatch[2]), -180, 180, -71.2405);
      const delta = 0.0012;
      const box: [number, number][] = [
        [lon - delta, lat + delta],
        [lon + delta, lat + delta],
        [lon + delta, lat - delta],
        [lon - delta, lat - delta],
      ];
      setCustomWaypoints(undefined);
      setAoiPolygon(box);
      return;
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = clampNumber(parseFloat(data[0].lat), -85, 85, -34.985);
        const lon = clampNumber(parseFloat(data[0].lon), -180, 180, -71.2405);
        const delta = 0.0012;
        const box: [number, number][] = [
          [lon - delta, lat + delta],
          [lon + delta, lat + delta],
          [lon + delta, lat - delta],
          [lon - delta, lat - delta],
        ];
        setCustomWaypoints(undefined);
        setAoiPolygon(box);
      }
    } catch (e) {
      console.error('Search failed:', e);
    }
  }, []);

  // Flight Simulation loop
  useEffect(() => {
    if (!isSimulating || mission.waypoints.length === 0) return;

    const interval = setInterval(() => {
      setSimulationWaypointIndex((prev) => {
        if (prev >= mission.waypoints.length + 1) {
          setIsSimulating(false);
          return -2;
        }
        return prev + 1;
      });
    }, 450);

    return () => clearInterval(interval);
  }, [isSimulating, mission.waypoints.length]);

  const handleToggleSimulation = () => {
    if (mission.waypoints.length === 0) return;
    if (
      !isSimulating &&
      (simulationWaypointIndex >= mission.waypoints.length || simulationWaypointIndex < -2)
    ) {
      setSimulationWaypointIndex(-2);
    }
    setIsSimulating(!isSimulating);
  };

  const handleResetSimulation = () => {
    setIsSimulating(false);
    setSimulationWaypointIndex(-2);
  };

  // Direct KMZ Export
  const handleConfirmDownloadKmz = async () => {
    if (mission.waypoints.length === 0) return;
    setIsExporting(true);
    try {
      const blob = await createDjiKmzBlob(mission);
      const baseName = parameters.importedKmzMeta?.fileName
        ? parameters.importedKmzMeta.fileName.replace(/\.kmz$/i, '_REEMPLAZO')
        : `DJI_WPML_${parameters.missionPattern}_${parameters.droneProfileId}_${Date.now()}`;
      triggerFileDownload(blob, `${baseName}.kmz`);
    } catch (err) {
      console.error('Error generating KMZ:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export GIS & Mission JSON Formats
  const handleExportKml = () => {
    const kml = generateStandardKml(mission);
    const blob = new Blob([kml], {
      type: 'application/vnd.google-earth.kml+xml;charset=utf-8;',
    });
    triggerFileDownload(blob, `mission_google_earth_${Date.now()}.kml`);
  };

  const handleExportGeoJson = () => {
    const geojson = generateGeoJson(mission);
    const blob = new Blob([geojson], { type: 'application/json;charset=utf-8;' });
    triggerFileDownload(blob, `mission_trajectory_${Date.now()}.geojson`);
  };

  const handleExportCsv = () => {
    const csv = generateCsvWaypoints(mission);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerFileDownload(blob, `mission_waypoints_${Date.now()}.csv`);
  };

  const handleExportMissionJson = () => {
    const json = generateMissionPlanJson(mission);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    triggerFileDownload(blob, `dji_mission_plan_${Date.now()}.json`);
  };

  // Import Mission JSON or Legacy WaypointMap JSON
  const handleImportMissionJson = (jsonText: string) => {
    const parsed = parseMissionPlanJson(jsonText, parameters);
    if (parsed) {
      setParameters(parsed.parameters);
      if (parsed.aoiPolygon.length >= 3) {
        setAoiPolygon(parsed.aoiPolygon);
      }
      if (parsed.customWaypoints && parsed.customWaypoints.length > 0) {
        setCustomWaypoints(parsed.customWaypoints);
      } else {
        setCustomWaypoints(undefined);
      }
      setIsSimulating(false);
      setSimulationWaypointIndex(-2);
    }
  };

  // Import .KMZ file from DJI Fly / Pilot 2
  const handleImportKmzFile = async (file: File) => {
    const parsed = await parseDjiKmzFile(file, parameters);
    if (parsed) {
      setParameters(parsed.parameters);
      if (parsed.aoiPolygon.length >= 3) {
        setAoiPolygon(parsed.aoiPolygon);
      }
      setCustomWaypoints(parsed.waypoints);
      setIsSimulating(false);
      setSimulationWaypointIndex(-2);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans select-none">
      {/* Top Avionics Header */}
      <Header
        onSelectDemoArea={handleSelectDemoArea}
        onLocateUser={handleLocateUser}
        onSearchLocation={handleSearchLocation}
        onToggleXmlModal={() => setIsXmlModalOpen(true)}
        onToggleTableModal={() => setIsTableModalOpen(true)}
        isSimulating={isSimulating}
        onToggleSimulation={handleToggleSimulation}
        onResetSimulation={handleResetSimulation}
        activeMapLayer={activeMapLayer}
        onSelectMapLayer={setActiveMapLayer}
        hasPolygon={hasPolygon}
        waypointCount={mission.waypoints.length}
      />

      {/* Main Workspace (Split View: Parameter Sidebar + Leaflet GIS Map) */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Left Parameter & Telemetry Control Panel */}
        <MissionPanel
          parameters={parameters}
          metrics={mission.metrics}
          hasPolygon={hasPolygon}
          onParametersChange={handleParametersChange}
          onOptimizeFlightAngle={handleOptimizeFlightAngle}
          onExportKmz={() => setIsExportModalOpen(true)}
          onExportKml={handleExportKml}
          onExportGeoJson={handleExportGeoJson}
          onExportCsv={handleExportCsv}
          onExportMissionJson={handleExportMissionJson}
          onImportMissionJson={handleImportMissionJson}
          onImportKmzFile={handleImportKmzFile}
          onFetchDemElevations={handleFetchDemElevations}
          isLoadingDem={isLoadingDem}
          onResetDefaults={handleResetDefaults}
          isExporting={isExporting}
        />

        {/* Center/Right Leaflet GIS Map Canvas */}
        <MapPlanner
          mission={mission}
          onPolygonChange={handlePolygonChange}
          onHomePointChange={handleHomePointChange}
          activeMapLayer={activeMapLayer}
          isSimulating={isSimulating}
          simulationWaypointIndex={simulationWaypointIndex}
          gpsLocateTrigger={gpsLocateTrigger}
          onSelectWaypoint={setSelectedWaypoint}
          onToggleSimulation={handleToggleSimulation}
          onResetSimulation={handleResetSimulation}
        />
      </main>

      {/* Waypoint Table Inspection Modal */}
      <WaypointTableModal
        mission={mission}
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
      />

      {/* WPML XML Code Inspector Modal */}
      <WpmlPreviewModal
        mission={mission}
        isOpen={isXmlModalOpen}
        onClose={() => setIsXmlModalOpen(false)}
      />

      {/* DJI KMZ Export Confirmation & Pre-Flight Checklist Modal */}
      <ExportModal
        mission={mission}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirmDownload={handleConfirmDownloadKmz}
        onApplyPatch={handleParametersChange}
      />
    </div>
  );
}
