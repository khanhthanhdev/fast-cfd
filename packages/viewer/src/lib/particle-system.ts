import type {
  ParticleEmitter,
  ParticleAttractor,
  VelocityField3D,
  TemperatureField3D,
  PressureField3D,
} from '@pascal-app/core'
import type { Color, Vector3 } from 'three'
import { Vector3 as ThreeVector3 } from 'three'
import { calculateTotalForce } from './particle-forces'

interface Bounds3D {
  min: [number, number, number]
  max: [number, number, number]
}

export interface ParticleData {
  positions: Float32Array
  colors: Float32Array
  velocities: Float32Array
  lifetimes: Float32Array
  emitterIndices: Int32Array
}

export interface ParticleBuffers {
  geometry: {
    position: Float32Array
    color: Float32Array
    lifetime: Float32Array
  }
  data: ParticleData
}

/**
 * Create initial particle buffers
 */
export function createParticleBuffers(
  particleCount: number,
  emitters: ParticleEmitter[],
): ParticleBuffers {
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const lifetimes = new Float32Array(particleCount)
  const emitterIndices = new Int32Array(particleCount)

  // Initialize particles at emitter positions
  for (let i = 0; i < particleCount; i++) {
    const emitterIndex = i % emitters.length
    const emitter = emitters[emitterIndex]

    if (emitter) {
      // Add slight random offset to emitter position
      const offsetX = (Math.random() - 0.5) * 0.2
      const offsetY = (Math.random() - 0.5) * 0.2
      const offsetZ = (Math.random() - 0.5) * 0.2

      positions[i * 3] = emitter.position[0] + offsetX
      positions[i * 3 + 1] = emitter.position[1] + offsetY
      positions[i * 3 + 2] = emitter.position[2] + offsetZ

      // Initial velocity from emitter direction
      velocities[i * 3] = emitter.direction[0] * emitter.velocity
      velocities[i * 3 + 1] = emitter.direction[1] * emitter.velocity
      velocities[i * 3 + 2] = emitter.direction[2] * emitter.velocity

      // Random lifetime
      lifetimes[i] = Math.random() * 0.5 + 0.5 // 0.5-1.0

      // Emit from this emitter
      emitterIndices[i] = emitterIndex

      // Default white color
      colors[i * 3] = 1
      colors[i * 3 + 1] = 1
      colors[i * 3 + 2] = 1
    }
  }

  return {
    geometry: {
      position: positions,
      color: colors,
      lifetime: lifetimes,
    },
    data: {
      positions,
      colors,
      velocities,
      lifetimes,
      emitterIndices,
    },
  }
}

/**
 * Update particle positions using velocity field
 */
export function updateParticlePositions(
  buffers: ParticleData,
  velocityField: VelocityField3D,
  attractors: ParticleAttractor[],
  emitters: ParticleEmitter[],
  bounds: Bounds3D,
  deltaTime: number,
  temperatureField?: TemperatureField3D,
  pressureField?: PressureField3D,
  enableForces: { pressure?: boolean; buoyancy?: boolean } = { pressure: true, buoyancy: true },
): void {
  const { positions, velocities, lifetimes } = buffers

  for (let i = 0; i < positions.length / 3; i++) {
    const ix = i * 3
    const iy = i * 3 + 1
    const iz = i * 3 + 2

    // Decrease lifetime
    lifetimes[i]! -= deltaTime

    // Respawn if expired
    if (lifetimes[i]! <= 0) {
      respawnParticle(i, buffers, emitters)
      continue
    }

    // Sample velocity field at current position
    const px = positions[ix]!
    const py = positions[iy]!
    const pz = positions[iz]!

    const vx = sampleVelocityField(
      velocityField,
      px,
      py,
      pz,
    )

    // Add attractor influence
    const attractorVel = calculateAttractorVelocity(positions, i, attractors)

    // Update velocity (blend current velocity with field velocity)
    velocities[ix] = velocities[ix]! * 0.95 + (vx.x + attractorVel.x) * 0.05
    velocities[iy] = velocities[iy]! * 0.95 + (vx.y + attractorVel.y) * 0.05
    velocities[iz] = velocities[iz]! * 0.95 + (vx.z + attractorVel.z) * 0.05

    // Apply pressure and buoyancy forces
    if (temperatureField || pressureField) {
      const temp = temperatureField
        ? sampleTemperatureField(temperatureField, px, py, pz)
        : 293

      const force = calculateTotalForce(
        new ThreeVector3(px, py, pz),
        temp,
        pressureField,
        {
          enablePressureGradient: enableForces.pressure ?? true,
          enableBuoyancy: enableForces.buoyancy ?? true,
        }
      )

      // Apply force to velocity (F = ma, assuming unit mass)
      velocities[ix]! += force.x * deltaTime
      velocities[iy]! += force.y * deltaTime
      velocities[iz]! += force.z * deltaTime
    }

    // Integrate position (Euler integration)
    positions[ix] = positions[ix]! + velocities[ix]! * deltaTime
    positions[iy] = positions[iy]! + velocities[iy]! * deltaTime
    positions[iz] = positions[iz]! + velocities[iz]! * deltaTime

    // Handle boundary collisions
    handleBoundaryCollision(buffers, i, bounds)
  }
}

/**
 * Sample velocity field at a point using trilinear interpolation
 */
function sampleVelocityField(
  field: VelocityField3D,
  x: number,
  y: number,
  z: number,
): Vector3 {
  const [nx, ny, nz] = field.gridResolution
  const min = field.bounds.min
  const max = field.bounds.max

  // Normalize position to grid coordinates
  const gx = ((x - min[0]) / (max[0] - min[0])) * nx
  const gy = ((y - min[1]) / (max[1] - min[1])) * ny
  const gz = ((z - min[2]) / (max[2] - min[2])) * nz

  // Clamp to grid bounds
  const x0 = Math.floor(Math.max(0, Math.min(nx - 2, gx)))
  const y0 = Math.floor(Math.max(0, Math.min(ny - 2, gy)))
  const z0 = Math.floor(Math.max(0, Math.min(nz - 2, gz)))

  const x1 = x0 + 1
  const y1 = y0 + 1
  const z1 = z0 + 1

  // Interpolation weights
  const dx = gx - x0
  const dy = gy - y0
  const dz = gz - z0

  // Sample velocity at 8 corners
  const v000 = getVelocityAtCell(field, x0, y0, z0)
  const v100 = getVelocityAtCell(field, x1, y0, z0)
  const v010 = getVelocityAtCell(field, x0, y1, z0)
  const v110 = getVelocityAtCell(field, x1, y1, z0)
  const v001 = getVelocityAtCell(field, x0, y0, z1)
  const v101 = getVelocityAtCell(field, x1, y0, z1)
  const v011 = getVelocityAtCell(field, x0, y1, z1)
  const v111 = getVelocityAtCell(field, x1, y1, z1)

  // Trilinear interpolation
  const c00 = lerp3(v000, v100, dx)
  const c01 = lerp3(v001, v101, dx)
  const c10 = lerp3(v010, v110, dx)
  const c11 = lerp3(v011, v111, dx)

  const c0 = lerp3(c00, c10, dy)
  const c1 = lerp3(c01, c11, dy)

  return lerp3(c0, c1, dz)
}

/**
 * Get velocity at a grid cell
 */
function getVelocityAtCell(
  field: VelocityField3D,
  x: number,
  y: number,
  z: number,
): Vector3 {
  const [nx, ny, nz] = field.gridResolution
  const idx = (z * ny * nx + y * nx + x) * 3

  return new ThreeVector3(
    field.data[idx] ?? 0,
    field.data[idx + 1] ?? 0,
    field.data[idx + 2] ?? 0,
  )
}

/**
 * Linear interpolation between two vectors
 */
function lerp3(a: Vector3, b: Vector3, t: number): Vector3 {
  return new ThreeVector3(
    a.x + t * (b.x - a.x),
    a.y + t * (b.y - a.y),
    a.z + t * (b.z - a.z),
  )
}

/**
 * Calculate velocity influence from attractors
 */
function calculateAttractorVelocity(
  positions: Float32Array,
  particleIndex: number,
  attractors: ParticleAttractor[],
): Vector3 {
  let vx = 0
  let vy = 0
  let vz = 0

  const px = positions[particleIndex * 3]!
  const py = positions[particleIndex * 3 + 1]!
  const pz = positions[particleIndex * 3 + 2]!

  for (const attractor of attractors) {
    const ax = attractor.position[0]
    const ay = attractor.position[1]
    const az = attractor.position[2]

    const dx = px - ax
    const dy = py - ay
    const dz = pz - az

    const distSq = dx * dx + dy * dy + dz * dz
    const dist = Math.sqrt(distSq)

    if (dist > 0.01) {
      // Inverse square law attraction
      const force = -attractor.strength / distSq
      vx += force * dx / dist
      vy += force * dy / dist
      vz += force * dz / dist
    }
  }

  return new ThreeVector3(vx, vy, vz)
}

/**
 * Handle particle collision with boundaries
 */
function handleBoundaryCollision(
  buffers: ParticleData,
  particleIndex: number,
  bounds: Bounds3D,
): void {
  const { positions, velocities } = buffers
  const ix = particleIndex * 3
  const iy = particleIndex * 3 + 1
  const iz = particleIndex * 3 + 2

  const bounce = 0.3 // Energy retention after bounce
  const minX = bounds.min[0]
  const maxX = bounds.max[0]
  const minY = bounds.min[1]
  const maxY = bounds.max[1]
  const minZ = bounds.min[2]
  const maxZ = bounds.max[2]

  // X boundaries
  if (positions[ix]! < minX) {
    positions[ix] = minX
    velocities[ix] = -velocities[ix]! * bounce
  } else if (positions[ix]! > maxX) {
    positions[ix] = maxX
    velocities[ix] = -velocities[ix]! * bounce
  }

  // Y boundaries (floor/ceiling)
  if (positions[iy]! < minY) {
    positions[iy] = minY
    velocities[iy] = -velocities[iy]! * bounce
  } else if (positions[iy]! > maxY) {
    positions[iy] = maxY
    velocities[iy] = -velocities[iy]! * bounce
  }

  // Z boundaries
  if (positions[iz]! < minZ) {
    positions[iz] = minZ
    velocities[iz] = -velocities[iz]! * bounce
  } else if (positions[iz]! > maxZ) {
    positions[iz] = maxZ
    velocities[iz] = -velocities[iz]! * bounce
  }
}

/**
 * Respawn a particle at an emitter
 */
export function respawnParticle(
  particleIndex: number,
  buffers: ParticleData,
  emitters: ParticleEmitter[],
): void {
  if (emitters.length === 0) return

  // Pick a random emitter to respawn from
  const emitterIndex = Math.floor(Math.random() * emitters.length)
  const emitter = emitters[emitterIndex]!

  const baseIdx = particleIndex * 3

  // Add slight random offset to emitter position
  const offsetX = (Math.random() - 0.5) * 0.1
  const offsetY = (Math.random() - 0.5) * 0.1
  const offsetZ = (Math.random() - 0.5) * 0.1

  buffers.positions[baseIdx] = emitter.position[0] + offsetX
  buffers.positions[baseIdx + 1] = emitter.position[1] + offsetY
  buffers.positions[baseIdx + 2] = emitter.position[2] + offsetZ

  // Set velocity with spread
  const dir = applySpread(emitter.direction, emitter.spreadAngle)
  buffers.velocities[baseIdx] = dir[0] * emitter.velocity
  buffers.velocities[baseIdx + 1] = dir[1] * emitter.velocity
  buffers.velocities[baseIdx + 2] = dir[2] * emitter.velocity

  // Reset lifetime
  buffers.lifetimes[particleIndex] = 1.0
}

/**
 * Apply spread to direction vector within cone angle
 */
function applySpread(
  direction: [number, number, number],
  spreadAngle: number,
): [number, number, number] {
  const dir = new ThreeVector3(direction[0], direction[1], direction[2]).normalize()

  const theta = Math.random() * spreadAngle
  const phi = Math.random() * Math.PI * 2

  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)

  const up = Math.abs(dir.y) < 0.99 ? new ThreeVector3(0, 1, 0) : new ThreeVector3(1, 0, 0)
  const perp1 = new ThreeVector3().crossVectors(dir, up).normalize()
  const perp2 = new ThreeVector3().crossVectors(dir, perp1).normalize()

  const rotated = dir.clone().multiplyScalar(cosTheta)
  rotated.add(perp1.multiplyScalar(sinTheta * Math.cos(phi)))
  rotated.add(perp2.multiplyScalar(sinTheta * Math.sin(phi)))

  return [rotated.x, rotated.y, rotated.z]
}

/**
 * Sample temperature field at a point
 */
export function sampleTemperatureField(
  field: TemperatureField3D,
  x: number,
  y: number,
  z: number,
): number {
  const [nx, ny, nz] = field.gridResolution
  const min = field.bounds.min
  const max = field.bounds.max

  // Normalize position to grid coordinates
  const gx = ((x - min[0]) / (max[0] - min[0])) * nx
  const gy = ((y - min[1]) / (max[1] - min[1])) * ny
  const gz = ((z - min[2]) / (max[2] - min[2])) * nz

  // Clamp to grid bounds
  const x0 = Math.floor(Math.max(0, Math.min(nx - 1, gx)))
  const y0 = Math.floor(Math.max(0, Math.min(ny - 1, gy)))
  const z0 = Math.floor(Math.max(0, Math.min(nz - 1, gz)))

  const idx = z0 * ny * nx + y0 * nx + x0
  return field.data[idx] ?? 293 // Default to 293K if out of bounds
}

/**
 * Update particle colors based on temperature field
 */
export function updateParticleColors(
  buffers: { positions: Float32Array; colors: Float32Array; lifetimes: Float32Array },
  temperatureField: TemperatureField3D,
  colorScheme: string,
  getColorFromScheme: (temp: number, minTemp: number, maxTemp: number) => Color,
): void {
  const { positions, colors } = buffers

  // Calculate min/max temperature for color mapping
  let minTemp = Infinity
  let maxTemp = -Infinity

  for (let i = 0; i < temperatureField.data.length; i++) {
    const temp = temperatureField.data[i]
    if (temp !== undefined && temp < minTemp) minTemp = temp
    if (temp !== undefined && temp > maxTemp) maxTemp = temp
  }

  // Default fallback if no valid data
  if (!isFinite(minTemp) || !isFinite(maxTemp)) {
    minTemp = 288
    maxTemp = 298
  }

  // Update colors
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3]!
    const y = positions[i * 3 + 1]!
    const z = positions[i * 3 + 2]!

    const temp = sampleTemperatureField(temperatureField, x, y, z)
    const color = getColorFromScheme(temp, minTemp, maxTemp)

    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }
}
