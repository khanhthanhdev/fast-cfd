import { getScaledDimensions, sceneRegistry, type AnyNode, type ItemNode } from '@pascal-app/core'
import { Quaternion, Vector3 } from 'three'

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
  direction: [number, number, number]
  airflowRate: number
  spreadAngle: number
  dimensions: [number, number, number]
  surface: 'ceiling' | 'wall' | 'free'
  itemId: string
  name: string
  metadata?: Record<string, unknown>
}

const tempWorldPosition = new Vector3()
const tempWorldDirection = new Vector3()
const tempWorldQuaternion = new Quaternion()
const downVector = new Vector3(0, -1, 0)
const forwardVector = new Vector3(0, 0, -1)

function isVectorTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((component) => typeof component === 'number')
}

function normalizeDirection(
  direction: [number, number, number],
): [number, number, number] {
  const magnitude = Math.hypot(direction[0], direction[1], direction[2])
  if (magnitude <= 1e-6) {
    return [0, -1, 0]
  }

  return [
    direction[0] / magnitude,
    direction[1] / magnitude,
    direction[2] / magnitude,
  ]
}

function getDiffuserSurface(item: ItemNode): DiffuserInfo['surface'] {
  if (item.wallId || item.asset.attachTo === 'wall' || item.asset.tags?.includes('wall')) {
    return 'wall'
  }

  if (item.asset.attachTo === 'ceiling' || item.asset.tags?.includes('ceiling')) {
    return 'ceiling'
  }

  return 'free'
}

function getDiffuserWorldPosition(item: ItemNode): [number, number, number] {
  const object3D = sceneRegistry.nodes.get(item.id)
  if (!object3D) {
    return item.position
  }

  object3D.getWorldPosition(tempWorldPosition)

  return [tempWorldPosition.x, tempWorldPosition.y, tempWorldPosition.z]
}

function getSceneAlignedFallbackDirection(item: ItemNode): [number, number, number] | null {
  const object3D = sceneRegistry.nodes.get(item.id)
  if (!object3D) {
    return null
  }

  object3D.getWorldQuaternion(tempWorldQuaternion)

  tempWorldDirection
    .copy(getDiffuserSurface(item) === 'ceiling' ? downVector : forwardVector)
    .applyQuaternion(tempWorldQuaternion)

  return normalizeDirection([
    tempWorldDirection.x,
    tempWorldDirection.y,
    tempWorldDirection.z,
  ])
}

function getFallbackDirection(item: ItemNode): [number, number, number] {
  const sceneAlignedDirection = getSceneAlignedFallbackDirection(item)
  if (sceneAlignedDirection) {
    return sceneAlignedDirection
  }

  if (getDiffuserSurface(item) === 'ceiling') {
    return [0, -1, 0]
  }

  const yaw = item.rotation[1] ?? 0
  return normalizeDirection([Math.sin(yaw), 0, -Math.cos(yaw)])
}

function getDiffuserDirection(item: ItemNode): [number, number, number] {
  const metadata = item.metadata as Record<string, unknown> | undefined
  const explicitDirection = metadata?.direction

  if (isVectorTuple(explicitDirection)) {
    return normalizeDirection(explicitDirection)
  }

  return getFallbackDirection(item)
}

function getDefaultAirflowRate(item: ItemNode, type: DiffuserType): number {
  const metadata = item.metadata as Record<string, unknown> | undefined
  const explicitRate = metadata?.airflowRate

  if (typeof explicitRate === 'number' && Number.isFinite(explicitRate) && explicitRate > 0) {
    return explicitRate
  }

  if (item.asset.id === 'linear-diffuser') {
    return 0.85
  }

  return type === 'supply' ? 0.65 : 0.55
}

function getDiffuserSpreadAngle(item: ItemNode): number {
  const metadata = item.metadata as Record<string, unknown> | undefined
  const explicitSpread = metadata?.spreadAngle

  if (
    typeof explicitSpread === 'number'
    && Number.isFinite(explicitSpread)
    && explicitSpread > 0
  ) {
    return explicitSpread
  }

  return item.asset.id === 'linear-diffuser' ? Math.PI / 10 : Math.PI / 7
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

  for (const node of Object.values(allNodes)) {
    if (!node || node.type !== 'item') continue

    const item = node as ItemNode
    if (!isHVACDiffuser(item)) continue

    const type = getDiffuserType(item)

    diffusers.push({
      id: item.id,
      type,
      position: getDiffuserWorldPosition(item),
      direction: getDiffuserDirection(item),
      airflowRate: getDefaultAirflowRate(item, type),
      spreadAngle: getDiffuserSpreadAngle(item),
      dimensions: getScaledDimensions(item),
      surface: getDiffuserSurface(item),
      itemId: item.asset.id,
      name: item.asset.name,
      metadata: {
        ...(item.metadata as Record<string, unknown> | undefined),
        assetTags: item.asset.tags ?? [],
      },
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

  if (!zoneId || !zonePolygon || zonePolygon.length === 0) {
    return allDiffusers
  }

  return allDiffusers.filter((diffuser) => {
    const [x, , z] = diffuser.position
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

  const supplyDiffuser = diffusers.find((d) => d.type === 'supply')
  if (supplyDiffuser) return supplyDiffuser

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

  const supplyDiffusers = diffusers.filter((d) => d.type === 'supply')
  const targetDiffusers = supplyDiffusers.length > 0 ? supplyDiffusers : diffusers

  const sum = targetDiffusers.reduce(
    (acc, diffuser) => {
      acc[0] += diffuser.position[0]
      acc[1] += diffuser.position[1]
      acc[2] += diffuser.position[2]
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
