import type { RoomGeometrySnapshot } from './room-geometry-snapshot'

export const DEFAULT_GINOT_BOUNDARY_POINT_COUNT = 5000
export const DEFAULT_GINOT_INTERIOR_POINT_COUNT = 5000

/**
 * Sample points from a triangle surface
 * Uses uniform random sampling across the triangle area
 */
function sampleTriangle(
  v0: number[],
  v1: number[],
  v2: number[],
  count: number
): number[][] {
  const points: number[][] = []

  for (let i = 0; i < count; i++) {
    // Uniform sampling on triangle using barycentric coordinates
    const r1 = Math.random()
    const r2 = Math.random()

    // Ensure points are uniformly distributed
    const sqrtR1 = Math.sqrt(r1)
    const u = 1 - sqrtR1
    const v = sqrtR1 * (1 - r2)
    const w = sqrtR1 * r2

    const point = [
      u * v0[0]! + v * v1[0]! + w * v2[0]!,
      u * v0[1]! + v * v1[1]! + w * v2[1]!,
      u * v0[2]! + v * v1[2]! + w * v2[2]!,
    ]

    points.push(point)
  }

  return points
}

/**
 * Calculate triangle area
 */
function triangleArea(v0: number[], v1: number[], v2: number[]): number {
  const ax = v1[0]! - v0[0]!
  const ay = v1[1]! - v0[1]!
  const az = v1[2]! - v0[2]!
  const bx = v2[0]! - v0[0]!
  const by = v2[1]! - v0[1]!
  const bz = v2[2]! - v0[2]!

  // Cross product magnitude
  const cx = ay * bz - az * by
  const cy = az * bx - ax * bz
  const cz = ax * by - ay * bx

  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz)
}

/**
 * Sample points from boundary surfaces
 *
 * Samples points from the room boundary mesh
 * Points are distributed proportionally to triangle area for uniform coverage
 *
 * @param geometry - Room geometry snapshot
 * @param targetCount - Target number of boundary points (default: 5,000)
 * @returns Array of [x, y, z] points
 */
export function sampleBoundary(
  geometry: RoomGeometrySnapshot,
  targetCount: number = DEFAULT_GINOT_BOUNDARY_POINT_COUNT
): number[][] {
  const { vertices, faces } = geometry

  // Calculate area of each triangle
  const triangleAreas: number[] = []
  let totalArea = 0

  for (const face of faces) {
    const v0 = vertices[face[0]!]!
    const v1 = vertices[face[1]!]!
    const v2 = vertices[face[2]!]!
    const area = triangleArea(v0, v1, v2)
    triangleAreas.push(area)
    totalArea += area
  }

  // Distribute points proportionally to area
  const pointsPerTriangle = faces.map((_, i) => {
    const proportion = triangleAreas[i]! / totalArea
    return Math.max(1, Math.round(proportion * targetCount))
  })

  // Adjust to hit exact target count
  let totalPoints = pointsPerTriangle.reduce((a, b) => a + b, 0)
  const adjustments = targetCount - totalPoints

  // Distribute remaining points to largest triangles
  if (adjustments > 0) {
    const sortedByArea = triangleAreas
      .map((area, i) => ({ area, index: i }))
      .sort((a, b) => b.area - a.area)

    for (let i = 0; i < adjustments && i < sortedByArea.length; i++) {
      pointsPerTriangle[sortedByArea[i]!.index] = pointsPerTriangle[sortedByArea[i]!.index]! + 1
    }
  } else if (adjustments < 0) {
    const sortedByArea = triangleAreas
      .map((area, i) => ({ area, index: i }))
      .sort((a, b) => b.area - a.area)

    for (let i = 0; i < Math.abs(adjustments) && i < sortedByArea.length; i++) {
      pointsPerTriangle[sortedByArea[i]!.index] = Math.max(
        1,
        pointsPerTriangle[sortedByArea[i]!.index]! - 1
      )
    }
  }

  // Sample points from each triangle
  const allPoints: number[][] = []

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]!
    const count = pointsPerTriangle[i]!
    const v0 = vertices[face[0]!]!
    const v1 = vertices[face[1]!]!
    const v2 = vertices[face[2]!]!

    const points = sampleTriangle(v0, v1, v2, count)
    allPoints.push(...points)
  }

  // Shuffle points for better distribution appearance
  shuffleArray(allPoints)

  // Trim or pad to exact count
  while (allPoints.length > targetCount) {
    allPoints.pop()
  }
  while (allPoints.length < targetCount) {
    // Pad with duplicates if needed (shouldn't happen with proper distribution)
    allPoints.push(allPoints[Math.floor(Math.random() * allPoints.length)]!)
  }

  return allPoints
}

/**
 * Test if a point is inside the room mesh
 * Uses ray casting algorithm
 */
function pointInMesh(
  point: number[],
  vertices: number[][],
  faces: number[][]
): boolean {
  // Ray cast in +Y direction
  let intersections = 0

  for (const face of faces) {
    const v0 = vertices[face[0]!]!
    const v1 = vertices[face[1]!]!
    const v2 = vertices[face[2]!]!

    // Check if ray intersects triangle
    if (rayIntersectsTriangle(point, v0, v1, v2)) {
      intersections++
    }
  }

  // Odd number of intersections = inside
  return intersections % 2 === 1
}

/**
 * Check if a ray from point in +Y direction intersects a triangle
 */
function rayIntersectsTriangle(
  point: number[],
  v0: number[],
  v1: number[],
  v2: number[]
): boolean {
  const px = point[0]!
  const py = point[1]!
  const pz = point[2]!

  // Edge vectors
  const edge1 = [v1[0]! - v0[0]!, v1[1]! - v0[1]!, v1[2]! - v0[2]!]
  const edge2 = [v2[0]! - v0[0]!, v2[1]! - v0[1]!, v2[2]! - v0[2]!]

  // Ray direction (0, 1, 0)
  const rayDir = [0, 1, 0]

  // Begin calculating determinant
  const h = [
    rayDir[1]! * edge2[2]! - rayDir[2]! * edge2[1]!,
    rayDir[2]! * edge2[0]! - rayDir[0]! * edge2[2]!,
    rayDir[0]! * edge2[1]! - rayDir[1]! * edge2[0]!,
  ]

  const a =
    edge1[0]! * h[0]! + edge1[1]! * h[1]! + edge1[2]! * h[2]!

  if (Math.abs(a) < 1e-8) return false

  const f = 1 / a

  const s = [px - v0[0]!, py - v0[1]!, pz - v0[2]!]
  const u = f * (s[0]! * h[0]! + s[1]! * h[1]! + s[2]! * h[2]!)

  if (u < 0 || u > 1) return false

  const q = [
    s[1]! * edge1[2]! - s[2]! * edge1[1]!,
    s[2]! * edge1[0]! - s[0]! * edge1[2]!,
    s[0]! * edge1[1]! - s[1]! * edge1[0]!,
  ]

  const v = f * (rayDir[0]! * q[0]! + rayDir[1]! * q[1]! + rayDir[2]! * q[2]!)

  if (v < 0 || u + v > 1) return false

  const t = f * (edge1[0]! * q[0]! + edge1[1]! * q[1]! + edge1[2]! * q[2]!)

  // Intersection occurs if t > 0 (ray hits triangle in forward direction)
  return t > 0
}

/**
 * Sample points from interior volume
 *
 * Samples points from the room interior volume
 * Uses rejection sampling: generate points in bounding box, filter by mesh.contains()
 * Resamples until target count is reached
 *
 * @param geometry - Room geometry snapshot
 * @param targetCount - Target number of interior points (default: 5,000)
 * @param maxAttempts - Maximum sampling attempts before giving up
 * @returns Array of [x, y, z] points
 */
export function sampleInterior(
  geometry: RoomGeometrySnapshot,
  targetCount: number = DEFAULT_GINOT_INTERIOR_POINT_COUNT,
  maxAttempts: number = 10
): number[][] {
  const { vertices, faces, bounds } = geometry
  const [minX, minY, minZ] = bounds.min
  const [maxX, maxY, maxZ] = bounds.max

  const allPoints: number[][] = []
  let attempts = 0

  while (allPoints.length < targetCount && attempts < maxAttempts) {
    attempts++

    // Calculate how many more points we need
    const remaining = targetCount - allPoints.length

    // Estimate acceptance rate (interior volume / bounds volume)
    // For a simple room, assume ~80% acceptance rate
    const estimatedAcceptanceRate = 0.8
    const pointsToGenerate = Math.ceil(remaining / estimatedAcceptanceRate)

    // Generate random points in bounding box
    const candidatePoints: number[][] = []
    for (let i = 0; i < pointsToGenerate; i++) {
      candidatePoints.push([
        minX + Math.random() * (maxX - minX),
        minY + Math.random() * (maxY - minY),
        minZ + Math.random() * (maxZ - minZ),
      ])
    }

    // Filter to keep only interior points
    for (const point of candidatePoints) {
      if (pointInMesh(point, vertices, faces)) {
        allPoints.push(point)
      }
    }
  }

  // Shuffle for better distribution
  shuffleArray(allPoints)

  // Trim to exact count
  return allPoints.slice(0, targetCount)
}

/**
 * Fisher-Yates shuffle for arrays
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[array[i], array[j]] = [array[j]!, array[i]!]
  }
}

/**
 * Generate both boundary and interior samples in one call
 *
 * Convenience function that returns both sample sets with shared
 * geometry reference for consistent normalization.
 */
export function generateAllSamples(
  geometry: RoomGeometrySnapshot,
  options?: {
    boundaryCount?: number
    interiorCount?: number
  }
): {
  boundaryPoints: number[][]
  interiorPoints: number[][]
  stats: {
    actualBoundaryCount: number
    actualInteriorCount: number
  }
} {
  const boundaryCount = options?.boundaryCount ?? DEFAULT_GINOT_BOUNDARY_POINT_COUNT
  const interiorCount = options?.interiorCount ?? DEFAULT_GINOT_INTERIOR_POINT_COUNT

  const boundaryPoints = sampleBoundary(geometry, boundaryCount)
  const interiorPoints = sampleInterior(geometry, interiorCount)

  return {
    boundaryPoints,
    interiorPoints,
    stats: {
      actualBoundaryCount: boundaryPoints.length,
      actualInteriorCount: interiorPoints.length,
    },
  }
}
