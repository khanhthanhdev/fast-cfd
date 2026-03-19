import type { AnyNode, ItemNode } from '@pascal-app/core'

/**
 * HVAC diffuser types
 */
export type DiffuserType = 'supply' | 'return' | 'exhaust'

/**
 * Information about a detected diffuser in the scene
 */
export interface DiffuserInfo {
  id: string
  type: DiffuserType
  position: [number, number, number]
  itemId: string
  name: string
  metadata?: Record<string, unknown>
}

/**
 * Check if an item node is an HVAC diffuser based on tags
 * Supports: supply/in (air intake) and return/out/exhaust (air exhaust)
 */
export function isHVACDiffuser(item: ItemNode): boolean {
  const tags = item.asset.tags || []
  return tags.includes('hvac') && (
    tags.includes('supply') ||
    tags.includes('return') ||
    tags.includes('exhaust') ||
    tags.includes('in') ||
    tags.includes('out')
  )
}

/**
 * Determine diffuser type from item tags
 * 'supply' or 'in' tags = supply (air intake)
 * 'return', 'out', or 'exhaust' tags = return/exhaust (air outlet)
 */
export function getDiffuserType(item: ItemNode): DiffuserType {
  const tags = item.asset.tags || []
  if (tags.includes('return') || tags.includes('out')) return 'return'
  if (tags.includes('exhaust')) return 'exhaust'
  return 'supply'
}

/**
 * Find all HVAC diffusers in the scene
 * Scans all nodes for ItemNodes with hvac tags
 */
export function findAllDiffusers(allNodes: Record<string, AnyNode>): DiffuserInfo[] {
  const diffusers: DiffuserInfo[] = []

  for (const [id, node] of Object.entries(allNodes)) {
    if (!node || node.type !== 'item') continue

    const item = node as ItemNode
    if (!isHVACDiffuser(item)) continue

    diffusers.push({
      id: item.id,
      type: getDiffuserType(item),
      position: item.position,
      itemId: item.asset.id,
      name: item.asset.name,
    })
  }

  return diffusers
}

/**
 * Find all HVAC diffusers within a specific zone
 * Filters diffusers by checking if their position is inside the zone polygon
 */
export function findDiffusersInZone(
  zoneId: string,
  allNodes: Record<string, AnyNode>,
  zonePolygon?: [number, number][],
): DiffuserInfo[] {
  const allDiffusers = findAllDiffusers(allNodes)

  // If no polygon provided, return all diffusers
  if (!zonePolygon || zonePolygon.length === 0) {
    return allDiffusers
  }

  // Filter diffusers that are inside the zone polygon
  return allDiffusers.filter((diffuser) => {
    const [x, _, z] = diffuser.position
    return isPointInPolygon([x, z], zonePolygon)
  })
}

/**
 * Check if a 2D point is inside a polygon using ray casting
 */
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, z] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]?.[0] ?? 0
    const zi = polygon[i]?.[1] ?? 0
    const xj = polygon[j]?.[0] ?? 0
    const zj = polygon[j]?.[1] ?? 0

    const intersect =
      zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi

    if (intersect) inside = !inside
  }

  return inside
}

/**
 * Get the primary diffuser for simplified AI model
 * Returns the first supply diffuser, or first diffuser of any type
 */
export function getPrimaryDiffuser(diffusers: DiffuserInfo[]): DiffuserInfo | null {
  if (diffusers.length === 0) return null

  // Prefer supply diffusers
  const supplyDiffuser = diffusers.find((d) => d.type === 'supply')
  if (supplyDiffuser) return supplyDiffuser

  // Fallback to first diffuser (array is non-empty per check above)
  return diffusers[0]!
}

/**
 * Calculate aggregated diffuser position for multiple diffusers
 * Returns the centroid of all supply diffusers, or all diffusers if no supply
 */
export function getAggregatedDiffuserPosition(
  diffusers: DiffuserInfo[],
): [number, number, number] | null {
  if (diffusers.length === 0) return null

  // Use supply diffusers only for aggregation
  const supplyDiffusers = diffusers.filter((d) => d.type === 'supply')
  const targetDiffusers = supplyDiffusers.length > 0 ? supplyDiffusers : diffusers

  const sum = targetDiffusers.reduce(
    (acc, d) => {
      acc[0] += d.position[0]
      acc[1] += d.position[1]
      acc[2] += d.position[2]
      return acc
    },
    [0, 0, 0] as [number, number, number],
  )

  return [
    sum[0] / targetDiffusers.length,
    sum[1] / targetDiffusers.length,
    sum[2] / targetDiffusers.length,
  ]
}
