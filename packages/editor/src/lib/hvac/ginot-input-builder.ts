import type { RoomGeometrySnapshot } from './room-geometry-snapshot'
import { normalizePoints, normalizePoint, normalizeLoadVector } from './normalization'
import { sampleBoundary, sampleInterior } from './point-sampler'
import type { DiffuserInfo } from './diffuser-detector'

/**
 * GINOT input tensors ready for API transmission
 *
 * All tensors use Float32Array for efficient binary transfer.
 * Shapes match Python model expectations:
 * - load: [1, 9] -> flattened to Float32Array(9)
 * - pc: [1, 100000, 3] -> flattened to Float32Array(300000)
 * - xyt: [1, N, 3] -> flattened to Float32Array(N*3)
 */
export interface GinotInputTensors {
  /** Normalized load vector [inletCenter(3), outletCenter(3), inletVelocity(3)] */
  load: Float32Array

  /** Normalized boundary points [100000, 3] flattened */
  pc: Float32Array

  /** Normalized interior query points [N, 3] flattened */
  xyt: Float32Array

  /** Metadata for debugging and denormalization */
  metadata: {
    boundaryCount: number
    interiorCount: number
    center: [number, number, number]
    scale: number
  }
}

/**
 * Options for GINOT input building
 */
export interface GinotInputOptions {
  /** Target boundary point count (default: 100,000) */
  boundaryCount?: number

  /** Target interior point count (default: 50,000) */
  interiorCount?: number

  /** Skip sampling, use provided points */
  existingBoundaryPoints?: number[][]
  existingInteriorPoints?: number[][]
}

/**
 * Build GINOT input tensors from room geometry and diffuser data
 *
 * This is the main entry point for preparing GINOT inference inputs.
 * It handles:
 * 1. Boundary surface sampling (pc)
 * 2. Interior volume sampling (xyt)
 * 3. Load vector construction from diffuser data
 * 4. Normalization of all geometry points
 *
 * @param geometry - Room geometry snapshot with bounds, center, scale
 * @param diffusers - Supply and return diffuser information
 * @param options - Sampling options
 * @returns GINOT input tensors ready for API transmission
 */
export function buildGinotInput(
  geometry: RoomGeometrySnapshot,
  diffusers: {
    supplyDiffusers: DiffuserInfo[]
    returnDiffusers: DiffuserInfo[]
  },
  options?: GinotInputOptions
): GinotInputTensors {
  const { center, scale } = geometry

  // Sample boundary points (pc)
  const boundaryPoints = options?.existingBoundaryPoints ??
    sampleBoundary(geometry, options?.boundaryCount ?? 100000)

  // Sample interior points (xyt)
  const interiorPoints = options?.existingInteriorPoints ??
    sampleInterior(geometry, options?.interiorCount ?? 50000)

  // Normalize geometry points
  const normalizedBoundary = normalizePoints(boundaryPoints, center, scale)
  const normalizedInterior = normalizePoints(interiorPoints, center, scale)

  // Build load vector from diffuser data
  const load = buildLoadVector(diffusers, center, scale)

  // Flatten to 1D Float32Arrays for efficient transfer
  const pc = flattenPoints(normalizedBoundary)
  const xyt = flattenPoints(normalizedInterior)

  return {
    load,
    pc,
    xyt,
    metadata: {
      boundaryCount: boundaryPoints.length,
      interiorCount: interiorPoints.length,
      center,
      scale,
    },
  }
}

/**
 * Build the 9-element load vector from diffuser data
 *
 * Load vector layout:
 * - [0..2]: normalized inlet center [x, y, z]
 * - [3..5]: normalized outlet center [x, y, z]
 * - [6..8]: inlet velocity vector [u, v, w] in m/s (NOT normalized)
 *
 * Uses primary supply diffuser for inlet, primary return for outlet.
 * Falls back to geometry center if diffusers missing.
 */
function buildLoadVector(
  diffusers: {
    supplyDiffusers: DiffuserInfo[]
    returnDiffusers: DiffuserInfo[]
  },
  center: [number, number, number],
  scale: number
): Float32Array {
  // Get primary supply (inlet) diffuser
  const primarySupply = diffusers.supplyDiffusers[0]
  const primaryReturn = diffusers.returnDiffusers[0]

  // Inlet center (from supply diffuser position)
  const inletCenter: [number, number, number] = primarySupply
    ? [...primarySupply.position] as [number, number, number]
    : [center[0], center[1] + scale / 4, center[2]] // Default: upper portion of room

  // Outlet center (from return diffuser position)
  const outletCenter: [number, number, number] = primaryReturn
    ? [...primaryReturn.position] as [number, number, number]
    : [center[0], center[1] + scale / 4, center[2] + scale / 4] // Default: opposite corner

  // Inlet velocity vector
  // For V1: derive from diffuser orientation or use default downward flow
  const inletVelocity: [number, number, number] = primarySupply
    ? getDiffuserVelocity(primarySupply)
    : [0, -0.5, 0] // Default: gentle downward flow

  return normalizeLoadVector(inletCenter, outletCenter, inletVelocity, center, scale)
}

/**
 * Extract velocity vector from diffuser
 *
 * Uses diffuser orientation and airflow metadata if available.
 * Falls back to reasonable defaults.
 */
function getDiffuserVelocity(diffuser: DiffuserInfo): [number, number, number] {
  // Check if diffuser has orientation/velocity metadata
  const metadata = diffuser.metadata

  // Try to get airflow rate (m/s) from metadata
  const airflowRate = typeof metadata?.airflowRate === 'number'
    ? metadata.airflowRate
    : 0.5 // Default 0.5 m/s

  // Try to get orientation/direction from metadata
  const direction = metadata?.direction as [number, number, number] | undefined

  if (direction) {
    // Normalize direction and scale by velocity
    const mag = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2)
    if (mag > 0) {
      return [
        (direction[0] / mag) * airflowRate,
        (direction[1] / mag) * airflowRate,
        (direction[2] / mag) * airflowRate,
      ]
    }
  }

  // Default: downward flow (negative Y in our coordinate system)
  return [0, -airflowRate, 0]
}

/**
 * Flatten array of 3D points to Float32Array
 */
function flattenPoints(points: number[][]): Float32Array {
  const flat = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!
    flat[i * 3] = point[0]!
    flat[i * 3 + 1] = point[1]!
    flat[i * 3 + 2] = point[2]!
  }
  return flat
}

/**
 * Validate GINOT input tensors
 *
 * Checks:
 * - Load vector length is 9
 * - PC count matches expected boundary count
 * - XYT count is reasonable (> 0)
 * - No NaN or Infinity values
 */
export function validateGinotInput(tensors: GinotInputTensors): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  // Validate load vector
  if (tensors.load.length !== 9) {
    errors.push(`Load vector length: expected 9, got ${tensors.load.length}`)
  }

  // Validate PC (boundary points)
  if (tensors.pc.length % 3 !== 0) {
    errors.push(`PC length (${tensors.pc.length}) not divisible by 3`)
  }

  const boundaryCount = tensors.pc.length / 3
  if (boundaryCount < 1000) {
    errors.push(`Too few boundary points: ${boundaryCount} (expected ~100000)`)
  }

  // Validate XYT (interior points)
  if (tensors.xyt.length % 3 !== 0) {
    errors.push(`XYT length (${tensors.xyt.length}) not divisible by 3`)
  }

  const interiorCount = tensors.xyt.length / 3
  if (interiorCount === 0) {
    errors.push('No interior query points')
  }

  // Check for NaN/Infinity
  for (let i = 0; i < tensors.load.length; i++) {
    if (!Number.isFinite(tensors.load[i])) {
      errors.push(`Load[${i}] = ${tensors.load[i]} (not finite)`)
    }
  }

  // Spot check PC and XYT for NaN
  for (let i = 0; i < Math.min(100, tensors.pc.length); i++) {
    if (!Number.isFinite(tensors.pc[i])) {
      errors.push(`PC[${i}] contains non-finite value`)
      break
    }
  }

  for (let i = 0; i < Math.min(100, tensors.xyt.length); i++) {
    if (!Number.isFinite(tensors.xyt[i])) {
      errors.push(`XYT[${i}] contains non-finite value`)
      break
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Build GINOT input for mock/testing scenarios
 *
 * Creates deterministic mock data for development without Python backend.
 */
export function buildMockGinotInput(
  geometry: RoomGeometrySnapshot,
  options?: GinotInputOptions
): GinotInputTensors {
  const { center, scale } = geometry

  const boundaryCount = options?.boundaryCount ?? 100000
  const interiorCount = options?.interiorCount ?? 50000

  // Generate deterministic mock boundary points (box surface)
  const mockBoundary = generateMockBoundary(geometry, boundaryCount)

  // Generate deterministic mock interior points (grid inside room)
  const mockInterior = generateMockInterior(geometry, interiorCount)

  // Normalize
  const normalizedBoundary = normalizePoints(mockBoundary, center, scale)
  const normalizedInterior = normalizePoints(mockInterior, center, scale)

  // Mock load vector (centered inlet/outlet with gentle flow)
  const mockLoad = new Float32Array(9)
  mockLoad[0] = 0 // inlet X (center)
  mockLoad[1] = 0.25 // inlet Y (upper)
  mockLoad[2] = 0 // inlet Z (center)
  mockLoad[3] = 0 // outlet X
  mockLoad[4] = 0.25 // outlet Y
  mockLoad[5] = 0.25 // outlet Z (corner)
  mockLoad[6] = 0 // velocity X
  mockLoad[7] = -0.5 // velocity Y (downward)
  mockLoad[8] = 0 // velocity Z

  return {
    load: mockLoad,
    pc: flattenPoints(normalizedBoundary),
    xyt: flattenPoints(normalizedInterior),
    metadata: {
      boundaryCount: mockBoundary.length,
      interiorCount: mockInterior.length,
      center,
      scale,
    },
  }
}

/**
 * Generate deterministic mock boundary points for testing
 */
function generateMockBoundary(
  geometry: RoomGeometrySnapshot,
  count: number
): number[][] {
  const points: number[][] = []
  const { vertices, faces } = geometry

  // Distribute points across faces
  const pointsPerFace = Math.floor(count / faces.length)

  for (const face of faces) {
    const v0 = vertices[face[0]!]!
    const v1 = vertices[face[1]!]!
    const v2 = vertices[face[2]!]!

    for (let i = 0; i < pointsPerFace; i++) {
      const u = Math.random()
      const v = Math.random()

      if (u + v > 1) {
        // Reflect to stay in triangle
        points.push([
          v0[0]! + (1 - u) * (v1[0]! - v0[0]!) + (1 - v) * (v2[0]! - v0[0]!),
          v0[1]! + (1 - u) * (v1[1]! - v0[1]!) + (1 - v) * (v2[1]! - v0[1]!),
          v0[2]! + (1 - u) * (v1[2]! - v0[2]!) + (1 - v) * (v2[2]! - v0[2]!),
        ])
      } else {
        points.push([
          v0[0]! + u * (v1[0]! - v0[0]!) + v * (v2[0]! - v0[0]!),
          v0[1]! + u * (v1[1]! - v0[1]!) + v * (v2[1]! - v0[1]!),
          v0[2]! + u * (v1[2]! - v0[2]!) + v * (v2[2]! - v0[2]!),
        ])
      }
    }
  }

  // Pad or trim to exact count
  while (points.length < count) {
    const randomPoint = points[Math.floor(Math.random() * points.length)]
    if (randomPoint) {
      points.push([...randomPoint])
    }
  }
  return points.slice(0, count)
}

/**
 * Generate deterministic mock interior points for testing
 */
function generateMockInterior(
  geometry: RoomGeometrySnapshot,
  count: number
): number[][] {
  const points: number[][] = []
  const { bounds } = geometry
  const [minX, minY, minZ] = bounds.min
  const [maxX, maxY, maxZ] = bounds.max

  // Simple grid sampling
  const perSide = Math.ceil(Math.cbrt(count))
  const stepX = (maxX - minX) / perSide
  const stepY = (maxY - minY) / perSide
  const stepZ = (maxZ - minZ) / perSide

  for (let ix = 0; ix < perSide && points.length < count; ix++) {
    for (let iy = 0; iy < perSide && points.length < count; iy++) {
      for (let iz = 0; iz < perSide && points.length < count; iz++) {
        // Add small random offset for realism
        points.push([
          minX + (ix + 0.5) * stepX + (Math.random() - 0.5) * stepX * 0.1,
          minY + (iy + 0.5) * stepY + (Math.random() - 0.5) * stepY * 0.1,
          minZ + (iz + 0.5) * stepZ + (Math.random() - 0.5) * stepZ * 0.1,
        ])
      }
    }
  }

  return points.slice(0, count)
}
