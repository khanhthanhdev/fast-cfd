import type { LevelNode, ZoneNode } from '@pascal-app/core'

/**
 * Transient room geometry snapshot for GINOT inference
 *
 * V1 approach: derive geometry from current scene/zone without requiring
 * a persisted RoomMeshNode. Supports both real scene geometry and mock
 * box rooms for offline development.
 */
export interface RoomGeometrySnapshot {
  /** Room identifier (zone ID or mock room ID) */
  id: string

  /** Vertices of room boundary surfaces [x, y, z] */
  vertices: number[][]

  /** Face indices (triplets into vertices array) */
  faces: number[][]

  /** Bounding box */
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }

  /** Normalization center (mean of bounds) */
  center: [number, number, number]

  /** Normalization scale (max room dimension) */
  scale: number

  /** Room dimensions in world units */
  dimensions: {
    length: number
    width: number
    height: number
  }
}

/**
 * Compute normalization parameters from bounds
 *
 * GINOT requires all geometry points to be normalized using the same
 * center and scale parameters. This function computes those parameters
 * according to the Python reference:
 * - center = mean of mesh bounds
 * - scale = maximum room dimension
 */
export function computeNormalization(
  bounds: { min: number[]; max: number[] }
): { center: [number, number, number]; scale: number } {
  const center: [number, number, number] = [
    (bounds.min[0]! + bounds.max[0]!) / 2,
    (bounds.min[1]! + bounds.max[1]!) / 2,
    (bounds.min[2]! + bounds.max[2]!) / 2,
  ]

  const scale = Math.max(
    bounds.max[0]! - bounds.min[0]!,
    bounds.max[1]! - bounds.min[1]!,
    bounds.max[2]! - bounds.min[2]!
  )

  return { center, scale }
}

/**
 * Build room geometry snapshot from scene nodes
 *
 * For V1, this generates a simple box representation from the zone's
 * 2D polygon extruded to the ceiling height. Furniture/obstacles are
 * not included in V1 - only the room envelope.
 */
export function buildRoomGeometryFromScene(
  level: LevelNode,
  zone: ZoneNode,
  allNodes: Record<string, any>
): RoomGeometrySnapshot {
  const polygon = zone.polygon

  // Extract 2D bounds from polygon
  const xValues = polygon.map((p) => p[0])
  const zValues = polygon.map((p) => p[1])

  const minX = Math.min(...xValues)
  const maxX = Math.max(...xValues)
  const minZ = Math.min(...zValues)
  const maxZ = Math.max(...zValues)

  // Get ceiling height
  const meta = level.metadata as Record<string, unknown> | undefined
  const height = (typeof meta?.ceilingHeight === 'number' ? meta.ceilingHeight : 2.8) as number

  // Floor is at y=0, ceiling at y=height
  const bounds = {
    min: [minX, 0, minZ] as [number, number, number],
    max: [maxX, height, maxZ] as [number, number, number],
  }

  const { center, scale } = computeNormalization(bounds)

  // Generate box vertices (8 corners)
  const vertices: number[][] = [
    [minX, 0, minZ],     // 0: floor, min-x, min-z
    [maxX, 0, minZ],     // 1: floor, max-x, min-z
    [maxX, 0, maxZ],     // 2: floor, max-x, max-z
    [minX, 0, maxZ],     // 3: floor, min-x, max-z
    [minX, height, minZ], // 4: ceiling, min-x, min-z
    [maxX, height, minZ], // 5: ceiling, max-x, min-z
    [maxX, height, maxZ], // 6: ceiling, max-x, max-z
    [minX, height, maxZ], // 7: ceiling, min-x, max-z
  ]

  // Generate faces (12 triangles for 6 quads)
  const faces: number[][] = [
    // Floor
    [0, 2, 1],
    [0, 3, 2],
    // Ceiling
    [4, 5, 6],
    [4, 6, 7],
    // Wall -X
    [0, 4, 7],
    [0, 7, 3],
    // Wall +X
    [1, 6, 5],
    [1, 2, 6],
    // Wall -Z
    [0, 1, 5],
    [0, 5, 4],
    // Wall +Z
    [2, 3, 7],
    [2, 7, 6],
  ]

  return {
    id: zone.id,
    vertices,
    faces,
    bounds,
    center,
    scale,
    dimensions: {
      length: maxX - minX,
      width: maxZ - minZ,
      height,
    },
  }
}

/**
 * Generate a mock box room for offline development
 *
 * Creates a simple rectangular room with specified dimensions.
 * Useful for testing GINOT integration without the Python backend.
 */
export function createMockBoxRoom(
  roomId: string,
  length: number = 5,
  width: number = 4,
  height: number = 2.8
): RoomGeometrySnapshot {
  // Center the room at origin for simplicity
  const minX = -length / 2
  const maxX = length / 2
  const minZ = -width / 2
  const maxZ = width / 2

  const bounds = {
    min: [minX, 0, minZ] as [number, number, number],
    max: [maxX, height, maxZ] as [number, number, number],
  }

  const { center, scale } = computeNormalization(bounds)

  const vertices: number[][] = [
    [minX, 0, minZ],
    [maxX, 0, minZ],
    [maxX, 0, maxZ],
    [minX, 0, maxZ],
    [minX, height, minZ],
    [maxX, height, minZ],
    [maxX, height, maxZ],
    [minX, height, maxZ],
  ]

  const faces: number[][] = [
    // Floor
    [0, 2, 1],
    [0, 3, 2],
    // Ceiling
    [4, 5, 6],
    [4, 6, 7],
    // Wall -X
    [0, 4, 7],
    [0, 7, 3],
    // Wall +X
    [1, 6, 5],
    [1, 2, 6],
    // Wall -Z
    [0, 1, 5],
    [0, 5, 4],
    // Wall +Z
    [2, 3, 7],
    [2, 7, 6],
  ]

  return {
    id: roomId,
    vertices,
    faces,
    bounds,
    center,
    scale,
    dimensions: {
      length,
      width,
      height,
    },
  }
}

/**
 * Normalize points using precomputed center and scale
 *
 * All geometry points (boundary, query points, inlet/outlet centers)
 * must use the same normalization parameters.
 */
export function normalizePoints(
  points: number[][],
  center: [number, number, number],
  scale: number
): number[][] {
  return points.map((point) => [
    (point[0]! - center[0]) / scale,
    (point[1]! - center[1]) / scale,
    (point[2]! - center[2]) / scale,
  ])
}

/**
 * Denormalize points back to world coordinates
 */
export function denormalizePoints(
  points: number[][],
  center: [number, number, number],
  scale: number
): number[][] {
  return points.map((point) => [
    point[0]! * scale + center[0],
    point[1]! * scale + center[1],
    point[2]! * scale + center[2],
  ])
}
