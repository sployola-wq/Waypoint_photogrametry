export interface DroneCameraProfile {
  id: string;
  name: string;
  manufacturer: string;
  model: string;
  sensorWidthMm: number;      // e.g. 13.2 for 1" CMOS
  sensorHeightMm: number;     // e.g. 8.8 for 1" CMOS
  focalLengthMm: number;      // Real focal length in mm, e.g. 8.58mm
  focalEquivalentMm: number;  // 35mm equivalent, e.g. 24mm or 70mm
  imageWidthPx: number;       // e.g. 4096 or 8192
  imageHeightPx: number;      // e.g. 3072 or 6144
  shutterType: 'mechanical' | 'electronic';
  maxSpeedMs: number;
  minPhotoIntervalSec: number;         // Minimum safe interval between shots (2.0s for 12MP, 3.2s for 50MP/48MP)
  nominalBatteryMin?: number;          // Nominal factory flight time (e.g. 45 min for Air 3S)
  recommendedSafeBatteryMin?: number;  // Real operational safe flight time with wind + RTH reserve (e.g. 30 min)
  isHighResBufferMode?: boolean;       // True for 48MP / 50MP Quad-Bayer modes with heavy SD write buffer
  wpmlDroneEnum?: number;              // DJI WPML droneEnumValue
  wpmlPayloadEnum?: number;            // DJI WPML payloadEnumValue
}

export interface CustomSensorConfig {
  sensorWidthMm: number;
  sensorHeightMm: number;
  focalLengthMm: number;
  imageWidthPx: number;
  imageHeightPx: number;
}

export type FinishAction = 'goHome' | 'autoLand' | 'gotoFirstWaypoint' | 'noAction';
export type TurnMode = 'toPointAndStopWithHeading' | 'coordinateTurn' | 'toPointAndStopWithDiscontinuityCurvature';
export type HeightMode = 'WGS84' | 'relativeToStartPoint' | 'realTimeFollowSurface';

export type MissionPattern =
  | 'single-grid'
  | 'double-grid'
  | 'orbit-poi'
  | 'combo-3dgs-pro'
  | 'imported-custom';

export type WaypointDensityMode = 'all-photo-points' | 'endpoints-only';
export type WaypointActionMode = 'takePhoto' | 'recordVideo' | 'none';

export type WaypointPhase =
  | 'grid-primary'
  | 'grid-cross'
  | 'orbit-poi'
  | 'orbit-inner-75'
  | 'grid-nadir-90'
  | 'orbit-outer-45'
  | 'imported';

export interface ImportedKmzMetadata {
  originalFileName: string;
  author?: string;
  createTime?: number;
  updateTime?: number;
  templateId?: number;
  waylineId?: number;
  droneEnumValue?: number;
  payloadEnumValue?: number;
  importedWaypointCount: number;
}

export interface MissionParameters {
  altitude: number;               // meters (15m to 500m)
  speed: number;                  // m/s (1 m/s to 15 m/s)
  frontOverlap: number;           // % (10% to 95%)
  sideOverlap: number;            // % (10% to 95%)
  gimbalPitch: number;            // degrees (-90° to 0°, -90 = Nadir)
  flightAngle: number;            // degrees (0 to 360)
  margin: number;                 // buffer in meters around AOI (default 0)
  droneProfileId: string;
  customSensor?: CustomSensorConfig;
  finishAction: FinishAction;
  turnMode: TurnMode;
  heightMode: HeightMode;
  takeOffSecurityHeight: number;  // meters (safe climb before WP #0 transit)
  rthAltitude: number;            // meters (Return-to-Home altitude)
  batteryFlightTimeMin: number;   // Safe flight minutes per battery
  homePoint?: [number, number];   // [lng, lat] Pilot / Takeoff location

  // New Multi-Phase & WaypointMap Pro Practical Options
  missionPattern: MissionPattern;
  waypointDensity: WaypointDensityMode;
  waypointAction: WaypointActionMode;
  reverseFlightPath: boolean;
  straightenPaths: boolean;
  orbitPointsCount: number;       // Number of waypoints per orbit (default 16)
  terrainFollowEnabled: boolean;  // Dynamic terrain offset adjustment
  terrainSlopeDeg: number;        // Slope angle in degrees (-25 to +25) along terrain gradient
  terrainSlopeDirectionDeg: number; // Direction of uphill gradient (0-360°)
}

export interface Waypoint {
  id: number;
  lat: number;
  lng: number;
  altitude: number;          // Effective execution altitude (meters, including terrain delta if enabled)
  baseAltitude?: number;     // Nominal planned altitude before terrain offset
  terrainDeltaM?: number;    // Ground elevation difference vs Takeoff/Home point (meters)
  groundElevationM?: number; // Absolute ground elevation (MSL) if queried from DEM API
  speed: number;             // m/s
  gimbalPitch: number;       // degrees
  heading: number;           // degrees (0-360)
  isPhotoPoint: boolean;
  isTurnPoint?: boolean;
  distanceFromStartM: number;
  estimatedTimeSec: number;
  isBatterySwapPoint?: boolean;
  batteryIndex?: number;
  phase?: WaypointPhase;
  phaseLabel?: string;
  actionType?: 'takePhoto' | 'startRecord' | 'stopRecord' | 'none';
}

export interface FlightTransect {
  lineIndex: number;
  phase?: WaypointPhase;
  points: Waypoint[];
}

export interface BatterySwapInfo {
  batteryNumber: number;
  startWaypointId: number;
  endWaypointId: number;
  swapWaypoint?: Waypoint;
  flightDurationSec: number;
  photosInBattery: number;
  distanceM: number;
}

export interface SafetyWarning {
  id: string;
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  fixActionLabel?: string;
  suggestedPatch?: Partial<MissionParameters>;
}

export interface PhotogrammetryMetrics {
  gsdCmPx: number;                 // Nadir GSD in cm/pixel
  effectiveGsdCmPx: number;        // Oblique-adjusted GSD at optical center in cm/pixel
  groundFootprintWidthM: number;   // Footprint width in meters
  groundFootprintHeightM: number;  // Footprint height in meters
  lookAheadOffsetM: number;        // Optical center forward offset d = H * tan(90 - |Pitch|) in meters
  lineSpacingM: number;            // Distance between flight lines
  photoSpacingM: number;           // Distance between photos along line
  photoIntervalSec: number;        // Time between consecutive photos t = photoSpacingM / speed (sec)
  minSafeIntervalSec: number;      // Minimum safe trigger interval for current camera profile (sec)
  estimatedMotionBlurPx: number;   // Estimated motion blur in pixels at 1/800s exposure
  estimatedMotionBlurMm: number;   // Estimated ground motion blur in mm
  recommendedMaxSpeedMs: number;   // Recommended max speed to avoid SD buffer saturation & rolling shutter blur
  areaHa: number;                  // Area in hectares
  areaSqM: number;                 // Area in m²
  totalDistanceM: number;          // Total path length
  estimatedFlightTimeSec: number;  // Total time on grid
  photoCount: number;              // Number of photos
  waypointCount: number;           // Total waypoints (points)
  transectCount: number;           // Number of passes/segments
  batteryCount: number;            // Number of batteries needed
  batterySwaps: BatterySwapInfo[]; // Battery segments & swap locations
  batterySwapPoints?: Waypoint[];  // Convenience list of swap waypoints
  transitDistanceM: number;        // Distance to/from pilot home point
  totalMissionTimeSec: number;     // Including take-off and RTH transit
  minTerrainDeltaM?: number;       // Minimum terrain delta across waypoints
  maxTerrainDeltaM?: number;       // Maximum terrain delta across waypoints
  safetyWarnings: SafetyWarning[]; // Operational & pre-flight safety warnings
}

export interface MissionData {
  aoiPolygon: [number, number][];  // [lng, lat] GeoJSON format
  parameters: MissionParameters;
  metrics: PhotogrammetryMetrics;
  waypoints: Waypoint[];
  transects: FlightTransect[];
  importedKmzMeta?: ImportedKmzMetadata | null;
}
