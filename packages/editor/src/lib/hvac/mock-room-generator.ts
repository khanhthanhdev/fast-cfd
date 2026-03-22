import { createMockBoxRoom, type RoomGeometrySnapshot } from './room-geometry-snapshot'
import {
  DEFAULT_GINOT_BOUNDARY_POINT_COUNT,
  DEFAULT_GINOT_INTERIOR_POINT_COUNT,
  sampleBoundary,
  sampleInterior,
} from './point-sampler'
import { normalizePoints, normalizeLoadVector } from './normalization'
import type { GinotInferenceResponse } from '../hvac/ai-inference-client'

/**
 * Predefined test room configurations
 */
export interface TestRoomConfig {
  id: string
  name: string
  length: number // meters
  width: number // meters
  height: number // meters
  supplyDiffusers: number
  returnDiffusers: number
  description: string
}

/**
 * Test room configurations from plan
 */
export const TEST_ROOMS: Record<string, TestRoomConfig> = {
  'simple-office': {
    id: 'simple-office',
    name: 'Simple Office',
    length: 5,
    width: 4,
    height: 2.8,
    supplyDiffusers: 1,
    returnDiffusers: 1,
    description: '5×4×2.8m, 1 supply + 1 return',
  },
  'conference-room': {
    id: 'conference-room',
    name: 'Conference Room',
    length: 8,
    width: 6,
    height: 3,
    supplyDiffusers: 4,
    returnDiffusers: 2,
    description: '8×6×3m, 4 supply + 2 return',
  },
  'bedroom': {
    id: 'bedroom',
    name: 'Bedroom',
    length: 4,
    width: 3,
    height: 2.5,
    supplyDiffusers: 1,
    returnDiffusers: 1,
    description: '4×3×2.5m, 1 supply + 1 return',
  },
  'living-room': {
    id: 'living-room',
    name: 'Living Room',
    length: 6,
    width: 5,
    height: 2.8,
    supplyDiffusers: 2,
    returnDiffusers: 1,
    description: '6×5×2.8m, 2 supply + 1 return',
  },
}

/**
 * Generate deterministic mock room geometry
 */
export function generateMockRoomGeometry(
  roomId: string
): RoomGeometrySnapshot | null {
  const config = TEST_ROOMS[roomId]
  if (!config) return null

  return createMockBoxRoom(
    `mock-${roomId}`,
    config.length,
    config.width,
    config.height
  )
}

/**
 * Generate all mock room geometries
 */
export function generateAllMockRooms(): Record<string, RoomGeometrySnapshot> {
  const rooms: Record<string, RoomGeometrySnapshot> = {}

  for (const roomId of Object.keys(TEST_ROOMS)) {
    const geometry = generateMockRoomGeometry(roomId)
    if (geometry) {
      rooms[roomId] = geometry
    }
  }

  return rooms
}

/**
 * Generate mock GINOT response for a room
 *
 * Creates deterministic airflow field based on room geometry
 * and diffuser configuration.
 */
export function generateMockGinotResponse(
  geometry: RoomGeometrySnapshot,
  options?: {
    boundaryCount?: number
    interiorCount?: number
  }
): {
  load: Float32Array
  pc: Float32Array
  xyt: Float32Array
  response: GinotInferenceResponse
} {
  const boundaryCount = options?.boundaryCount ?? DEFAULT_GINOT_BOUNDARY_POINT_COUNT
  const interiorCount = options?.interiorCount ?? DEFAULT_GINOT_INTERIOR_POINT_COUNT

  const { center, scale, bounds } = geometry

  // Sample boundary and interior points
  const boundaryPoints = sampleBoundary(geometry, boundaryCount)
  const interiorPoints = sampleInterior(geometry, interiorCount)

  // Normalize points
  const normalizedBoundary = normalizePoints(boundaryPoints, center, scale)
  const normalizedInterior = normalizePoints(interiorPoints, center, scale)

  // Create mock load vector
  // Inlet: center of room, upper portion
  // Outlet: corner of room
  const inletCenter: [number, number, number] = [
    center[0],
    center[1] + scale * 0.25,
    center[2],
  ]
  const outletCenter: [number, number, number] = [
    bounds.max[0],
    center[1] + scale * 0.25,
    bounds.max[2],
  ]
  const inletVelocity: [number, number, number] = [0, -0.5, 0]

  const load = normalizeLoadVector(
    inletCenter,
    outletCenter,
    inletVelocity,
    center,
    scale
  )

  // Flatten points
  const pc = new Float32Array(normalizedBoundary.flat())
  const xyt = new Float32Array(normalizedInterior.flat())

  // Generate mock GINOT predictions
  const positions: number[][] = []
  const velocities: number[][] = []
  const pressure: number[] = []
  const speed: number[] = []

  // Normalize inlet/outlet for prediction calculations
  const normInletCenter = [
    (inletCenter[0] - center[0]) / scale,
    (inletCenter[1] - center[1]) / scale,
    (inletCenter[2] - center[2]) / scale,
  ]
  const normOutletCenter = [
    (outletCenter[0] - center[0]) / scale,
    (outletCenter[1] - center[1]) / scale,
    (outletCenter[2] - center[2]) / scale,
  ]

  for (let i = 0; i < interiorPoints.length; i++) {
    const pt = normalizedInterior[i]!
    positions.push([pt[0]!, pt[1]!, pt[2]!])

    // Calculate distance from inlet
    const dx = pt[0]! - normInletCenter[0]!
    const dy = pt[1]! - normInletCenter[1]!
    const dz = pt[2]! - normInletCenter[2]!
    const distFromInlet = Math.sqrt(dx * dx + dy * dy + dz * dz)

    // Velocity decays with distance, with direction toward outlet
    const decayFactor = Math.exp(-distFromInlet * 2)
    const baseVel = 0.5 // Match inlet velocity magnitude

    // Direction toward outlet
    const outletDx = normOutletCenter[0]! - pt[0]!
    const outletDy = normOutletCenter[1]! - pt[1]!
    const outletDz = normOutletCenter[2]! - pt[2]!
    const distToOutlet = Math.sqrt(outletDx * outletDx + outletDy * outletDy + outletDz * outletDz)

    const outletInfluence = 1 - Math.exp(-distToOutlet * 0.5)

    const vx = (inletVelocity[0] / scale) * decayFactor + (outletDx / (distToOutlet + 0.1)) * 0.1 * outletInfluence
    const vy = (inletVelocity[1] / scale) * decayFactor + (outletDy / (distToOutlet + 0.1)) * 0.1 * outletInfluence
    const vz = (inletVelocity[2] / scale) * decayFactor + (outletDz / (distToOutlet + 0.1)) * 0.1 * outletInfluence

    velocities.push([vx, vy, vz])

    // Speed magnitude
    const spd = Math.sqrt(vx * vx + vy * vy + vz * vz)
    speed.push(parseFloat(spd.toFixed(4)))

    // Pressure (higher near inlet, lower near outlet)
    const distFromOutlet = Math.sqrt(
      (pt[0]! - normOutletCenter[0]!) ** 2 +
        (pt[1]! - normOutletCenter[1]!) ** 2 +
        (pt[2]! - normOutletCenter[2]!) ** 2
    )
    const inletPressure = 100
    const outletPressure = 0
    const totalDist = distFromInlet + distFromOutlet
    const p =
      totalDist > 0
        ? inletPressure * (distFromOutlet / totalDist) +
          outletPressure * (distFromInlet / totalDist)
        : (inletPressure + outletPressure) / 2
    pressure.push(parseFloat(p.toFixed(2)))
  }

  return {
    load,
    pc,
    xyt,
    response: {
      positions,
      velocities,
      pressure,
      speed,
      bounds: {
        min: bounds.min,
        max: bounds.max,
      },
      metadata: {
        inletCenter: Array.from(inletCenter),
        outletCenter: Array.from(outletCenter),
        inletVelocity: Array.from(inletVelocity),
      },
      inferenceId: `mock-${crypto.randomUUID()}`,
      timestamp: Date.now(),
    },
  }
}

/**
 * Generate golden case fixture
 *
 * Creates a deterministic, reproducible test case that can be
 * validated against Python reference implementation.
 */
export function generateGoldenCaseFixture(): {
  geometry: RoomGeometrySnapshot
  load: Float32Array
  pc: Float32Array
  xyt: Float32Array
  response: GinotInferenceResponse
  checksum: string
} {
  // Use simple office as golden case
  const geometry = generateMockRoomGeometry('simple-office')!

  // Use fixed seed for reproducibility (simulated)
  Math.random = (() => {
    let seed = 12345
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
  })()

  const result = generateMockGinotResponse(geometry, {
    boundaryCount: 1000, // Smaller for fixture size
    interiorCount: 500,
  })

  // Generate checksum for validation
  const checksumData = {
    loadSum: Array.from(result.load).reduce((a, b) => a + b, 0),
    pcSum: result.response.positions.reduce(
      (a, pt) => a + pt[0]! + pt[1]! + pt[2]!,
      0
    ),
    speedSum: result.response.speed.reduce((a, b) => a + b, 0),
    pressureSum: result.response.pressure.reduce((a, b) => a + b, 0),
  }

  const checksum = btoa(JSON.stringify(checksumData))

  return {
    geometry,
    ...result,
    checksum,
  }
}

/**
 * Generate all golden case fixtures
 */
export function generateAllGoldenFixtures(): Record<
  string,
  ReturnType<typeof generateGoldenCaseFixture>
> {
  const fixtures: Record<string, ReturnType<typeof generateGoldenCaseFixture>> =
    {}

  for (const roomId of Object.keys(TEST_ROOMS)) {
    fixtures[roomId] = generateGoldenCaseFixture()
  }

  return fixtures
}
