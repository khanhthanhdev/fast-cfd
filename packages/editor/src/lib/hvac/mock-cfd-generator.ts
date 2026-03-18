import type {
  ParticleEmitter,
  ParticleAttractor,
  VelocityField3D,
  TemperatureField3D,
  PressureField3D,
} from '@pascal-app/core'
import type { DiffuserInfo } from './diffuser-detector'

interface Vector3 {
  x: number
  y: number
  z: number
}

interface Bounds3D {
  min: Vector3
  max: Vector3
}

interface MockCFDOptions {
  roomBounds: Bounds3D
  ambientTemperature: number // Kelvin
  supplyTemperature: number // Kelvin (typically 293K = 20°C)
  gridResolution: [number, number, number]
}

interface ParticleSystemData {
  emitters: ParticleEmitter[]
  attractors: ParticleAttractor[]
  velocityField: VelocityField3D
  temperatureField: TemperatureField3D
  pressureField?: PressureField3D
}

/**
 * Generate complete mock CFD data for a room
 */
export function generateMockCFDData(
  supplyDiffusers: DiffuserInfo[],
  returnDiffusers: DiffuserInfo[],
  options: MockCFDOptions,
): ParticleSystemData {
  const emitters = createEmittersFromDiffusers(supplyDiffusers, options.supplyTemperature)
  const attractors = createAttractorsFromDiffusers(returnDiffusers)

  return {
    emitters,
    attractors,
    velocityField: generateMockVelocityField(emitters, attractors, options),
    temperatureField: generateMockTemperatureField(emitters, options.ambientTemperature, options),
    pressureField: generateMockPressureField(emitters, attractors, options),
  }
}

/**
 * Create emitters from supply diffuser data
 */
export function createEmittersFromDiffusers(
  diffusers: DiffuserInfo[],
  supplyTemp: number,
): ParticleEmitter[] {
  return diffusers.map((diffuser) => ({
    id: diffuser.id,
    position: diffuser.position,
    direction: [0, -1, 0], // Default downward direction
    velocity: 0.5, // m/s
    temperature: supplyTemp,
    spreadAngle: Math.PI / 6, // 30 degrees
    emissionRate: 100, // particles per second
  }))
}

/**
 * Create attractors from return/exhaust diffuser data
 */
export function createAttractorsFromDiffusers(
  diffusers: DiffuserInfo[],
): ParticleAttractor[] {
  return diffusers.map((diffuser) => ({
    id: diffuser.id,
    position: diffuser.position,
    strength: 0.1,
    radius: 1.0,
    heatRemovalRate: 0.15,
    removalRadius: 0.5,
  }))
}

/**
 * Generate 3D velocity field from emitters and attractors
 */
export function generateMockVelocityField(
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  options: MockCFDOptions,
): VelocityField3D {
  const [nx, ny, nz] = options.gridResolution
  const { min, max } = options.roomBounds

  const cellSize = {
    x: (max.x - min.x) / nx,
    y: (max.y - min.y) / ny,
    z: (max.z - min.z) / nz,
  }

  const data: number[] = []

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = min.x + (ix + 0.5) * cellSize.x
        const y = min.y + (iy + 0.5) * cellSize.y
        const z = min.z + (iz + 0.5) * cellSize.z

        const velocity = calculateVelocityAt(
          { x, y, z },
          emitters,
          attractors,
          options.roomBounds,
        )

        // Store as [vx, vy, vz] per cell
        data.push(velocity.x, velocity.y, velocity.z)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    },
    data,
  }
}

/**
 * Calculate velocity at a point from all emitters and attractors
 */
function calculateVelocityAt(
  point: Vector3,
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  bounds: Bounds3D,
): Vector3 {
  let vx = 0
  let vy = 0
  let vz = 0

  // Add velocity from emitters (supply jets)
  for (const emitter of emitters) {
    const emitterVel = calculateSupplyJetVelocity(point, emitter)
    vx += emitterVel.x
    vy += emitterVel.y
    vz += emitterVel.z
  }

  // Add velocity from attractors (return flow)
  for (const attractor of attractors) {
    const attractorVel = calculateReturnFlowVelocity(point, attractor)
    vx += attractorVel.x
    vy += attractorVel.y
    vz += attractorVel.z
  }

  // Apply buoyancy (warm air rises, cool air sinks)
  vy += 0.01 // Slight upward buoyancy

  // Apply wall damping
  const damping = calculateWallDamping(point, bounds)
  vx *= damping
  vy *= damping
  vz *= damping

  return { x: vx, y: vy, z: vz }
}

/**
 * Calculate velocity from supply diffuser jet
 * Uses Gaussian velocity profile: v(x) = v₀ * exp(-x² / 2σ²) * direction
 */
function calculateSupplyJetVelocity(
  point: Vector3,
  emitter: ParticleEmitter,
): Vector3 {
  const [ex, ey, ez] = emitter.position
  const [dx, dy, dz] = emitter.direction

  const relPos = {
    x: point.x - ex,
    y: point.y - ey,
    z: point.z - ez,
  }

  const dist = Math.sqrt(relPos.x ** 2 + relPos.y ** 2 + relPos.z ** 2)
  if (dist < 0.01) return { x: 0, y: 0, z: 0 }

  // Distance along jet direction
  const alongJet = (relPos.x * dx + relPos.y * dy + relPos.z * dz) / dist

  // Perpendicular distance from jet centerline
  const perpDist = Math.sqrt(dist ** 2 - (alongJet * dist) ** 2)

  // Gaussian profile with spread
  const sigma = emitter.spreadAngle * dist + 0.1
  const gaussianFactor = Math.exp(-(perpDist ** 2) / (2 * sigma ** 2))

  // Velocity decay with distance
  const decayFactor = Math.max(0, 1 - dist / 10)

  const magnitude = emitter.velocity * gaussianFactor * decayFactor

  return {
    x: dx * magnitude,
    y: dy * magnitude,
    z: dz * magnitude,
  }
}

/**
 * Calculate velocity from return/exhaust attractor
 * Uses radial inflow: v(x) = -strength / |x|² * normalize(x - attractorPos)
 */
function calculateReturnFlowVelocity(
  point: Vector3,
  attractor: ParticleAttractor,
): Vector3 {
  const [ax, ay, az] = attractor.position

  const relPos = {
    x: point.x - ax,
    y: point.y - ay,
    z: point.z - az,
  }

  const distSq = relPos.x ** 2 + relPos.y ** 2 + relPos.z ** 2
  const dist = Math.sqrt(distSq)

  if (dist < attractor.radius) {
    // Inside capture radius - strong attraction
    return {
      x: -attractor.strength * relPos.x / distSq,
      y: -attractor.strength * relPos.y / distSq,
      z: -attractor.strength * relPos.z / distSq,
    }
  }

  // Outside capture radius - weaker attraction
  const falloff = Math.max(0, 1 - (dist - attractor.radius) / 5)
  return {
    x: -attractor.strength * falloff * relPos.x / distSq,
    y: -attractor.strength * falloff * relPos.y / distSq,
    z: -attractor.strength * falloff * relPos.z / distSq,
  }
}

/**
 * Calculate wall damping factor (reduces velocity near walls)
 */
function calculateWallDamping(point: Vector3, bounds: Bounds3D): number {
  const margin = 0.2 // meters
  let damping = 1

  if (point.x < bounds.min.x + margin) damping *= (point.x - bounds.min.x) / margin
  if (point.x > bounds.max.x - margin) damping *= (bounds.max.x - point.x) / margin
  if (point.y < bounds.min.y + margin) damping *= (point.y - bounds.min.y) / margin
  if (point.y > bounds.max.y - margin) damping *= (bounds.max.y - point.y) / margin
  if (point.z < bounds.min.z + margin) damping *= (point.z - bounds.min.z) / margin
  if (point.z > bounds.max.z - margin) damping *= (bounds.max.z - point.z) / margin

  return Math.max(0, Math.min(1, damping))
}

/**
 * Generate 3D temperature field
 */
export function generateMockTemperatureField(
  emitters: ParticleEmitter[],
  ambientTemp: number,
  options: MockCFDOptions,
): TemperatureField3D {
  const [nx, ny, nz] = options.gridResolution
  const { min, max } = options.roomBounds

  const cellSize = {
    x: (max.x - min.x) / nx,
    y: (max.y - min.y) / ny,
    z: (max.z - min.z) / nz,
  }

  const data: number[] = []

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = min.x + (ix + 0.5) * cellSize.x
        const y = min.y + (iy + 0.5) * cellSize.y
        const z = min.z + (iz + 0.5) * cellSize.z

        const temp = calculateTemperatureAt(
          { x, y, z },
          emitters,
          ambientTemp,
          options.roomBounds,
        )

        data.push(temp)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    },
    data,
  }
}

/**
 * Calculate temperature at a point
 * T(x) = T_supply + (T_ambient - T_supply) * (1 - exp(-x / decayLength))
 */
function calculateTemperatureAt(
  point: Vector3,
  emitters: ParticleEmitter[],
  ambientTemp: number,
  bounds: Bounds3D,
): number {
  if (emitters.length === 0) return ambientTemp

  let totalTemp = 0
  let totalWeight = 0

  for (const emitter of emitters) {
    const [ex, ey, ez] = emitter.position
    const dist = Math.sqrt(
      (point.x - ex) ** 2 + (point.y - ey) ** 2 + (point.z - ez) ** 2,
    )

    // Temperature decay with distance
    const decayLength = 3 // meters
    const influence = Math.exp(-dist / decayLength)

    totalTemp += (emitter.temperature + (ambientTemp - emitter.temperature) * (1 - Math.exp(-dist / decayLength))) * influence
    totalWeight += influence
  }

  if (totalWeight === 0) return ambientTemp

  let temperature = totalTemp / totalWeight

  // Add stratification (temperature increases with height)
  const heightFactor = (point.y - bounds.min.y) / (bounds.max.y - bounds.min.y)
  temperature += heightFactor * 2 // 2K stratification from floor to ceiling

  return temperature
}

/**
 * Generate mock pressure field (optional)
 */
export function generateMockPressureField(
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  options: MockCFDOptions,
): PressureField3D {
  const [nx, ny, nz] = options.gridResolution
  const { min, max } = options.roomBounds

  const cellSize = {
    x: (max.x - min.x) / nx,
    y: (max.y - min.y) / ny,
    z: (max.z - min.z) / nz,
  }

  const data: number[] = []

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const x = min.x + (ix + 0.5) * cellSize.x
        const y = min.y + (iy + 0.5) * cellSize.y
        const z = min.z + (iz + 0.5) * cellSize.z

        // Simple pressure model: high at emitters, low at attractors
        let pressure = 0

        for (const emitter of emitters) {
          const [ex, ey, ez] = emitter.position
          const dist = Math.sqrt(
            (x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2,
          )
          pressure += Math.exp(-dist / 2)
        }

        for (const attractor of attractors) {
          const [ax, ay, az] = attractor.position
          const dist = Math.sqrt(
            (x - ax) ** 2 + (y - ay) ** 2 + (z - az) ** 2,
          )
          pressure -= Math.exp(-dist / 2)
        }

        data.push(pressure)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [min.x, min.y, min.z],
      max: [max.x, max.y, max.z],
    },
    data,
  }
}
