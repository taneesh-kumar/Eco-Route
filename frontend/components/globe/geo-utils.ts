import * as THREE from "three";

/**
 * Converts Latitude and Longitude to 3D Cartesian Vector3 on a sphere of radius R.
 * standard convention:
 * phi = (90 - lat) * (PI / 180)
 * theta = (lng + 180) * (PI / 180)
 */
export function latLngToVector3(
  lat: number,
  lng: number,
  radius: number = 1.0,
  altitude: number = 0
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const r = radius + altitude;

  const x = -(r * Math.sin(phi) * Math.cos(theta));
  const z = r * Math.sin(phi) * Math.sin(theta);
  const y = r * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

/**
 * Generates an elevated 3D Great-Circle quadratic/cubic Bezier curve between two coordinates.
 */
export function createGreatCircleArc(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  radius: number = 1.0,
  maxAltitude: number = 0.28,
  pointsCount: number = 64
): { points: THREE.Vector3[]; controlPoint: THREE.Vector3 } {
  const v1 = latLngToVector3(startLat, startLng, radius);
  const v2 = latLngToVector3(endLat, endLng, radius);

  // Angular distance in radians
  const angularDist = v1.angleTo(v2);
  
  // Midpoint elevated outward
  const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
  const distFactor = Math.sin(Math.min(Math.PI, angularDist));
  const elevation = radius + Math.max(0.08, maxAltitude * distFactor);
  mid.normalize().multiplyScalar(elevation);

  // Bezier curve
  const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2);
  const points = curve.getPoints(pointsCount);

  return { points, controlPoint: mid };
}
