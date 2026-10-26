import {
  DroneCameraProfile,
  MissionParameters,
  PhotogrammetryMetrics,
  Waypoint,
  FlightTransect,
  MissionData,
  SafetyWarning,
  WaypointPhase,
  MissionPattern,
  WaypointDensityMode,
  WaypointActionMode,
} from '../types/mission';
import { DRONE_PROFILES, DEFAULT_DRONE_PROFILE } from './droneProfiles';
import {
  calculatePolygonArea,
  getPolygonCentroid,
  toLocalMeters,
  fromLocalMeters,
  haversineDistance,
  calculateBearing,
  intersectSegmentWithHorizontalLine,
} from './geoMath';

/**
 * Safely clamps a numeric value within [min, max], returning fallback if NaN or infinite
 */
export function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

/**
 * Sanitizes text input to prevent XSS injection in search bars, filenames, or XML fields
 */
export function sanitizeTextInput(raw: string, maxLength = 120): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[<>"'`\\;]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, maxLength);
}

/**
 * Strictly validates and clamps all MissionParameters to physical operational limits
 */
export function sanitizeMissionParameters(
  partial: Partial<MissionParameters>,
  base: MissionParameters
): MissionParameters {
  const merged = { ...base, ...partial };
  const drone =
    DRONE_PROFILES.find((d) => d.id === merged.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const maxDroneSpeed = clampNumber(drone.maxSpeedMs, 1, 15, 15);

  const altitude = clampNumber(merged.altitude, 15, 500, 75);
  const speed = Math.round(clampNumber(merged.speed, 1, maxDroneSpeed, 7) * 10) / 10;
  const frontOverlap = Math.round(clampNumber(merged.frontOverlap, 10, 95, 75));
  const sideOverlap = Math.round(clampNumber(merged.sideOverlap, 10, 95, 65));
  const gimbalPitch = Math.round(clampNumber(merged.gimbalPitch, -90, 0, -90));
  const flightAngle = ((Math.round(clampNumber(merged.flightAngle, 0, 360, 82)) % 360) + 360) % 360;
  const margin = Math.round(clampNumber(merged.margin, 0, 100, 0));
  const takeOffSecurityHeight = Math.round(clampNumber(merged.takeOffSecurityHeight, 5, 200, 30));
  const rthAltitude = Math.round(clampNumber(merged.rthAltitude, 15, 500, 60));
  const batteryFlightTimeMin = Math.round(
    clampNumber(merged.batteryFlightTimeMin, 5, 50, drone.recommendedSafeBatteryMin || 30)
  );

  const validFinishActions = ['goHome', 'autoLand', 'gotoFirstWaypoint', 'noAction'] as const;
  const finishAction = validFinishActions.includes(merged.finishAction as any)
    ? merged.finishAction
    : 'goHome';

  const validTurnModes = [
    'toPointAndStopWithHeading',
    'coordinateTurn',
    'toPointAndStopWithDiscontinuityCurvature',
  ] as const;
  let turnMode = validTurnModes.includes(merged.turnMode as any)
    ? merged.turnMode
    : 'toPointAndStopWithHeading';

  const validHeightModes = ['WGS84', 'relativeToStartPoint', 'realTimeFollowSurface'] as const;
  const heightMode = validHeightModes.includes(merged.heightMode as any)
    ? merged.heightMode
    : 'relativeToStartPoint';

  const validPatterns: MissionPattern[] = [
    'single-grid',
    'double-grid',
    'orbit-poi',
    'combo-3dgs-pro',
    'imported-custom',
  ];
  const missionPattern: MissionPattern = validPatterns.includes(merged.missionPattern as any)
    ? merged.missionPattern
    : 'single-grid';

  const validDensities: WaypointDensityMode[] = ['all-photo-points', 'endpoints-only'];
  const waypointDensity: WaypointDensityMode = validDensities.includes(merged.waypointDensity as any)
    ? merged.waypointDensity
    : 'all-photo-points';

  const validActions: WaypointActionMode[] = ['takePhoto', 'recordVideo', 'none'];
  const waypointAction: WaypointActionMode = validActions.includes(merged.waypointAction as any)
    ? merged.waypointAction
    : 'takePhoto';

  const reverseFlightPath = Boolean(merged.reverseFlightPath);
  const straightenPaths =
    merged.straightenPaths !== undefined ? Boolean(merged.straightenPaths) : true;

  // If user toggled straightenPaths explicitly, sync turnMode
  if (partial.straightenPaths !== undefined && partial.turnMode === undefined) {
    turnMode = partial.straightenPaths
      ? 'toPointAndStopWithDiscontinuityCurvature'
      : 'coordinateTurn';
  }

  const orbitPointsCount = Math.round(clampNumber(merged.orbitPointsCount, 8, 48, 16));
  const terrainFollowEnabled = Boolean(merged.terrainFollowEnabled);
  const terrainSlopeDeg = Math.round(clampNumber(merged.terrainSlopeDeg, -25, 25, 0) * 10) / 10;
  const terrainSlopeDirectionDeg =
    ((Math.round(clampNumber(merged.terrainSlopeDirectionDeg, 0, 360, 0)) % 360) + 360) % 360;

  let customSensor = merged.customSensor;
  if (customSensor) {
    customSensor = {
      sensorWidthMm: clampNumber(customSensor.sensorWidthMm, 1, 100, 13.2),
      sensorHeightMm: clampNumber(customSensor.sensorHeightMm, 1, 100, 8.8),
      focalLengthMm: clampNumber(customSensor.focalLengthMm, 1, 200, 8.58),
      imageWidthPx: Math.round(clampNumber(customSensor.imageWidthPx, 100, 20000, 4096)),
      imageHeightPx: Math.round(clampNumber(customSensor.imageHeightPx, 100, 20000, 3072)),
    };
  }

  let homePoint = merged.homePoint;
  if (
    Array.isArray(homePoint) &&
    homePoint.length === 2 &&
    Number.isFinite(homePoint[0]) &&
    Number.isFinite(homePoint[1]) &&
    Math.abs(homePoint[1]) <= 90 &&
    Math.abs(homePoint[0]) <= 180
  ) {
    homePoint = [homePoint[0], homePoint[1]];
  } else {
    homePoint = undefined;
  }

  return {
    altitude,
    speed,
    frontOverlap,
    sideOverlap,
    gimbalPitch,
    flightAngle,
    margin,
    droneProfileId: drone.id,
    customSensor,
    finishAction,
    turnMode,
    heightMode,
    takeOffSecurityHeight,
    rthAltitude,
    batteryFlightTimeMin,
    homePoint,
    missionPattern,
    waypointDensity,
    waypointAction,
    reverseFlightPath,
    straightenPaths,
    orbitPointsCount,
    terrainFollowEnabled,
    terrainSlopeDeg,
    terrainSlopeDirectionDeg,
  };
}

/**
 * Validates and cleans a polygon coordinate array
 */
export function sanitizePolygon(rawPolygon: unknown): [number, number][] {
  if (!Array.isArray(rawPolygon)) return [];
  const valid: [number, number][] = [];
  for (const pt of rawPolygon) {
    if (
      Array.isArray(pt) &&
      pt.length >= 2 &&
      Number.isFinite(Number(pt[0])) &&
      Number.isFinite(Number(pt[1]))
    ) {
      const lng = clampNumber(pt[0], -180, 180, 0);
      const lat = clampNumber(pt[1], -90, 90, 0);
      valid.push([lng, lat]);
    }
  }
  return valid;
}

export function calculatePhotogrammetryMetrics(
  polygon: [number, number][],
  params: MissionParameters,
  drone: DroneCameraProfile
): {
  metrics: PhotogrammetryMetrics;
  sensor: {
    sensorWidthMm: number;
    sensorHeightMm: number;
    focalLengthMm: number;
    imageWidthPx: number;
    imageHeightPx: number;
  };
} {
  const rawSensor =
    params.droneProfileId === 'custom' && params.customSensor
      ? params.customSensor
      : {
          sensorWidthMm: drone.sensorWidthMm,
          sensorHeightMm: drone.sensorHeightMm,
          focalLengthMm: drone.focalLengthMm,
          imageWidthPx: drone.imageWidthPx,
          imageHeightPx: drone.imageHeightPx,
        };

  const sensor = {
    sensorWidthMm: Math.max(1, rawSensor.sensorWidthMm || 13.2),
    sensorHeightMm: Math.max(1, rawSensor.sensorHeightMm || 8.8),
    focalLengthMm: Math.max(1, rawSensor.focalLengthMm || 8.58),
    imageWidthPx: Math.max(100, rawSensor.imageWidthPx || 4096),
    imageHeightPx: Math.max(100, rawSensor.imageHeightPx || 3072),
  };

  const altitude = clampNumber(params.altitude, 15, 500, 75);
  const safeSpeed = clampNumber(params.speed, 1, 15, 7);
  const absPitchDeg = clampNumber(Math.abs(params.gimbalPitch), 0, 90, 90);
  const pitchRad = (Math.max(10, absPitchDeg) * Math.PI) / 180;
  const sinPitch = Math.max(0.1736, Math.sin(pitchRad));

  // 1. Exact Photogrammetric GSD Formula:
  // GSD (cm/px) = (H * SensorWidth) / (FocalLength * ImageWidth) * 100
  const gsdWidthCmPx =
    (altitude * sensor.sensorWidthMm * 100) / (sensor.focalLengthMm * sensor.imageWidthPx);
  const gsdHeightCmPx =
    (altitude * sensor.sensorHeightMm * 100) / (sensor.focalLengthMm * sensor.imageHeightPx);
  const gsdCmPx = Math.round(((gsdWidthCmPx + gsdHeightCmPx) / 2) * 100) / 100;
  const effectiveGsdCmPx = Math.round((gsdCmPx / sinPitch) * 100) / 100;

  // 2. Ground Footprint calculations
  const groundFootprintWidthM = (altitude * sensor.sensorWidthMm) / sensor.focalLengthMm;
  const rawGroundHeightM = (altitude * sensor.sensorHeightMm) / sensor.focalLengthMm;
  const groundFootprintHeightM = rawGroundHeightM / sinPitch;

  // 3. Oblique Look-Ahead Optical Center Offset: d = H * tan(90° - |Pitch|)
  const obliqueAngleFromNadirDeg = Math.min(80, Math.max(0, 90 - absPitchDeg));
  const lookAheadOffsetM =
    obliqueAngleFromNadirDeg <= 0.1
      ? 0
      : Math.round(altitude * Math.tan((obliqueAngleFromNadirDeg * Math.PI) / 180) * 10) / 10;

  // 4. Line & Trigger Spacing (clamped to 10% - 95% overlap)
  const sideOverlapRatio = clampNumber(params.sideOverlap, 10, 95, 65) / 100;
  const frontOverlapRatio = clampNumber(params.frontOverlap, 10, 95, 75) / 100;

  const lineSpacingM = Math.max(1.5, groundFootprintWidthM * (1 - sideOverlapRatio));
  const photoSpacingM = Math.max(1.5, groundFootprintHeightM * (1 - frontOverlapRatio));

  // 5. Electronic Rolling Shutter Physics, Trigger Interval & Motion Blur
  const isHighResMode = Boolean(drone.isHighResBufferMode || sensor.imageWidthPx >= 7500);
  const minSafeIntervalSec = drone.minPhotoIntervalSec || (isHighResMode ? 3.2 : 2.0);
  const photoIntervalSec = Math.round((photoSpacingM / safeSpeed) * 100) / 100;

  const shutterFactor = drone.shutterType === 'electronic' ? 1.35 : 1.0;
  const exposureTimeSec = 0.00125; // 1/800s reference photogrammetry shutter speed
  const estimatedMotionBlurMm =
    Math.round(safeSpeed * 1000 * exposureTimeSec * shutterFactor * 10) / 10;
  const gsdMmPx = Math.max(0.1, gsdCmPx * 10);
  const estimatedMotionBlurPx = Math.round((estimatedMotionBlurMm / gsdMmPx) * 100) / 100;

  const maxSpeedForInterval = photoSpacingM / minSafeIntervalSec;
  const maxSpeedForBlur = (0.75 * gsdMmPx) / (1000 * exposureTimeSec * shutterFactor);
  const rawRecSpeed = Math.min(drone.maxSpeedMs, maxSpeedForInterval, maxSpeedForBlur);
  const recommendedMaxSpeedMs = Math.max(1, Math.min(15, Math.floor(rawRecSpeed * 2) / 2));

  // 6. Pre-Flight Operational Safety Warnings
  const safetyWarnings: SafetyWarning[] = [];

  if (params.waypointAction !== 'recordVideo') {
    if (isHighResMode && photoIntervalSec < 3.0) {
      safetyWarnings.push({
        id: 'interval-50mp-critical',
        severity: 'critical',
        title: `Saturación de Buffer SD en 50MP/48MP (${photoIntervalSec}s < 3.0s)`,
        message: `A ${safeSpeed} m/s el disparo ocurre cada ${photoIntervalSec}s. El sensor de alta resolución requiere ≥ 3.0s–3.5s para vaciar el buffer RAW/JPEG en DJI Fly sin omitir fotos.`,
        fixActionLabel: `Ajustar velocidad a ${recommendedMaxSpeedMs} m/s`,
        suggestedPatch: { speed: recommendedMaxSpeedMs },
      });
    } else if (isHighResMode && photoIntervalSec < 3.5) {
      safetyWarnings.push({
        id: 'interval-50mp-warning',
        severity: 'warning',
        title: `Intervalo Ajustado para 50MP/48MP (${photoIntervalSec}s)`,
        message: `Intervalo entre 3.0s y 3.5s en modo de alta resolución. Usa tarjeta MicroSD U3/V30 o reduce la velocidad a ${recommendedMaxSpeedMs} m/s (o cambia al perfil 12MP Binning).`,
        fixActionLabel: `Usar ${recommendedMaxSpeedMs} m/s`,
        suggestedPatch: { speed: recommendedMaxSpeedMs },
      });
    } else if (!isHighResMode && photoIntervalSec < 2.0) {
      safetyWarnings.push({
        id: 'interval-12mp-critical',
        severity: 'critical',
        title: `Intervalo de Disparo Crítico (${photoIntervalSec}s < 2.0s)`,
        message: `El intervalo requerido (${photoIntervalSec}s) es menor al mínimo seguro de 2.0s en DJI Fly / WPML. Se omitirán capturas durante la pasada.`,
        fixActionLabel: `Reducir velocidad a ${recommendedMaxSpeedMs} m/s`,
        suggestedPatch: { speed: recommendedMaxSpeedMs },
      });
    }
  }

  const takeOffHeight = params.takeOffSecurityHeight || 20;
  if (takeOffHeight < 25) {
    safetyWarnings.push({
      id: 'transit-altitude-low',
      severity: takeOffHeight < 15 ? 'critical' : 'warning',
      title: `Altitud de Tránsito Inicial Baja (${takeOffHeight}m < 25m)`,
      message: `El ascenso inicial antes de ir al Waypoint #0 (${takeOffHeight}m) es riesgoso frente a árboles, postes o estructuras en terreno.`,
      fixActionLabel: 'Subir tránsito inicial a 30m',
      suggestedPatch: { takeOffSecurityHeight: 30 },
    });
  }

  if (drone.shutterType === 'electronic' && estimatedMotionBlurPx > 0.85) {
    safetyWarnings.push({
      id: 'rolling-shutter-blur',
      severity: estimatedMotionBlurPx > 1.3 ? 'critical' : 'warning',
      title: `Rolling Shutter / Motion Blur Elevado (${estimatedMotionBlurPx} px)`,
      message: `Obturador electrónico a ${safeSpeed} m/s con GSD ${gsdCmPx} cm/px genera ${estimatedMotionBlurMm} mm (${estimatedMotionBlurPx} px) de arrastre óptico. Puede degradar el alineamiento SFM/3DGS.`,
      fixActionLabel: `Limitar a ${recommendedMaxSpeedMs} m/s`,
      suggestedPatch: { speed: recommendedMaxSpeedMs },
    });
  }

  const areaSqM = calculatePolygonArea(polygon);
  const areaHa = Math.round((areaSqM / 10000) * 100) / 100;

  return {
    metrics: {
      gsdCmPx,
      effectiveGsdCmPx,
      groundFootprintWidthM: Math.round(groundFootprintWidthM * 10) / 10,
      groundFootprintHeightM: Math.round(groundFootprintHeightM * 10) / 10,
      lookAheadOffsetM,
      lineSpacingM: Math.round(lineSpacingM * 10) / 10,
      photoSpacingM: Math.round(photoSpacingM * 10) / 10,
      photoIntervalSec,
      minSafeIntervalSec,
      estimatedMotionBlurPx,
      estimatedMotionBlurMm,
      recommendedMaxSpeedMs,
      areaHa,
      areaSqM: Math.round(areaSqM),
      totalDistanceM: 0,
      estimatedFlightTimeSec: 0,
      photoCount: 0,
      waypointCount: 0,
      transectCount: 0,
      batteryCount: 1,
      batterySwaps: [],
      batterySwapPoints: [],
      transitDistanceM: 0,
      totalMissionTimeSec: 0,
      safetyWarnings,
    },
    sensor,
  };
}

interface RawGeneratedPoint {
  lng: number;
  lat: number;
  altitude: number;
  speed: number;
  gimbalPitch: number;
  heading?: number; // If defined (e.g. Orbit POI), overrides segment bearing
  isPhoto: boolean;
  transectIdx: number;
  phase: WaypointPhase;
  phaseLabel: string;
  estimatedPhotosInSegment?: number; // Used when endpoints-only density is active
}

/**
 * Generates Lawnmower linear passes for a given angle and gimbalPitch
 */
function buildLinearGridPoints(
  polygon: [number, number][],
  centroid: [number, number],
  angleDeg: number,
  gimbalPitch: number,
  altitude: number,
  speed: number,
  margin: number,
  lineSpacingM: number,
  photoSpacingM: number,
  density: WaypointDensityMode,
  phase: WaypointPhase,
  phaseLabel: string,
  transectOffset: number
): { points: RawGeneratedPoint[]; nextTransectOffset: number; totalEstimatedPhotos: number } {
  const flightAngleRad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(-flightAngleRad);
  const sinA = Math.sin(-flightAngleRad);
  const cosInv = Math.cos(flightAngleRad);
  const sinInv = Math.sin(flightAngleRad);

  const localPolygon: [number, number][] = polygon.map((pt) => {
    const [e, n] = toLocalMeters(pt, centroid);
    return [e * cosA - n * sinA, e * sinA + n * cosA];
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const [x, y] of localPolygon) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  minX -= margin;
  maxX += margin;
  minY -= margin;
  maxY += margin;

  const dy = Math.max(1.5, lineSpacingM);
  const dxPhoto = Math.max(1.5, photoSpacingM);
  const heightSpan = Math.max(0, maxY - minY);
  const lineCount = Math.min(200, Math.max(1, Math.ceil(heightSpan / dy)));
  const actualSpacing = heightSpan / Math.max(1, lineCount);
  const startY = minY + actualSpacing / 2;

  const points: RawGeneratedPoint[] = [];
  let isReversed = false;
  let tIdx = transectOffset;
  let totalEstimatedPhotos = 0;

  for (let i = 0; i < lineCount; i++) {
    const currentY = startY + i * actualSpacing;
    if (currentY > maxY + 1) break;

    const intersections: number[] = [];
    for (let j = 0; j < localPolygon.length; j++) {
      const p1 = localPolygon[j];
      const p2 = localPolygon[(j + 1) % localPolygon.length];
      const xIntersect = intersectSegmentWithHorizontalLine(p1, p2, currentY);
      if (xIntersect !== null) {
        intersections.push(xIntersect);
      }
    }

    intersections.sort((a, b) => a - b);

    for (let k = 0; k < intersections.length - 1; k += 2) {
      let segStartX = intersections[k] - margin;
      let segEndX = intersections[k + 1] + margin;
      const segLength = segEndX - segStartX;
      if (segLength <= 1) continue;

      const numPhotosInSeg = Math.min(200, Math.max(2, Math.ceil(segLength / dxPhoto) + 1));
      totalEstimatedPhotos += numPhotosInSeg;

      const linePoints: RawGeneratedPoint[] = [];

      if (density === 'endpoints-only') {
        // Generate only 2 waypoints per pass (Start and End of street)
        const xCoords = [segStartX, segEndX];
        for (let s = 0; s < xCoords.length; s++) {
          const px = xCoords[s];
          const origEast = px * cosInv - currentY * sinInv;
          const origNorth = px * sinInv + currentY * cosInv;
          const [lng, lat] = fromLocalMeters([origEast, origNorth], centroid);
          linePoints.push({
            lng,
            lat,
            altitude,
            speed,
            gimbalPitch,
            isPhoto: true,
            transectIdx: tIdx,
            phase,
            phaseLabel,
            estimatedPhotosInSegment: s === 0 ? numPhotosInSeg : 0,
          });
        }
      } else {
        // Generate every photo point along the pass
        const actualDx = segLength / Math.max(1, numPhotosInSeg - 1);
        for (let s = 0; s < numPhotosInSeg; s++) {
          const px = segStartX + s * actualDx;
          const origEast = px * cosInv - currentY * sinInv;
          const origNorth = px * sinInv + currentY * cosInv;
          const [lng, lat] = fromLocalMeters([origEast, origNorth], centroid);
          linePoints.push({
            lng,
            lat,
            altitude,
            speed,
            gimbalPitch,
            isPhoto: true,
            transectIdx: tIdx,
            phase,
            phaseLabel,
            estimatedPhotosInSegment: 1,
          });
        }
      }

      if (isReversed) {
        linePoints.reverse();
      }

      points.push(...linePoints);
      isReversed = !isReversed;
      tIdx++;
    }
  }

  return { points, nextTransectOffset: tIdx, totalEstimatedPhotos };
}

/**
 * Generates an elliptical/circular orbit around the AOI centroid with heading pointing to the POI centroid
 */
function buildOrbitPoiPoints(
  polygon: [number, number][],
  centroid: [number, number],
  radiusMultiplier: number,
  gimbalPitch: number,
  altitude: number,
  speed: number,
  margin: number,
  numOrbitPoints: number,
  phase: WaypointPhase,
  phaseLabel: string,
  transectIdx: number
): RawGeneratedPoint[] {
  // Determine semi-axes in local meters from polygon bounding box
  let maxAbsEast = 30;
  let maxAbsNorth = 30;
  for (const pt of polygon) {
    const [e, n] = toLocalMeters(pt, centroid);
    if (Math.abs(e) > maxAbsEast) maxAbsEast = Math.abs(e);
    if (Math.abs(n) > maxAbsNorth) maxAbsNorth = Math.abs(n);
  }

  const rx = (maxAbsEast + margin) * radiusMultiplier;
  const ry = (maxAbsNorth + margin) * radiusMultiplier;
  const count = Math.max(8, Math.min(48, numOrbitPoints));
  const orbitPoints: RawGeneratedPoint[] = [];

  for (let i = 0; i < count; i++) {
    const theta = (i / count) * 2 * Math.PI;
    const east = rx * Math.cos(theta);
    const north = ry * Math.sin(theta);
    const [lng, lat] = fromLocalMeters([east, north], centroid);
    // Calculate exact yaw pointing inward toward the polygon centroid (POI)
    const headingToCenter = calculateBearing([lng, lat], centroid);

    orbitPoints.push({
      lng,
      lat,
      altitude,
      speed,
      gimbalPitch,
      heading: headingToCenter,
      isPhoto: true,
      transectIdx,
      phase,
      phaseLabel,
      estimatedPhotosInSegment: 1,
    });
  }

  return orbitPoints;
}

/**
 * Generates multi-phase or single-phase mission trajectory across polygon AOI
 * Also supports custom imported waypoints and DEM / slope terrain elevation offsets
 */
export function generateLawnmowerMission(
  polygon: [number, number][],
  rawParams: MissionParameters,
  customImportedWaypoints?: Waypoint[] | null,
  demElevationMap?: Record<string, number>
): MissionData {
  const params = sanitizeMissionParameters(rawParams, rawParams);
  const drone =
    DRONE_PROFILES.find((p) => p.id === params.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const { metrics } = calculatePhotogrammetryMetrics(polygon, params, drone);

  if (
    polygon.length < 3 &&
    (!customImportedWaypoints || customImportedWaypoints.length === 0)
  ) {
    return {
      aoiPolygon: polygon,
      parameters: params,
      metrics,
      waypoints: [],
      transects: [],
    };
  }

  const centroid =
    polygon.length >= 3
      ? getPolygonCentroid(polygon)
      : customImportedWaypoints && customImportedWaypoints.length > 0
      ? [customImportedWaypoints[0].lng, customImportedWaypoints[0].lat]
      : [0, 0];

  let rawPoints: RawGeneratedPoint[] = [];

  if (
    params.missionPattern === 'imported-custom' &&
    customImportedWaypoints &&
    customImportedWaypoints.length > 0
  ) {
    rawPoints = customImportedWaypoints.map((wp, idx) => ({
      lng: wp.lng,
      lat: wp.lat,
      altitude: wp.baseAltitude ?? wp.altitude,
      speed: wp.speed || params.speed,
      gimbalPitch: wp.gimbalPitch ?? params.gimbalPitch,
      heading: wp.heading,
      isPhoto: wp.isPhotoPoint,
      transectIdx: Math.floor(idx / 8),
      phase: wp.phase || 'imported',
      phaseLabel: wp.phaseLabel || 'Misión Importada (KMZ / JSON)',
      estimatedPhotosInSegment: wp.isPhotoPoint ? 1 : 0,
    }));
  } else if (params.missionPattern === 'orbit-poi') {
    // Mode 3: Circular / Elliptical Orbit around POI centroid
    rawPoints = buildOrbitPoiPoints(
      polygon,
      centroid,
      1.0,
      params.gimbalPitch === -90 ? -60 : params.gimbalPitch,
      params.altitude,
      params.speed,
      params.margin,
      params.orbitPointsCount || 16,
      'orbit-poi',
      `Órbita POI (${params.gimbalPitch === -90 ? -60 : params.gimbalPitch}° al Centro)`,
      0
    );
  } else if (params.missionPattern === 'double-grid') {
    // Mode 2: Double Crossed Grid (Primary + 90° Perpendicular)
    const obliquePitch = params.gimbalPitch === -90 ? -65 : params.gimbalPitch;
    const primary = buildLinearGridPoints(
      polygon,
      centroid,
      params.flightAngle,
      obliquePitch,
      params.altitude,
      params.speed,
      params.margin,
      metrics.lineSpacingM,
      metrics.photoSpacingM,
      params.waypointDensity,
      'grid-primary',
      `Grilla Primaria (${params.flightAngle}° · ${obliquePitch}°)`,
      0
    );
    const crossAngle = (params.flightAngle + 90) % 360;
    const secondary = buildLinearGridPoints(
      polygon,
      centroid,
      crossAngle,
      obliquePitch,
      params.altitude,
      params.speed,
      params.margin,
      metrics.lineSpacingM,
      metrics.photoSpacingM,
      params.waypointDensity,
      'grid-cross',
      `Grilla Cruzada (${crossAngle}° · ${obliquePitch}°)`,
      primary.nextTransectOffset
    );
    rawPoints = [...primary.points, ...secondary.points];
  } else if (params.missionPattern === 'combo-3dgs-pro') {
    // Mode 4: Combo 3DGS Pro (Phase 1: Inner Orbit -75° -> Phase 2: Nadir Grid -90° -> Phase 3: Outer Orbit +15% -45°)
    const phase1Orbit = buildOrbitPoiPoints(
      polygon,
      centroid,
      1.0,
      -75,
      params.altitude,
      params.speed,
      params.margin,
      params.orbitPointsCount || 16,
      'orbit-inner-75',
      'Fase 1: Órbita Interna (-75° al POI)',
      0
    );
    const phase2Grid = buildLinearGridPoints(
      polygon,
      centroid,
      params.flightAngle,
      -90,
      params.altitude,
      params.speed,
      params.margin,
      metrics.lineSpacingM,
      metrics.photoSpacingM,
      params.waypointDensity,
      'grid-nadir-90',
      'Fase 2: Grilla Central Nadir (-90°)',
      1
    );
    const phase3Orbit = buildOrbitPoiPoints(
      polygon,
      centroid,
      1.15,
      -45,
      params.altitude,
      params.speed,
      params.margin,
      params.orbitPointsCount || 16,
      'orbit-outer-45',
      'Fase 3: Órbita Externa +15% (-45° Fachadas)',
      phase2Grid.nextTransectOffset
    );
    rawPoints = [...phase1Orbit, ...phase2Grid.points, ...phase3Orbit];
  } else {
    // Mode 1: Classic Single Lawnmower Grid
    const primary = buildLinearGridPoints(
      polygon,
      centroid,
      params.flightAngle,
      params.gimbalPitch,
      params.altitude,
      params.speed,
      params.margin,
      metrics.lineSpacingM,
      metrics.photoSpacingM,
      params.waypointDensity,
      'grid-primary',
      `Grilla Simple (${params.gimbalPitch}°)`,
      0
    );
    rawPoints = primary.points;
  }

  // Fallback if no points generated
  if (rawPoints.length === 0 && polygon.length > 0) {
    rawPoints = polygon.map((pt, idx) => ({
      lng: pt[0],
      lat: pt[1],
      altitude: params.altitude,
      speed: params.speed,
      gimbalPitch: params.gimbalPitch,
      isPhoto: true,
      transectIdx: idx,
      phase: 'grid-primary',
      phaseLabel: 'Perímetro Base',
      estimatedPhotosInSegment: 1,
    }));
  }

  // Reverse Flight Path option (1-click route inversion)
  if (params.reverseFlightPath && rawPoints.length > 1) {
    rawPoints = [...rawPoints].reverse();
  }

  // Reference Takeoff / Home origin for Terrain Follow calculations
  const homeOrigin: [number, number] =
    params.homePoint ||
    (rawPoints.length > 0 ? [rawPoints[0].lng, rawPoints[0].lat] : centroid);
  const homeElevKey = `${homeOrigin[1].toFixed(4)},${homeOrigin[0].toFixed(4)}`;
  const baseHomeGroundElev = demElevationMap?.[homeElevKey] ?? 0;

  const slopeGradRad = ((params.terrainSlopeDirectionDeg || 0) * Math.PI) / 180;
  const slopeTan = Math.tan(((params.terrainSlopeDeg || 0) * Math.PI) / 180);

  const waypoints: Waypoint[] = [];
  let totalDistance = 0;
  let totalPhotos = 0;
  let minTerrainDeltaM = 0;
  let maxTerrainDeltaM = 0;

  for (let i = 0; i < rawPoints.length; i++) {
    const raw = rawPoints[i];
    const lng = raw.lng;
    const lat = raw.lat;

    // Heading: if raw.heading is explicitly set (e.g., Orbit POI or imported), preserve it;
    // otherwise point along the path to the next waypoint
    let heading = raw.heading;
    if (heading === undefined) {
      if (i < rawPoints.length - 1) {
        const nextRaw = rawPoints[i + 1];
        heading = calculateBearing([lng, lat], [nextRaw.lng, nextRaw.lat]);
      } else if (i > 0) {
        heading = waypoints[i - 1].heading;
      } else {
        heading = params.flightAngle;
      }
    }

    if (i > 0) {
      const prev = waypoints[i - 1];
      const dist = haversineDistance([prev.lng, prev.lat], [lng, lat]);
      totalDistance += dist;
    }

    // Terrain Follow / Elevation Offset Calculation
    let terrainDeltaM = 0;
    let groundElevationM: number | undefined = undefined;
    const wpElevKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;

    if (demElevationMap && demElevationMap[wpElevKey] !== undefined) {
      groundElevationM = demElevationMap[wpElevKey];
      terrainDeltaM = Math.round((groundElevationM - baseHomeGroundElev) * 10) / 10;
    } else if (params.terrainFollowEnabled && Math.abs(params.terrainSlopeDeg) > 0.1) {
      const [eastFromHome, northFromHome] = toLocalMeters([lng, lat], homeOrigin);
      const distAlongSlope =
        eastFromHome * Math.sin(slopeGradRad) + northFromHome * Math.cos(slopeGradRad);
      terrainDeltaM = Math.round(distAlongSlope * slopeTan * 10) / 10;
    }

    if (terrainDeltaM < minTerrainDeltaM) minTerrainDeltaM = terrainDeltaM;
    if (terrainDeltaM > maxTerrainDeltaM) maxTerrainDeltaM = terrainDeltaM;

    const effectiveAltitude = params.terrainFollowEnabled
      ? Math.round(clampNumber(raw.altitude + terrainDeltaM, 10, 500, raw.altitude) * 10) / 10
      : raw.altitude;

    // Action Mode mapping
    let actionType: 'takePhoto' | 'startRecord' | 'stopRecord' | 'none' = 'takePhoto';
    let isPhotoPoint = raw.isPhoto;

    if (params.waypointAction === 'recordVideo') {
      if (i === 0) {
        actionType = 'startRecord';
        isPhotoPoint = true;
      } else if (i === rawPoints.length - 1) {
        actionType = 'stopRecord';
        isPhotoPoint = true;
      } else {
        actionType = 'none';
        isPhotoPoint = false;
      }
    } else if (params.waypointAction === 'none') {
      actionType = 'none';
      isPhotoPoint = false;
    } else {
      actionType = raw.isPhoto ? 'takePhoto' : 'none';
      isPhotoPoint = raw.isPhoto;
    }

    if (params.waypointAction !== 'recordVideo') {
      totalPhotos += raw.estimatedPhotosInSegment ?? (raw.isPhoto ? 1 : 0);
    }

    const flightTimeSec = totalDistance / Math.max(1, params.speed);
    const turnBufferSec = (raw.transectIdx || 0) * 2.2;

    waypoints.push({
      id: i,
      lat: Math.round(lat * 1e7) / 1e7,
      lng: Math.round(lng * 1e7) / 1e7,
      altitude: effectiveAltitude,
      baseAltitude: raw.altitude,
      terrainDeltaM,
      groundElevationM,
      speed: raw.speed,
      gimbalPitch: raw.gimbalPitch,
      heading: Math.round(((heading % 360) + 360) % 360 * 10) / 10,
      isPhotoPoint,
      distanceFromStartM: Math.round(totalDistance * 10) / 10,
      estimatedTimeSec: Math.round(flightTimeSec + turnBufferSec),
      phase: raw.phase,
      phaseLabel: raw.phaseLabel,
      actionType,
    });
  }

  // Group into transects
  const transects: FlightTransect[] = [];
  const transectMap = new Map<number, { phase?: WaypointPhase; pts: Waypoint[] }>();
  rawPoints.forEach((raw, idx) => {
    const existing = transectMap.get(raw.transectIdx) || { phase: raw.phase, pts: [] };
    existing.pts.push(waypoints[idx]);
    transectMap.set(raw.transectIdx, existing);
  });

  transectMap.forEach((val, tIdx) => {
    transects.push({
      lineIndex: tIdx,
      phase: val.phase,
      points: val.pts,
    });
  });

  const gridFlightTimeSec = Math.round(
    totalDistance / Math.max(1, params.speed) + transects.length * 2.5
  );

  // If video mode is active, estimate equivalent 4K extracted frames (e.g., 1 frame every 2s)
  if (params.waypointAction === 'recordVideo') {
    totalPhotos = Math.max(2, Math.round(gridFlightTimeSec / 2));
  }

  // Calculate Battery Swaps & Breakpoints
  const safeBatterySec = Math.max(5, params.batteryFlightTimeMin || 30) * 60;
  const batterySwaps: Array<{
    batteryNumber: number;
    startWaypointId: number;
    endWaypointId: number;
    swapWaypoint?: Waypoint;
    flightDurationSec: number;
    photosInBattery: number;
    distanceM: number;
  }> = [];
  const batterySwapPoints: Waypoint[] = [];

  let currentBat = 1;
  let batStartTimeSec = 0;
  let batStartDistanceM = 0;
  let batStartWpId = 0;
  let batPhotos = 0;

  for (let idx = 0; idx < waypoints.length; idx++) {
    const wp = waypoints[idx];
    wp.batteryIndex = currentBat;
    if (wp.isPhotoPoint) batPhotos++;

    const batElapsed = wp.estimatedTimeSec - batStartTimeSec;
    const isLastWp = idx === waypoints.length - 1;

    if (batElapsed >= safeBatterySec && !isLastWp) {
      wp.isBatterySwapPoint = true;
      wp.batteryIndex = currentBat;
      batterySwapPoints.push(wp);

      batterySwaps.push({
        batteryNumber: currentBat,
        startWaypointId: batStartWpId,
        endWaypointId: wp.id,
        swapWaypoint: wp,
        flightDurationSec: Math.round(batElapsed),
        photosInBattery: batPhotos,
        distanceM: Math.round(wp.distanceFromStartM - batStartDistanceM),
      });

      currentBat++;
      batStartTimeSec = wp.estimatedTimeSec;
      batStartDistanceM = wp.distanceFromStartM;
      batStartWpId = wp.id + 1;
      batPhotos = 0;
    } else if (isLastWp) {
      batterySwaps.push({
        batteryNumber: currentBat,
        startWaypointId: batStartWpId,
        endWaypointId: wp.id,
        swapWaypoint: undefined,
        flightDurationSec: Math.round(wp.estimatedTimeSec - batStartTimeSec),
        photosInBattery: batPhotos,
        distanceM: Math.round(wp.distanceFromStartM - batStartDistanceM),
      });
    }
  }

  // Pilot Home Point & Transit calculations
  let transitDistanceM = 0;
  if (waypoints.length > 0) {
    const firstWp = waypoints[0];
    const lastWp = waypoints[waypoints.length - 1];
    const pilotHome = params.homePoint || [firstWp.lng, firstWp.lat];

    const distTakeoffToStart = haversineDistance(pilotHome, [firstWp.lng, firstWp.lat]);
    const distEndToRth = haversineDistance([lastWp.lng, lastWp.lat], pilotHome);
    let swapTransitM = 0;
    for (const swapWp of batterySwapPoints) {
      swapTransitM += haversineDistance([swapWp.lng, swapWp.lat], pilotHome) * 2;
    }
    transitDistanceM = Math.round(distTakeoffToStart + distEndToRth + swapTransitM);
  }

  const transitFlightTimeSec = Math.round(transitDistanceM / Math.max(1, params.speed));
  const totalMissionTimeSec = gridFlightTimeSec + transitFlightTimeSec;

  const finalMetrics: PhotogrammetryMetrics = {
    ...metrics,
    totalDistanceM: Math.round(totalDistance),
    estimatedFlightTimeSec: gridFlightTimeSec,
    photoCount: totalPhotos,
    waypointCount: waypoints.length,
    transectCount: transects.length,
    batteryCount: Math.max(1, batterySwaps.length),
    batterySwaps,
    batterySwapPoints,
    transitDistanceM,
    totalMissionTimeSec,
    minTerrainDeltaM,
    maxTerrainDeltaM,
  };

  return {
    aoiPolygon: polygon,
    parameters: params,
    metrics: finalMetrics,
    waypoints,
    transects,
  };
}

/**
 * Queries real ground elevation (MSL in meters) for a list of coordinates via Open-Elevation API
 * with automatic synthetic terrain fallback if offline or rate-limited.
 */
export async function fetchTerrainElevations(
  coords: [number, number][],
  slopeDeg = 6,
  slopeDirDeg = 45
): Promise<{ elevationMap: Record<string, number>; isLiveApi: boolean }> {
  const uniqueMap = new Map<string, [number, number]>();
  for (const [lng, lat] of coords) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, [lng, lat]);
    }
  }

  const uniqueEntries = Array.from(uniqueMap.entries()).slice(0, 120);
  const elevationMap: Record<string, number> = {};

  try {
    const locations = uniqueEntries.map(([, [lng, lat]]) => ({
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
    }));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch('https://api.open-elevation.com/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.results) && data.results.length === uniqueEntries.length) {
        uniqueEntries.forEach(([key], idx) => {
          const elev = Number(data.results[idx]?.elevation);
          elevationMap[key] = Number.isFinite(elev) ? Math.round(elev * 10) / 10 : 150;
        });
        return { elevationMap, isLiveApi: true };
      }
    }
  } catch (err) {
    console.warn('Open-Elevation API unreachable, using topographic slope model:', err);
  }

  // Fallback topographic model relative to first coordinate
  const origin = uniqueEntries[0]?.[1] || [0, 0];
  const rad = (slopeDirDeg * Math.PI) / 180;
  const tanSlope = Math.tan(((slopeDeg || 5) * Math.PI) / 180);

  for (const [key, [lng, lat]] of uniqueEntries) {
    const [e, n] = toLocalMeters([lng, lat], origin);
    const dist = e * Math.sin(rad) + n * Math.cos(rad);
    const waveUndulation = Math.sin(e / 45) * 2.5 + Math.cos(n / 45) * 2.0;
    elevationMap[key] = Math.round((250 + dist * tanSlope + waveUndulation) * 10) / 10;
  }

  return { elevationMap, isLiveApi: false };
}
