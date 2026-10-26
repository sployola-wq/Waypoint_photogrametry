import JSZip from 'jszip';
import {
  ImportedKmzMetadata,
  MissionData,
  MissionParameters,
  Waypoint,
} from '../types/mission';
import { DRONE_PROFILES, DEFAULT_DRONE_PROFILE } from './droneProfiles';
import { clampNumber, sanitizeMissionParameters, sanitizePolygon } from './gridGenerator';

export function escapeXml(unsafe: string | number | undefined | null): string {
  const str = String(unsafe ?? '');
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

function getCurrentTimestampMs(): number {
  return Date.now();
}

/**
 * Builds the XML <wpml:actionGroup> for a waypoint based on its gimbalPitch and actionType
 */
function buildWaypointActionGroupXml(wp: Waypoint, defaultPitch: number, indent = '        '): string {
  const pitchVal = Math.max(-90, Math.min(0, Number(wp.gimbalPitch ?? defaultPitch)));
  const actType = wp.actionType || (wp.isPhotoPoint ? 'takePhoto' : 'none');

  let secondActionXml = '';
  if (actType === 'takePhoto') {
    secondActionXml = `
${indent}  <wpml:action>
${indent}    <wpml:actionId>1</wpml:actionId>
${indent}    <wpml:actionActuatorFunc>takePhoto</wpml:actionActuatorFunc>
${indent}    <wpml:actionActuatorFuncParam>
${indent}      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
${indent}      <wpml:fileSuffix>DJI_PHOTO</wpml:fileSuffix>
${indent}    </wpml:actionActuatorFuncParam>
${indent}  </wpml:action>`;
  } else if (actType === 'startRecord') {
    secondActionXml = `
${indent}  <wpml:action>
${indent}    <wpml:actionId>1</wpml:actionId>
${indent}    <wpml:actionActuatorFunc>startRecord</wpml:actionActuatorFunc>
${indent}    <wpml:actionActuatorFuncParam>
${indent}      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
${indent}      <wpml:fileSuffix>DJI_3DGS_VIDEO</wpml:fileSuffix>
${indent}    </wpml:actionActuatorFuncParam>
${indent}  </wpml:action>`;
  } else if (actType === 'stopRecord') {
    secondActionXml = `
${indent}  <wpml:action>
${indent}    <wpml:actionId>1</wpml:actionId>
${indent}    <wpml:actionActuatorFunc>stopRecord</wpml:actionActuatorFunc>
${indent}    <wpml:actionActuatorFuncParam>
${indent}      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
${indent}    </wpml:actionActuatorFuncParam>
${indent}  </wpml:action>`;
  }

  return `${indent}<wpml:actionGroup>
${indent}  <wpml:actionGroupId>${escapeXml(wp.id)}</wpml:actionGroupId>
${indent}  <wpml:actionGroupStartIndex>${escapeXml(wp.id)}</wpml:actionGroupStartIndex>
${indent}  <wpml:actionGroupEndIndex>${escapeXml(wp.id)}</wpml:actionGroupEndIndex>
${indent}  <wpml:actionGroupMode>sequence</wpml:actionGroupMode>
${indent}  <wpml:actionTrigger>
${indent}    <wpml:actionTriggerType>reachPoint</wpml:actionTriggerType>
${indent}  </wpml:actionTrigger>
${indent}  <wpml:action>
${indent}    <wpml:actionId>0</wpml:actionId>
${indent}    <wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc>
${indent}    <wpml:actionActuatorFuncParam>
${indent}      <wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode>
${indent}      <wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable>
${indent}      <wpml:gimbalPitchRotateAngle>${escapeXml(pitchVal)}</wpml:gimbalPitchRotateAngle>
${indent}      <wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable>
${indent}      <wpml:gimbalRollRotateAngle>0</wpml:gimbalRollRotateAngle>
${indent}      <wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable>
${indent}      <wpml:gimbalYawRotateAngle>0</wpml:gimbalYawRotateAngle>
${indent}      <wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable>
${indent}      <wpml:gimbalRotateTime>0</wpml:gimbalRotateTime>
${indent}      <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
${indent}    </wpml:actionActuatorFuncParam>
${indent}  </wpml:action>${secondActionXml}
${indent}</wpml:actionGroup>`;
}

/**
 * Generates the DJI template.kml content according to Waypoint 3.0 / WPML 1.0.2
 * Preserves importedKmzMeta if replacing an existing DJI RC 2 / DJI Fly mission
 */
export function generateTemplateKml(mission: MissionData): string {
  const { parameters, metrics, waypoints, importedKmzMeta } = mission;
  const now = getCurrentTimestampMs();
  const createTime = importedKmzMeta?.createTime || now;
  const author = importedKmzMeta?.author || 'DJI Photogrammetry Planner';
  const templateId = importedKmzMeta?.templateId ?? 0;
  const waylineId = importedKmzMeta?.waylineId ?? 0;

  const drone =
    DRONE_PROFILES.find((d) => d.id === parameters.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const droneEnum = importedKmzMeta?.droneEnumValue ?? drone.wpmlDroneEnum ?? 68;
  const payloadEnum = importedKmzMeta?.payloadEnumValue ?? drone.wpmlPayloadEnum ?? 50;
  const safeHeightMode = escapeXml(parameters.heightMode || 'relativeToStartPoint');
  const safeTurnMode = escapeXml(parameters.turnMode || 'toPointAndStopWithHeading');
  const safeFinishAction = escapeXml(parameters.finishAction || 'goHome');
  const safeTakeoffHeight = Math.max(5, Math.min(200, Number(parameters.takeOffSecurityHeight) || 30));
  const safeRthHeight = Math.max(15, Math.min(500, Number(parameters.rthAltitude) || 60));
  const safeSpeed = Math.max(1, Math.min(15, Number(parameters.speed) || 7));
  const useStraightLineVal = parameters.straightenPaths ? 1 : 0;

  const placemarksXml = waypoints
    .map((wp: Waypoint) => {
      const lngStr = Number(wp.lng).toFixed(7);
      const latStr = Number(wp.lat).toFixed(7);
      const altVal = Math.max(10, Math.min(500, Number(wp.altitude) || parameters.altitude));
      const spdVal = Math.max(1, Math.min(15, Number(wp.speed) || safeSpeed));
      const hdgVal = Number(wp.heading || 0).toFixed(1);
      const pitchVal = Math.max(-90, Math.min(0, Number(wp.gimbalPitch ?? parameters.gimbalPitch)));
      const actionGroupXml = `\n${buildWaypointActionGroupXml(wp, parameters.gimbalPitch, '        ')}`;

      return `      <Placemark>
        <Point>
          <coordinates>${escapeXml(lngStr)},${escapeXml(latStr)}</coordinates>
        </Point>
        <wpml:index>${escapeXml(wp.id)}</wpml:index>
        <wpml:ellipsoidHeight>${escapeXml(altVal)}</wpml:ellipsoidHeight>
        <wpml:height>${escapeXml(altVal)}</wpml:height>
        <wpml:executeHeight>${escapeXml(altVal)}</wpml:executeHeight>
        <wpml:useGlobalHeight>0</wpml:useGlobalHeight>
        <wpml:useGlobalSpeed>0</wpml:useGlobalSpeed>
        <wpml:waypointSpeed>${escapeXml(spdVal)}</wpml:waypointSpeed>
        <wpml:useGlobalHeadingParam>0</wpml:useGlobalHeadingParam>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${escapeXml(hdgVal)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:useGlobalTurnParam>1</wpml:useGlobalTurnParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${safeTurnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:gimbalPitchAngle>${escapeXml(pitchVal)}</wpml:gimbalPitchAngle>
        <wpml:useStraightLine>${useStraightLineVal}</wpml:useStraightLine>${actionGroupXml}
      </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:author>${escapeXml(author)}</wpml:author>
    <wpml:createTime>${escapeXml(createTime)}</wpml:createTime>
    <wpml:updateTime>${escapeXml(now)}</wpml:updateTime>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${safeFinishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${escapeXml(safeTakeoffHeight)}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${escapeXml(safeSpeed)}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${escapeXml(safeRthHeight)}</wpml:globalRTHHeight>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${escapeXml(droneEnum)}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${escapeXml(payloadEnum)}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateType>waypoint</wpml:templateType>
      <wpml:templateId>${escapeXml(templateId)}</wpml:templateId>
      <wpml:waylineCoordinateSysParam>
        <wpml:coordinateMode>WGS84</wpml:coordinateMode>
        <wpml:heightMode>${safeHeightMode}</wpml:heightMode>
        <wpml:positioningType>GPS</wpml:positioningType>
      </wpml:waylineCoordinateSysParam>
      <wpml:executeHeightMode>${safeHeightMode}</wpml:executeHeightMode>
      <wpml:waylineId>${escapeXml(waylineId)}</wpml:waylineId>
      <wpml:distance>${escapeXml(metrics.totalDistanceM)}</wpml:distance>
      <wpml:duration>${escapeXml(metrics.estimatedFlightTimeSec)}</wpml:duration>
      <wpml:autoFlightSpeed>${escapeXml(safeSpeed)}</wpml:autoFlightSpeed>
      <wpml:globalHeight>${escapeXml(parameters.altitude)}</wpml:globalHeight>
      <wpml:caliFlightEnable>0</wpml:caliFlightEnable>
      <wpml:gimbalPitchMode>usePointSetting</wpml:gimbalPitchMode>
      <wpml:globalWaypointHeadingParam>
        <wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode>
        <wpml:waypointHeadingAngle>0</wpml:waypointHeadingAngle>
        <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
        <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
      </wpml:globalWaypointHeadingParam>
      <wpml:globalWaypointTurnMode>${safeTurnMode}</wpml:globalWaypointTurnMode>
      <wpml:globalUseStraightLine>${useStraightLineVal}</wpml:globalUseStraightLine>
${placemarksXml}
    </Folder>
  </Document>
</kml>`;
}

/**
 * Generates the DJI waylines.wpml execution file with full ActionGroups
 */
export function generateWaylinesWpml(mission: MissionData): string {
  const { parameters, metrics, waypoints, importedKmzMeta } = mission;
  const templateId = importedKmzMeta?.templateId ?? 0;
  const waylineId = importedKmzMeta?.waylineId ?? 0;

  const drone =
    DRONE_PROFILES.find((d) => d.id === parameters.droneProfileId) || DEFAULT_DRONE_PROFILE;

  const droneEnum = importedKmzMeta?.droneEnumValue ?? drone.wpmlDroneEnum ?? 68;
  const payloadEnum = importedKmzMeta?.payloadEnumValue ?? drone.wpmlPayloadEnum ?? 50;
  const safeHeightMode = escapeXml(parameters.heightMode || 'relativeToStartPoint');
  const safeTurnMode = escapeXml(parameters.turnMode || 'toPointAndStopWithHeading');
  const safeFinishAction = escapeXml(parameters.finishAction || 'goHome');
  const safeTakeoffHeight = Math.max(5, Math.min(200, Number(parameters.takeOffSecurityHeight) || 30));
  const safeRthHeight = Math.max(15, Math.min(500, Number(parameters.rthAltitude) || 60));
  const safeSpeed = Math.max(1, Math.min(15, Number(parameters.speed) || 7));
  const useStraightLineVal = parameters.straightenPaths ? 1 : 0;

  const placemarksXml = waypoints
    .map((wp: Waypoint) => {
      const lngStr = Number(wp.lng).toFixed(7);
      const latStr = Number(wp.lat).toFixed(7);
      const altVal = Math.max(10, Math.min(500, Number(wp.altitude) || parameters.altitude));
      const spdVal = Math.max(1, Math.min(15, Number(wp.speed) || safeSpeed));
      const hdgVal = Number(wp.heading || 0).toFixed(1);
      const pitchVal = Math.max(-90, Math.min(0, Number(wp.gimbalPitch ?? parameters.gimbalPitch)));
      const actionsXml = buildWaypointActionGroupXml(wp, parameters.gimbalPitch, '        ');

      return `      <Placemark>
        <Point>
          <coordinates>${escapeXml(lngStr)},${escapeXml(latStr)}</coordinates>
        </Point>
        <wpml:index>${escapeXml(wp.id)}</wpml:index>
        <wpml:executeHeight>${escapeXml(altVal)}</wpml:executeHeight>
        <wpml:waypointSpeed>${escapeXml(spdVal)}</wpml:waypointSpeed>
        <wpml:waypointHeadingParam>
          <wpml:waypointHeadingMode>smoothTransition</wpml:waypointHeadingMode>
          <wpml:waypointHeadingAngle>${escapeXml(hdgVal)}</wpml:waypointHeadingAngle>
          <wpml:waypointPoiPoint>0.000000,0.000000,0.000000</wpml:waypointPoiPoint>
          <wpml:waypointHeadingAngleEnable>1</wpml:waypointHeadingAngleEnable>
          <wpml:waypointHeadingPathMode>followBadArc</wpml:waypointHeadingPathMode>
        </wpml:waypointHeadingParam>
        <wpml:waypointTurnParam>
          <wpml:waypointTurnMode>${safeTurnMode}</wpml:waypointTurnMode>
          <wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist>
        </wpml:waypointTurnParam>
        <wpml:useStraightLine>${useStraightLineVal}</wpml:useStraightLine>
        <wpml:waypointGimbalHeadingParam>
          <wpml:waypointGimbalPitchAngle>${escapeXml(pitchVal)}</wpml:waypointGimbalPitchAngle>
          <wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle>
        </wpml:waypointGimbalHeadingParam>
${actionsXml}
      </Placemark>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:wpml="http://www.dji.com/wpmz/1.0.2">
  <Document>
    <wpml:missionConfig>
      <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
      <wpml:finishAction>${safeFinishAction}</wpml:finishAction>
      <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
      <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
      <wpml:takeOffSecurityHeight>${escapeXml(safeTakeoffHeight)}</wpml:takeOffSecurityHeight>
      <wpml:globalTransitionalSpeed>${escapeXml(safeSpeed)}</wpml:globalTransitionalSpeed>
      <wpml:globalRTHHeight>${escapeXml(safeRthHeight)}</wpml:globalRTHHeight>
      <wpml:droneInfo>
        <wpml:droneEnumValue>${escapeXml(droneEnum)}</wpml:droneEnumValue>
        <wpml:droneSubEnumValue>0</wpml:droneSubEnumValue>
      </wpml:droneInfo>
      <wpml:payloadInfo>
        <wpml:payloadEnumValue>${escapeXml(payloadEnum)}</wpml:payloadEnumValue>
        <wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>
        <wpml:payloadPositionIndex>0</wpml:payloadPositionIndex>
      </wpml:payloadInfo>
    </wpml:missionConfig>
    <Folder>
      <wpml:templateId>${escapeXml(templateId)}</wpml:templateId>
      <wpml:executeHeightMode>${safeHeightMode}</wpml:executeHeightMode>
      <wpml:waylineId>${escapeXml(waylineId)}</wpml:waylineId>
      <wpml:distance>${escapeXml(metrics.totalDistanceM)}</wpml:distance>
      <wpml:duration>${escapeXml(metrics.estimatedFlightTimeSec)}</wpml:duration>
      <wpml:autoFlightSpeed>${escapeXml(safeSpeed)}</wpml:autoFlightSpeed>
${placemarksXml}
    </Folder>
  </Document>
</kml>`;
}

/**
 * Creates the .kmz package containing /wpmz/template.kml and /wpmz/waylines.wpml
 */
export async function createDjiKmzBlob(mission: MissionData): Promise<Blob> {
  const zip = new JSZip();

  const templateKml = generateTemplateKml(mission);
  const waylinesWpml = generateWaylinesWpml(mission);

  const wpmzFolder = zip.folder('wpmz');
  if (wpmzFolder) {
    wpmzFolder.file('template.kml', templateKml);
    wpmzFolder.file('waylines.wpml', waylinesWpml);
  }

  const content = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.google-earth.kmz',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 9,
    },
  });

  return content;
}

/**
 * Helper to build a bounding polygon around a set of [lng, lat] points
 */
function buildBoundingPolygonFromWaypoints(pts: [number, number][]): [number, number][] {
  if (pts.length === 0) return [];
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const padLng = Math.max(0.0002, (maxLng - minLng) * 0.05);
  const padLat = Math.max(0.0002, (maxLat - minLat) * 0.05);

  return [
    [minLng - padLng, maxLat + padLat],
    [maxLng + padLng, maxLat + padLat],
    [maxLng + padLng, minLat - padLat],
    [minLng - padLng, minLat - padLat],
  ];
}

/**
 * Unpacks and parses a DJI Fly / DJI Pilot 2 / WaypointMap .KMZ file in the browser using JSZip.
 * Reconstructs waypoints, parameters, and preserves original file metadata so the user can
 * overwrite an existing DJI RC 2 mission directly.
 */
export async function parseDjiKmzFile(
  file: File,
  fallbackParams: MissionParameters
): Promise<{
  aoiPolygon: [number, number][];
  parameters: MissionParameters;
  waypoints: Waypoint[];
  importedKmzMeta: ImportedKmzMetadata;
} | null> {
  try {
    const zip = await JSZip.loadAsync(file);

    let xmlText = '';
    const waylinesFile =
      zip.file('wpmz/waylines.wpml') ||
      zip.file('wpmz/template.kml') ||
      Object.values(zip.files).find((f) => f.name.endsWith('.wpml') || f.name.endsWith('.kml'));

    if (!waylinesFile) {
      throw new Error('No se encontró wpmz/template.kml ni wpmz/waylines.wpml en el archivo KMZ.');
    }

    xmlText = await waylinesFile.async('string');

    // Also read template.kml if we read waylines.wpml first to grab author/createTime
    let templateXmlText = xmlText;
    const templateEntry = zip.file('wpmz/template.kml');
    if (templateEntry) {
      templateXmlText = await templateEntry.async('string');
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const templateDoc = parser.parseFromString(templateXmlText, 'text/xml');

    const getTagText = (root: Document | Element, localName: string): string | null => {
      const byNs = root.getElementsByTagName(`wpml:${localName}`);
      if (byNs && byNs.length > 0 && byNs[0].textContent) {
        return byNs[0].textContent.trim();
      }
      const byPlain = root.getElementsByTagName(localName);
      if (byPlain && byPlain.length > 0 && byPlain[0].textContent) {
        return byPlain[0].textContent.trim();
      }
      return null;
    };

    const author = getTagText(templateDoc, 'author') || 'DJI Fly User';
    const createTime = Number(getTagText(templateDoc, 'createTime')) || Date.now();
    const updateTime = Number(getTagText(templateDoc, 'updateTime')) || Date.now();
    const templateId = Number(getTagText(templateDoc, 'templateId')) || 0;
    const waylineId = Number(getTagText(xmlDoc, 'waylineId')) || 0;
    const droneEnumValue = Number(getTagText(templateDoc, 'droneEnumValue')) || 68;
    const payloadEnumValue = Number(getTagText(templateDoc, 'payloadEnumValue')) || 50;

    const globalSpeed = clampNumber(
      getTagText(xmlDoc, 'autoFlightSpeed') || getTagText(templateDoc, 'autoFlightSpeed'),
      1,
      15,
      fallbackParams.speed
    );
    const takeOffSecurityHeight = clampNumber(
      getTagText(templateDoc, 'takeOffSecurityHeight'),
      5,
      200,
      fallbackParams.takeOffSecurityHeight
    );
    const rthAltitude = clampNumber(
      getTagText(templateDoc, 'globalRTHHeight'),
      15,
      500,
      fallbackParams.rthAltitude
    );

    const placemarks = Array.from(xmlDoc.getElementsByTagName('Placemark'));
    const parsedWaypoints: Waypoint[] = [];
    const coordPairs: [number, number][] = [];

    placemarks.forEach((pm, idx) => {
      const coordText = getTagText(pm, 'coordinates');
      if (!coordText) return;
      const parts = coordText.split(',').map((s) => parseFloat(s.trim()));
      if (parts.length < 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;

      const lng = clampNumber(parts[0], -180, 180, 0);
      const lat = clampNumber(parts[1], -90, 90, 0);
      coordPairs.push([lng, lat]);

      const alt = clampNumber(
        getTagText(pm, 'executeHeight') || getTagText(pm, 'height') || parts[2],
        10,
        500,
        fallbackParams.altitude
      );
      const spd = clampNumber(getTagText(pm, 'waypointSpeed'), 1, 15, globalSpeed);
      const hdg = clampNumber(getTagText(pm, 'waypointHeadingAngle'), 0, 360, 0);
      const pitch = clampNumber(
        getTagText(pm, 'gimbalPitchRotateAngle') ||
          getTagText(pm, 'waypointGimbalPitchAngle') ||
          getTagText(pm, 'gimbalPitchAngle'),
        -90,
        0,
        fallbackParams.gimbalPitch
      );

      const funcText = pm.innerHTML || '';
      const hasStartRec = funcText.includes('startRecord');
      const hasStopRec = funcText.includes('stopRecord');
      const hasTakePhoto = funcText.includes('takePhoto');

      const actionType: 'takePhoto' | 'startRecord' | 'stopRecord' | 'none' = hasStartRec
        ? 'startRecord'
        : hasStopRec
        ? 'stopRecord'
        : hasTakePhoto
        ? 'takePhoto'
        : 'takePhoto';

      parsedWaypoints.push({
        id: idx,
        lat,
        lng,
        altitude: alt,
        baseAltitude: alt,
        speed: spd,
        gimbalPitch: pitch,
        heading: hdg,
        isPhotoPoint: actionType !== 'none',
        distanceFromStartM: 0,
        estimatedTimeSec: 0,
        phase: 'imported',
        phaseLabel: `KMZ Importado (${file.name})`,
        actionType,
      });
    });

    if (parsedWaypoints.length === 0) {
      return null;
    }

    const aoiPolygon = buildBoundingPolygonFromWaypoints(coordPairs);
    const firstWp = parsedWaypoints[0];
    const parameters = sanitizeMissionParameters(
      {
        altitude: firstWp.altitude,
        speed: firstWp.speed,
        gimbalPitch: firstWp.gimbalPitch,
        takeOffSecurityHeight,
        rthAltitude,
        missionPattern: 'imported-custom',
      },
      fallbackParams
    );

    const importedKmzMeta: ImportedKmzMetadata = {
      originalFileName: file.name,
      author,
      createTime,
      updateTime,
      templateId,
      waylineId,
      droneEnumValue,
      payloadEnumValue,
      importedWaypointCount: parsedWaypoints.length,
    };

    return {
      aoiPolygon,
      parameters,
      waypoints: parsedWaypoints,
      importedKmzMeta,
    };
  } catch (err) {
    console.error('Error parsing KMZ file:', err);
    return null;
  }
}

/**
 * Downloads a Blob directly to the client's device
 */
export function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates Standard GIS KML for Google Earth / QGIS
 */
export function generateStandardKml(mission: MissionData): string {
  const { waypoints, aoiPolygon, parameters } = mission;

  const flightCoordinates = waypoints
    .map(
      (wp: Waypoint) =>
        `${escapeXml(wp.lng.toFixed(7))},${escapeXml(wp.lat.toFixed(7))},${escapeXml(wp.altitude)}`
    )
    .join(' ');

  const aoiCoordinates =
    aoiPolygon.length > 0
      ? [...aoiPolygon, aoiPolygon[0]]
          .map((pt) => `${escapeXml(pt[0].toFixed(7))},${escapeXml(pt[1].toFixed(7))},0`)
          .join(' ')
      : '';

  const homePlacemark = parameters.homePoint
    ? `    <Placemark>
      <name>Pies del Piloto / Home Point (Despegue y RTH)</name>
      <Point>
        <coordinates>${escapeXml(parameters.homePoint[0].toFixed(7))},${escapeXml(
        parameters.homePoint[1].toFixed(7)
      )},0</coordinates>
      </Point>
    </Placemark>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Photogrammetry Mission Plan (DJI WPML 3.0)</name>
    <Style id="flightLineStyle">
      <LineStyle>
        <color>ff00ffff</color>
        <width>3</width>
      </LineStyle>
    </Style>
    <Style id="aoiStyle">
      <LineStyle>
        <color>ffffaa00</color>
        <width>2</width>
      </LineStyle>
      <PolyStyle>
        <color>40ffaa00</color>
      </PolyStyle>
    </Style>
${homePlacemark}
    <Placemark>
      <name>AOI - Area of Interest</name>
      <styleUrl>#aoiStyle</styleUrl>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${aoiCoordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Lawnmower Flight Path</name>
      <styleUrl>#flightLineStyle</styleUrl>
      <LineString>
        <altitudeMode>relativeToGround</altitudeMode>
        <coordinates>${flightCoordinates}</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
}

/**
 * Generates GeoJSON FeatureCollection
 */
export function generateGeoJson(mission: MissionData): string {
  const { waypoints, aoiPolygon, metrics, parameters } = mission;

  const features: any[] = [
    {
      type: 'Feature',
      properties: {
        name: 'Area of Interest (AOI)',
        areaHa: metrics.areaHa,
        areaSqM: metrics.areaSqM,
      },
      geometry: {
        type: 'Polygon',
        coordinates: aoiPolygon.length > 0 ? [[...aoiPolygon, aoiPolygon[0]]] : [],
      },
    },
    {
      type: 'Feature',
      properties: {
        name: 'Flight Path Trajectory',
        missionPattern: parameters.missionPattern,
        totalDistanceM: metrics.totalDistanceM,
        flightTimeSec: metrics.estimatedFlightTimeSec,
        photoCount: metrics.photoCount,
        batteryCount: metrics.batteryCount,
        gsdCmPx: metrics.gsdCmPx,
        lookAheadOffsetM: metrics.lookAheadOffsetM,
      },
      geometry: {
        type: 'LineString',
        coordinates: waypoints.map((wp: Waypoint) => [wp.lng, wp.lat, wp.altitude]),
      },
    },
  ];

  if (parameters.homePoint) {
    features.push({
      type: 'Feature',
      properties: {
        name: 'Pies del Piloto / Home Point (Despegue y Aterrizaje RTH)',
        type: 'HOME_POINT',
        finishAction: parameters.finishAction,
      },
      geometry: {
        type: 'Point',
        coordinates: [parameters.homePoint[0], parameters.homePoint[1], 0],
      },
    });
  }

  waypoints.forEach((wp: Waypoint) => {
    features.push({
      type: 'Feature',
      properties: {
        index: wp.id,
        altitudeM: wp.altitude,
        terrainDeltaM: wp.terrainDeltaM || 0,
        speedMs: wp.speed,
        headingDeg: wp.heading,
        gimbalPitchDeg: wp.gimbalPitch,
        phase: wp.phase || 'grid-primary',
        actionType: wp.actionType || 'takePhoto',
        isPhotoPoint: wp.isPhotoPoint,
        isBatterySwapPoint: wp.isBatterySwapPoint || false,
        batteryIndex: wp.batteryIndex || 1,
        timeSec: wp.estimatedTimeSec,
      },
      geometry: {
        type: 'Point',
        coordinates: [wp.lng, wp.lat, wp.altitude],
      },
    });
  });

  const geojson = {
    type: 'FeatureCollection',
    properties: {
      mission: 'DJI Photogrammetry Lawnmower WPML 3.0',
      metrics,
      parameters,
      exportedAt: new Date().toISOString(),
    },
    features,
  };

  return JSON.stringify(geojson, null, 2);
}

/**
 * Generates CSV Waypoint Table
 */
export function generateCsvWaypoints(mission: MissionData): string {
  const headers = [
    'Index',
    'Phase',
    'Latitude',
    'Longitude',
    'Altitude_m',
    'TerrainDelta_m',
    'Speed_ms',
    'Heading_deg',
    'GimbalPitch_deg',
    'Action',
    'BatteryIndex',
    'IsBatterySwapPoint',
    'Distance_m',
    'Time_sec',
  ];

  const rows = mission.waypoints.map((wp: Waypoint) => [
    wp.id,
    wp.phase || 'grid-primary',
    wp.lat.toFixed(7),
    wp.lng.toFixed(7),
    wp.altitude,
    wp.terrainDeltaM ?? 0,
    wp.speed,
    wp.heading.toFixed(1),
    wp.gimbalPitch,
    wp.actionType || (wp.isPhotoPoint ? 'takePhoto' : 'none'),
    wp.batteryIndex || 1,
    wp.isBatterySwapPoint ? 'YES' : 'NO',
    wp.distanceFromStartM.toFixed(1),
    wp.estimatedTimeSec,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Exports portable Mission Configuration JSON (AOI Polygon + Parameters + Waypoints)
 */
export function generateMissionPlanJson(mission: MissionData): string {
  const payload = {
    schema: 'DJI_WPML_MISSION_PLAN_V3',
    exportedAt: new Date().toISOString(),
    aoiPolygon: mission.aoiPolygon,
    parameters: mission.parameters,
    waypoints: mission.waypoints,
    summaryMetrics: {
      gsdCmPx: mission.metrics.gsdCmPx,
      photoIntervalSec: mission.metrics.photoIntervalSec,
      lookAheadOffsetM: mission.metrics.lookAheadOffsetM,
      photoCount: mission.metrics.photoCount,
      batteryCount: mission.metrics.batteryCount,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Safely parses and validates an imported Mission JSON file OR Legacy WaypointMap JSON Array
 * e.g. [{altitude, Latitude, Longitude, heading, gimbalAngle, speed, action}]
 */
export function parseMissionPlanJson(
  rawJson: string,
  fallbackParams: MissionParameters
): {
  aoiPolygon: [number, number][];
  parameters: MissionParameters;
  customWaypoints?: Waypoint[];
} | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (!parsed) return null;

    // Case 1: Legacy WaypointMap Array format: [{altitude, Latitude, Longitude, heading, gimbalAngle, speed, action}]
    if (Array.isArray(parsed)) {
      const customWaypoints: Waypoint[] = [];
      const coordPairs: [number, number][] = [];

      parsed.forEach((item: any, idx: number) => {
        if (!item || typeof item !== 'object') return;
        const rawLat = item.Latitude ?? item.latitude ?? item.lat;
        const rawLng = item.Longitude ?? item.longitude ?? item.lng ?? item.lon;
        if (!Number.isFinite(Number(rawLat)) || !Number.isFinite(Number(rawLng))) return;

        const lat = clampNumber(rawLat, -90, 90, 0);
        const lng = clampNumber(rawLng, -180, 180, 0);
        coordPairs.push([lng, lat]);

        const alt = clampNumber(item.altitude ?? item.height ?? 75, 10, 500, 75);
        const spd = clampNumber(item.speed ?? fallbackParams.speed, 1, 15, fallbackParams.speed);
        const hdg = clampNumber(item.heading ?? item.yaw ?? 0, 0, 360, 0);
        const pitch = clampNumber(
          item.gimbalAngle ?? item.gimbalPitch ?? fallbackParams.gimbalPitch,
          -90,
          0,
          fallbackParams.gimbalPitch
        );

        const rawAct = String(item.action ?? 'takePhoto').toLowerCase();
        const actionType: 'takePhoto' | 'startRecord' | 'stopRecord' | 'none' = rawAct.includes(
          'start'
        )
          ? 'startRecord'
          : rawAct.includes('stop')
          ? 'stopRecord'
          : rawAct.includes('none') || rawAct.includes('no')
          ? 'none'
          : 'takePhoto';

        customWaypoints.push({
          id: idx,
          lat,
          lng,
          altitude: alt,
          baseAltitude: alt,
          speed: spd,
          gimbalPitch: pitch,
          heading: hdg,
          isPhotoPoint: actionType !== 'none',
          distanceFromStartM: 0,
          estimatedTimeSec: 0,
          phase: 'imported',
          phaseLabel: 'WaypointMap JSON Importado',
          actionType,
        });
      });

      if (customWaypoints.length === 0) return null;

      const aoiPolygon = buildBoundingPolygonFromWaypoints(coordPairs);
      const first = customWaypoints[0];
      const parameters = sanitizeMissionParameters(
        {
          altitude: first.altitude,
          speed: first.speed,
          gimbalPitch: first.gimbalPitch,
          missionPattern: 'imported-custom',
        },
        fallbackParams
      );

      return { aoiPolygon, parameters, customWaypoints };
    }

    // Case 2: Standard Mission JSON or GeoJSON object
    if (typeof parsed !== 'object') return null;

    const rawPolygon =
      parsed.aoiPolygon ||
      parsed.properties?.parameters?.aoiPolygon ||
      (Array.isArray(parsed.features) &&
        parsed.features
          .find((f: any) => f?.geometry?.type === 'Polygon')
          ?.geometry?.coordinates?.[0]?.slice(0, -1));

    const rawParams = parsed.parameters || parsed.properties?.parameters;
    if (!rawPolygon && !rawParams && !Array.isArray(parsed.waypoints)) return null;

    const aoiPolygon = sanitizePolygon(rawPolygon);
    const parameters = sanitizeMissionParameters(rawParams || {}, fallbackParams);

    return { aoiPolygon, parameters };
  } catch (err) {
    console.error('Invalid mission JSON:', err);
    return null;
  }
}
