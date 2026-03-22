import { type Mesh, Vector3 } from 'three'

export type ExportZoneNode = {
  type?: string
  polygon?: [number, number][]
}

export function isMeshInZone(mesh: Mesh, zone: ExportZoneNode): boolean {
  const worldPos = new Vector3()
  mesh.getWorldPosition(worldPos)

  const polygon = zone.polygon
  if (!polygon || polygon.length === 0) return true

  return pointInPolygonWithTolerance(worldPos.x, worldPos.z, polygon)
}

export function getZoneNodeFromSceneNodes(
  nodes: Record<string, unknown>,
  zoneId?: string,
): ExportZoneNode | undefined {
  if (!zoneId) return undefined

  const node = nodes[zoneId]
  if (!node || typeof node !== 'object') return undefined
  if ((node as { type?: unknown }).type !== 'zone') return undefined

  return node as ExportZoneNode
}

function pointInPolygonWithTolerance(
  x: number,
  z: number,
  polygon: [number, number][],
  tolerance = 0.1,
): boolean {
  if (pointInPolygon(x, z, polygon)) {
    return true
  }

  return polygon.some(([px, pz]) => Math.hypot(px - x, pz - z) <= tolerance)
}

function pointInPolygon(x: number, z: number, polygon: [number, number][]): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i] ?? [0, 0]
    const [xj, zj] = polygon[j] ?? [0, 0]

    const intersects =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}
