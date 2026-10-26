/**
 * Geospatial mathematics and photogrammetric projection utilities
 */

const EARTH_RADIUS = 6378137; // WGS84 major axis in meters

/**
 * Calculates Haversine distance in meters between two [lng, lat] coordinates
 */
export function haversineDistance(p1: [number, number], p2: [number, number]): number {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const rLat1 = (lat1 * Math.PI) / 180;
  const rLat2 = (lat2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(rLat1) * Math.cos(rLat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS * c;
}

/**
 * Calculates initial bearing in degrees (0 - 360) from p1 to p2
 */
export function calculateBearing(p1: [number, number], p2: [number, number]): number {
  const [lon1, lat1] = p1;
  const [lon2, lat2] = p2;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

/**
 * Given a starting point [lng, lat], bearing in degrees, and distance in meters, returns new [lng, lat]
 */
export function destinationPoint(
  start: [number, number],
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const [lon1, lat1] = start;
  const δ = distanceMeters / EARTH_RADIUS;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat1 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;

  const sinφ2 = Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ);
  const φ2 = Math.asin(sinφ2);
  const y = Math.sin(θ) * Math.sin(δ) * Math.cos(φ1);
  const x = Math.cos(δ) - Math.sin(φ1) * sinφ2;
  const λ2 = λ1 + Math.atan2(y, x);

  return [((λ2 * 180) / Math.PI + 540) % 360 - 180, (φ2 * 180) / Math.PI];
}

/**
 * Calculates polygon centroid [lng, lat]
 */
export function getPolygonCentroid(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [0, 0];
  let sumLon = 0;
  let sumLat = 0;
  const count = polygon.length;
  for (let i = 0; i < count; i++) {
    sumLon += polygon[i][0];
    sumLat += polygon[i][1];
  }
  return [sumLon / count, sumLat / count];
}

/**
 * Calculates polygon geodesic area in square meters using spherical excess
 */
export function calculatePolygonArea(coordinates: [number, number][]): number {
  if (coordinates.length < 3) return 0;
  let total = 0;
  const coords = [...coordinates];
  // Ensure closed
  if (
    coords[0][0] !== coords[coords.length - 1][0] ||
    coords[0][1] !== coords[coords.length - 1][1]
  ) {
    coords.push(coords[0]);
  }

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    total += dLon * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  const area = Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2.0);
  return area;
}

/**
 * Converts [lng, lat] to local tangent plane (meters east, meters north) relative to origin
 */
export function toLocalMeters(
  coord: [number, number],
  origin: [number, number]
): [number, number] {
  const [lon, lat] = coord;
  const [origLon, origLat] = origin;
  const dLat = ((lat - origLat) * Math.PI) / 180;
  const dLon = ((lon - origLon) * Math.PI) / 180;
  const midLat = ((lat + origLat) / 2 * Math.PI) / 180;

  const northMeters = dLat * EARTH_RADIUS;
  const eastMeters = dLon * EARTH_RADIUS * Math.cos(midLat);
  return [eastMeters, northMeters];
}

/**
 * Converts local meters [east, north] back to [lng, lat] relative to origin
 */
export function fromLocalMeters(
  localPoint: [number, number],
  origin: [number, number]
): [number, number] {
  const [eastMeters, northMeters] = localPoint;
  const [origLon, origLat] = origin;

  const dLat = northMeters / EARTH_RADIUS;
  const newLatRad = (origLat * Math.PI) / 180 + dLat;
  const midLat = ((origLat * Math.PI) / 180 + newLatRad) / 2;
  const dLon = eastMeters / (EARTH_RADIUS * Math.cos(midLat));

  const newLat = (newLatRad * 180) / Math.PI;
  const newLon = origLon + (dLon * 180) / Math.PI;
  return [newLon, newLat];
}

/**
 * Point in polygon test using ray-casting algorithm (in 2D local space)
 */
export function isPointInPolygon2D(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Finds intersection point between line segment [p1, p2] and horizontal line y = yLevel
 */
export function intersectSegmentWithHorizontalLine(
  p1: [number, number],
  p2: [number, number],
  yLevel: number
): number | null {
  const [x1, y1] = p1;
  const [x2, y2] = p2;

  // Check if segment spans yLevel
  if ((y1 <= yLevel && y2 >= yLevel) || (y2 <= yLevel && y1 >= yLevel)) {
    if (Math.abs(y2 - y1) < 1e-9) {
      // Horizontal segment
      return null;
    }
    const t = (yLevel - y1) / (y2 - y1);
    const x = x1 + t * (x2 - x1);
    return x;
  }
  return null;
}

/**
 * Calculates the optimal flight heading (in degrees) to minimize the number of passes
 * by finding the angle of the longest polygon segment.
 */
export function calculateOptimalFlightAngle(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0;
  let maxDist = 0;
  let bestAngle = 0;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    const dist = haversineDistance(p1, p2);
    if (dist > maxDist) {
      maxDist = dist;
      bestAngle = calculateBearing(p1, p2);
    }
  }

  // Normalize angle between 0 and 180 for parallel lines
  return Math.round(bestAngle % 180);
}
