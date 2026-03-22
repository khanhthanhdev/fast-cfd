import type {
  ParticleAttractor,
  ParticleEmitter,
  PressureField3D,
  TemperatureField3D,
  VelocityField3D,
} from '@pascal-app/core'
import { Color } from 'three'

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
  temperatures: Float32Array
  respawnCounts: Uint32Array
}

export interface ParticleBuffers {
  geometry: {
    position: Float32Array
    color: Float32Array
    lifetime: Float32Array
  }
  data: ParticleData
}

export interface ParticleEmitterRuntime {
  slotStarts: Uint32Array
  slotCounts: Uint32Array
  nextSlotOffsets: Uint32Array
  spawnAccumulators: Float32Array
  spawnRates: Float32Array
}

export interface ParticleForceOptions {
  pressure?: boolean
  buoyancy?: boolean
  sink?: boolean
  particleLifetime?: number
  ambientTemperature?: number
  heatExchangeRate?: number
  pressureStrength?: number
  buoyancyStrength?: number
  sinkStrength?: number
}

const DEFAULT_AMBIENT_TEMPERATURE = 22
const DEFAULT_PARTICLE_LIFETIME = 8
const DEFAULT_HEAT_EXCHANGE = 1.2
const SAMPLE_EPSILON = 1e-4
const PRESSURE_STEP = 0.1

const _sampleVelocity = { x: 0, y: 0, z: 0 }
const _sampleSink = { x: 0, y: 0, z: 0, captured: false }
const _particleDisplayColor = new Color()

type FlatFieldResolution = [colsX: number, verticalLevelsY: number, rowsZ: number]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function resolveEmitterSlotLayout(
  particleCount: number,
  emitters: ParticleEmitter[],
): { slotStarts: Uint32Array; slotCounts: Uint32Array } {
  const slotStarts = new Uint32Array(emitters.length)
  const slotCounts = new Uint32Array(emitters.length)

  if (emitters.length === 0 || particleCount <= 0) {
    return { slotStarts, slotCounts }
  }

  if (particleCount <= emitters.length) {
    for (let emitterIndex = 0; emitterIndex < particleCount; emitterIndex++) {
      slotCounts[emitterIndex] = 1
    }
  } else {
    slotCounts.fill(1)
    const remainingSlots = particleCount - emitters.length
    const weights = emitters.map((emitter) => Math.max(emitter.emissionRate, 1))
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || emitters.length
    let assignedSlots = 0

    const remainders = weights.map((weight, emitterIndex) => {
      const targetShare = (weight / totalWeight) * remainingSlots
      const assignedShare = Math.floor(targetShare)
      slotCounts[emitterIndex] = (slotCounts[emitterIndex] ?? 0) + assignedShare
      assignedSlots += assignedShare
      return {
        emitterIndex,
        remainder: targetShare - assignedShare,
        weight,
      }
    })

    let leftoverSlots = remainingSlots - assignedSlots
    remainders.sort((left, right) => {
      if (right.remainder !== left.remainder) {
        return right.remainder - left.remainder
      }

      if (right.weight !== left.weight) {
        return right.weight - left.weight
      }

      return left.emitterIndex - right.emitterIndex
    })

    for (const remainder of remainders) {
      if (leftoverSlots <= 0) break
      slotCounts[remainder.emitterIndex] = (slotCounts[remainder.emitterIndex] ?? 0) + 1
      leftoverSlots -= 1
    }
  }

  let nextStart = 0
  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    slotStarts[emitterIndex] = nextStart
    nextStart += slotCounts[emitterIndex] ?? 0
  }

  return { slotStarts, slotCounts }
}

function hashUnit(seed: number): number {
  let value = seed >>> 0
  value = Math.imul(value ^ 0x45d9f3b, 0x45d9f3b)
  value ^= value >>> 16
  value = Math.imul(value, 0x45d9f3b)
  value ^= value >>> 16
  return (value >>> 0) / 0xffff_ffff
}

function normalizeDirection(
  direction: [number, number, number],
): [number, number, number] {
  const magnitude = Math.hypot(direction[0], direction[1], direction[2])
  if (magnitude <= SAMPLE_EPSILON) {
    return [0, -1, 0]
  }

  return [
    direction[0] / magnitude,
    direction[1] / magnitude,
    direction[2] / magnitude,
  ]
}

function writeSpawnDirection(
  out: { x: number; y: number; z: number },
  direction: [number, number, number],
  spreadAngle: number,
  seedA: number,
  seedB: number,
): void {
  const [dirX, dirY, dirZ] = normalizeDirection(direction)
  const theta = seedA * spreadAngle
  const phi = seedB * Math.PI * 2
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)
  const upX = Math.abs(dirY) < 0.99 ? 0 : 1
  const upY = Math.abs(dirY) < 0.99 ? 1 : 0
  const upZ = 0

  let perp1X = dirY * upZ - dirZ * upY
  let perp1Y = dirZ * upX - dirX * upZ
  let perp1Z = dirX * upY - dirY * upX
  const perp1Length = Math.hypot(perp1X, perp1Y, perp1Z) || 1
  perp1X /= perp1Length
  perp1Y /= perp1Length
  perp1Z /= perp1Length

  let perp2X = dirY * perp1Z - dirZ * perp1Y
  let perp2Y = dirZ * perp1X - dirX * perp1Z
  let perp2Z = dirX * perp1Y - dirY * perp1X
  const perp2Length = Math.hypot(perp2X, perp2Y, perp2Z) || 1
  perp2X /= perp2Length
  perp2Y /= perp2Length
  perp2Z /= perp2Length

  const sinPhi = Math.sin(phi)
  const cosPhi = Math.cos(phi)
  out.x = dirX * cosTheta + perp1X * sinTheta * cosPhi + perp2X * sinTheta * sinPhi
  out.y = dirY * cosTheta + perp1Y * sinTheta * cosPhi + perp2Y * sinTheta * sinPhi
  out.z = dirZ * cosTheta + perp1Z * sinTheta * cosPhi + perp2Z * sinTheta * sinPhi
}

function sampleScalarField(
  data: number[],
  // Flat field buffers use [cols(x), verticalLevels(y), rows(z)] so they round-trip
  // cleanly with nested heat grids shaped as [verticalLevel][row][col].
  resolution: FlatFieldResolution,
  bounds: Bounds3D,
  x: number,
  y: number,
  z: number,
): number {
  const [nx, ny, nz] = resolution
  if (nx < 2 || ny < 2 || nz < 2 || data.length === 0) {
    return DEFAULT_AMBIENT_TEMPERATURE
  }

  const fx = clamp01((x - bounds.min[0]) / Math.max(bounds.max[0] - bounds.min[0], SAMPLE_EPSILON))
  const fy = clamp01((y - bounds.min[1]) / Math.max(bounds.max[1] - bounds.min[1], SAMPLE_EPSILON))
  const fz = clamp01((z - bounds.min[2]) / Math.max(bounds.max[2] - bounds.min[2], SAMPLE_EPSILON))
  const gx = fx * (nx - 1)
  const gy = fy * (ny - 1)
  const gz = fz * (nz - 1)
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const z0 = Math.floor(gz)
  const x1 = Math.min(nx - 1, x0 + 1)
  const y1 = Math.min(ny - 1, y0 + 1)
  const z1 = Math.min(nz - 1, z0 + 1)
  const dx = gx - x0
  const dy = gy - y0
  const dz = gz - z0

  const read = (cellX: number, cellY: number, cellZ: number) =>
    data[cellZ * ny * nx + cellY * nx + cellX] ?? DEFAULT_AMBIENT_TEMPERATURE

  const c00 = lerp(read(x0, y0, z0), read(x1, y0, z0), dx)
  const c10 = lerp(read(x0, y1, z0), read(x1, y1, z0), dx)
  const c01 = lerp(read(x0, y0, z1), read(x1, y0, z1), dx)
  const c11 = lerp(read(x0, y1, z1), read(x1, y1, z1), dx)
  const c0 = lerp(c00, c10, dy)
  const c1 = lerp(c01, c11, dy)
  return lerp(c0, c1, dz)
}

function sampleVelocityFieldInto(
  out: { x: number; y: number; z: number },
  field: VelocityField3D,
  x: number,
  y: number,
  z: number,
): void {
  const [nx, ny, nz] = field.gridResolution
  if (nx < 2 || ny < 2 || nz < 2 || field.data.length === 0) {
    out.x = 0
    out.y = 0
    out.z = 0
    return
  }

  const fx = clamp01((x - field.bounds.min[0]) / Math.max(field.bounds.max[0] - field.bounds.min[0], SAMPLE_EPSILON))
  const fy = clamp01((y - field.bounds.min[1]) / Math.max(field.bounds.max[1] - field.bounds.min[1], SAMPLE_EPSILON))
  const fz = clamp01((z - field.bounds.min[2]) / Math.max(field.bounds.max[2] - field.bounds.min[2], SAMPLE_EPSILON))
  const gx = fx * (nx - 1)
  const gy = fy * (ny - 1)
  const gz = fz * (nz - 1)
  const x0 = Math.floor(gx)
  const y0 = Math.floor(gy)
  const z0 = Math.floor(gz)
  const x1 = Math.min(nx - 1, x0 + 1)
  const y1 = Math.min(ny - 1, y0 + 1)
  const z1 = Math.min(nz - 1, z0 + 1)
  const dx = gx - x0
  const dy = gy - y0
  const dz = gz - z0

  const read = (cellX: number, cellY: number, cellZ: number, component: 0 | 1 | 2) =>
    field.data[(cellZ * ny * nx + cellY * nx + cellX) * 3 + component] ?? 0

  const interpolateComponent = (component: 0 | 1 | 2) => {
    const c00 = lerp(read(x0, y0, z0, component), read(x1, y0, z0, component), dx)
    const c10 = lerp(read(x0, y1, z0, component), read(x1, y1, z0, component), dx)
    const c01 = lerp(read(x0, y0, z1, component), read(x1, y0, z1, component), dx)
    const c11 = lerp(read(x0, y1, z1, component), read(x1, y1, z1, component), dx)
    return lerp(lerp(c00, c10, dy), lerp(c01, c11, dy), dz)
  }

  out.x = interpolateComponent(0)
  out.y = interpolateComponent(1)
  out.z = interpolateComponent(2)
}

function sampleAttractorFieldInto(
  out: { x: number; y: number; z: number; captured: boolean },
  x: number,
  y: number,
  z: number,
  attractors: ParticleAttractor[],
  sinkStrength: number,
): void {
  out.x = 0
  out.y = 0
  out.z = 0
  out.captured = false

  for (const attractor of attractors) {
    const toX = attractor.position[0] - x
    const toY = attractor.position[1] - y
    const toZ = attractor.position[2] - z
    const distSq = toX * toX + toY * toY + toZ * toZ
    const dist = Math.sqrt(distSq)
    const captureRadius = Math.max(attractor.radius, 0.1)

    if (dist <= captureRadius) {
      out.captured = true
      return
    }

    if (dist <= SAMPLE_EPSILON) continue

    const falloff = Math.exp(-Math.max(0, dist - captureRadius) * 0.85)
    const magnitude =
      (attractor.strength * (attractor.sinkStrength ?? 1) * sinkStrength * falloff)
      / (distSq + 0.2)
    const invDist = 1 / dist

    out.x += toX * invDist * magnitude
    out.y += toY * invDist * magnitude
    out.z += toZ * invDist * magnitude
  }
}

function samplePressureGradient(
  field: PressureField3D,
  x: number,
  y: number,
  z: number,
): { x: number; y: number; z: number } {
  const sample = (sx: number, sy: number, sz: number) =>
    sampleScalarField(field.data, field.gridResolution, field.bounds, sx, sy, sz)

  return {
    x: (sample(x + PRESSURE_STEP, y, z) - sample(x - PRESSURE_STEP, y, z)) / (PRESSURE_STEP * 2),
    y: (sample(x, y + PRESSURE_STEP, z) - sample(x, y - PRESSURE_STEP, z)) / (PRESSURE_STEP * 2),
    z: (sample(x, y, z + PRESSURE_STEP) - sample(x, y, z - PRESSURE_STEP)) / (PRESSURE_STEP * 2),
  }
}

function handleBoundarySlide(
  buffers: ParticleData,
  particleIndex: number,
  bounds: Bounds3D,
): void {
  const baseIndex = particleIndex * 3
  const damping = 0.82

  for (let axis = 0; axis < 3; axis++) {
    const tupleIndex = axis as 0 | 1 | 2
    const min = bounds.min[tupleIndex]
    const max = bounds.max[tupleIndex]
    const position = buffers.positions[baseIndex + axis] ?? min

    if (position < min) {
      buffers.positions[baseIndex + axis] = min
      buffers.velocities[baseIndex + axis] = Math.abs(buffers.velocities[baseIndex + axis] ?? 0) * 0.15

      if (axis !== 0) buffers.velocities[baseIndex]! *= damping
      if (axis !== 1) buffers.velocities[baseIndex + 1]! *= damping
      if (axis !== 2) buffers.velocities[baseIndex + 2]! *= damping
    } else if (position > max) {
      buffers.positions[baseIndex + axis] = max
      buffers.velocities[baseIndex + axis] = -Math.abs(buffers.velocities[baseIndex + axis] ?? 0) * 0.15

      if (axis !== 0) buffers.velocities[baseIndex]! *= damping
      if (axis !== 1) buffers.velocities[baseIndex + 1]! *= damping
      if (axis !== 2) buffers.velocities[baseIndex + 2]! *= damping
    }
  }
}

export function createParticleBuffers(
  particleCount: number,
  emitters: ParticleEmitter[],
  particleLifetime: number = DEFAULT_PARTICLE_LIFETIME,
  startFilled: boolean = false,
): ParticleBuffers {
  const positions = new Float32Array(particleCount * 3)
  const colors = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const lifetimes = new Float32Array(particleCount)
  const emitterIndices = new Int32Array(particleCount)
  const temperatures = new Float32Array(particleCount)
  const respawnCounts = new Uint32Array(particleCount)

  const data: ParticleData = {
    positions,
    colors,
    velocities,
    lifetimes,
    emitterIndices,
    temperatures,
    respawnCounts,
  }

  if (emitters.length === 0) {
    return {
      geometry: {
        position: positions,
        color: colors,
        lifetime: lifetimes,
      },
      data,
    }
  }

  const { slotStarts, slotCounts } = resolveEmitterSlotLayout(particleCount, emitters)

  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    const emitter = emitters[emitterIndex]
    const slotStart = slotStarts[emitterIndex] ?? 0
    const slotCount = slotCounts[emitterIndex] ?? 0

    if (!emitter || slotCount <= 0) continue

    for (let slotOffset = 0; slotOffset < slotCount; slotOffset++) {
      const particleIndex = slotStart + slotOffset
      const baseIndex = particleIndex * 3

      emitterIndices[particleIndex] = emitterIndex
      positions[baseIndex] = emitter.position[0]
      positions[baseIndex + 1] = emitter.position[1]
      positions[baseIndex + 2] = emitter.position[2]
      temperatures[particleIndex] = emitter.temperature
      colors[baseIndex] = 1
      colors[baseIndex + 1] = 1
      colors[baseIndex + 2] = 1

      if (startFilled) {
        primeParticleSlot(
          particleIndex,
          data,
          emitters,
          particleLifetime,
          emitterIndex,
          slotOffset,
          slotCount,
        )
      } else {
        lifetimes[particleIndex] = 0
      }
    }
  }

  return {
    geometry: {
      position: positions,
      color: colors,
      lifetime: lifetimes,
    },
    data,
  }
}

function primeParticleSlot(
  particleIndex: number,
  buffers: ParticleData,
  emitters: ParticleEmitter[],
  particleLifetime: number = DEFAULT_PARTICLE_LIFETIME,
  emitterIndexOverride?: number,
  slotOffset: number = 0,
  slotCount: number = 1,
): void {
  respawnParticle(
    particleIndex,
    buffers,
    emitters,
    particleLifetime,
    emitterIndexOverride,
  )

  const baseIndex = particleIndex * 3
  const seedBase = particleIndex * 747796405 + slotCount * 2891336453
  const ageJitter = hashUnit(seedBase + 71)
  const travelJitter = hashUnit(seedBase + 113)
  const phaseBase = slotCount > 1 ? slotOffset / slotCount : 0
  const normalizedAge = clamp(
    0.08 + (((phaseBase + ageJitter * 0.55) % 1) * 0.88),
    0.08,
    0.96,
  )
  const primedTravelTime =
    particleLifetime * normalizedAge * (0.08 + travelJitter * 0.1)

  buffers.positions[baseIndex]! += (buffers.velocities[baseIndex] ?? 0) * primedTravelTime
  buffers.positions[baseIndex + 1]! += (buffers.velocities[baseIndex + 1] ?? 0) * primedTravelTime
  buffers.positions[baseIndex + 2]! += (buffers.velocities[baseIndex + 2] ?? 0) * primedTravelTime
  buffers.lifetimes[particleIndex] = clamp(1 - normalizedAge, 0.18, 0.98)
}

export function respawnParticle(
  particleIndex: number,
  buffers: ParticleData,
  emitters: ParticleEmitter[],
  _particleLifetime: number = DEFAULT_PARTICLE_LIFETIME,
  emitterIndexOverride?: number,
): void {
  if (emitters.length === 0) return

  const baseIndex = particleIndex * 3
  const emitterIndex =
    emitterIndexOverride
    ?? clamp(buffers.emitterIndices[particleIndex] ?? 0, 0, emitters.length - 1)
  const emitter = emitters[emitterIndex] ?? emitters[0]

  if (!emitter) return

  buffers.emitterIndices[particleIndex] = emitterIndex
  const respawnCount = (buffers.respawnCounts[particleIndex] ?? 0) + 1
  buffers.respawnCounts[particleIndex] = respawnCount

  const seedBase = particleIndex * 1103515245 + respawnCount * 12345
  const seedA = hashUnit(seedBase)
  const seedB = hashUnit(seedBase + 17)
  const seedC = hashUnit(seedBase + 31)
  const seedD = hashUnit(seedBase + 47)
  const spawnDirection = { x: 0, y: 0, z: 0 }
  writeSpawnDirection(spawnDirection, emitter.direction, emitter.spreadAngle, seedA, seedB)

  const spawnRadius = emitter.radius ?? 0.15
  const offsetRadius = spawnRadius * Math.sqrt(seedC) * 0.8
  const offsetAngle = seedD * Math.PI * 2
  const perpendicularX = Math.cos(offsetAngle) * offsetRadius
  const perpendicularZ = Math.sin(offsetAngle) * offsetRadius

  buffers.positions[baseIndex] = emitter.position[0] + perpendicularX
  buffers.positions[baseIndex + 1] = emitter.position[1]
  buffers.positions[baseIndex + 2] = emitter.position[2] + perpendicularZ
  buffers.velocities[baseIndex] = spawnDirection.x * emitter.velocity
  buffers.velocities[baseIndex + 1] = spawnDirection.y * emitter.velocity
  buffers.velocities[baseIndex + 2] = spawnDirection.z * emitter.velocity
  buffers.lifetimes[particleIndex] = 1
  buffers.temperatures[particleIndex] = emitter.temperature
  buffers.colors[baseIndex] = 1
  buffers.colors[baseIndex + 1] = 1
  buffers.colors[baseIndex + 2] = 1
}

export function sampleTemperatureField(
  field: TemperatureField3D,
  x: number,
  y: number,
  z: number,
): number {
  return sampleScalarField(field.data, field.gridResolution, field.bounds, x, y, z)
}

export function createParticleEmitterRuntime(
  particleCount: number,
  emitters: ParticleEmitter[],
  particleLifetime: number = DEFAULT_PARTICLE_LIFETIME,
): ParticleEmitterRuntime {
  const { slotStarts, slotCounts } = resolveEmitterSlotLayout(particleCount, emitters)
  const spawnRates = new Float32Array(emitters.length)

  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    const slotCount = slotCounts[emitterIndex] ?? 0
    const emitter = emitters[emitterIndex]

    if (!emitter || slotCount <= 0) continue

    const steadyStateRate = slotCount / Math.max(particleLifetime, 0.1)
    spawnRates[emitterIndex] = Math.max(emitter.emissionRate, steadyStateRate)
  }

  return {
    slotStarts,
    slotCounts,
    nextSlotOffsets: new Uint32Array(emitters.length),
    spawnAccumulators: new Float32Array(emitters.length),
    spawnRates,
  }
}

function findInactiveEmitterSlot(
  buffers: ParticleData,
  slotStart: number,
  slotCount: number,
  searchOffset: number,
): number {
  for (let step = 0; step < slotCount; step++) {
    const slotOffset = (searchOffset + step) % slotCount
    const particleIndex = slotStart + slotOffset

    if ((buffers.lifetimes[particleIndex] ?? 0) <= 0) {
      return slotOffset
    }
  }

  return -1
}

function deactivateParticle(
  buffers: ParticleData,
  particleIndex: number,
): void {
  const baseIndex = particleIndex * 3
  buffers.lifetimes[particleIndex] = 0
  buffers.velocities[baseIndex] = 0
  buffers.velocities[baseIndex + 1] = 0
  buffers.velocities[baseIndex + 2] = 0
}

export function emitParticlesFromEmitters(
  buffers: ParticleData,
  emitters: ParticleEmitter[],
  emitterRuntime: ParticleEmitterRuntime,
  deltaTime: number,
  particleLifetime: number = DEFAULT_PARTICLE_LIFETIME,
): void {
  if (emitters.length === 0) return

  for (let emitterIndex = 0; emitterIndex < emitters.length; emitterIndex++) {
    const slotCount = emitterRuntime.slotCounts[emitterIndex] ?? 0
    const slotStart = emitterRuntime.slotStarts[emitterIndex] ?? 0

    if (slotCount <= 0) continue

    const maxBurst = Math.max(
      4,
      Math.min(24, Math.ceil((emitterRuntime.spawnRates[emitterIndex] ?? 0) * 0.16)),
    )
    emitterRuntime.spawnAccumulators[emitterIndex] = Math.min(
      (emitterRuntime.spawnAccumulators[emitterIndex] ?? 0)
        + (emitterRuntime.spawnRates[emitterIndex] ?? 0) * deltaTime,
      maxBurst,
    )

    let spawnCount = Math.min(
      maxBurst,
      Math.floor(emitterRuntime.spawnAccumulators[emitterIndex] ?? 0),
    )

    while (spawnCount > 0) {
      const slotOffset = findInactiveEmitterSlot(
        buffers,
        slotStart,
        slotCount,
        emitterRuntime.nextSlotOffsets[emitterIndex] ?? 0,
      )

      if (slotOffset < 0) break

      emitterRuntime.spawnAccumulators[emitterIndex] =
        (emitterRuntime.spawnAccumulators[emitterIndex] ?? 0) - 1
      emitterRuntime.nextSlotOffsets[emitterIndex] = (slotOffset + 1) % slotCount
      respawnParticle(
        slotStart + slotOffset,
        buffers,
        emitters,
        particleLifetime,
        emitterIndex,
      )
      spawnCount -= 1
    }
  }
}

export function updateParticlePositions(
  buffers: ParticleData,
  velocityField: VelocityField3D | undefined,
  attractors: ParticleAttractor[],
  emitters: ParticleEmitter[],
  bounds: Bounds3D,
  deltaTime: number,
  temperatureField?: TemperatureField3D,
  pressureField?: PressureField3D,
  options: ParticleForceOptions = {},
): void {
  if (emitters.length === 0) return

  const ambientTemperature = options.ambientTemperature ?? DEFAULT_AMBIENT_TEMPERATURE
  const particleLifetime = Math.max(options.particleLifetime ?? DEFAULT_PARTICLE_LIFETIME, 0.1)
  const heatExchangeRate = Math.max(options.heatExchangeRate ?? DEFAULT_HEAT_EXCHANGE, 0)
  const pressureStrength = options.pressureStrength ?? 0.2
  const buoyancyStrength = options.buoyancyStrength ?? 0.15
  const sinkStrength = options.sinkStrength ?? 1
  const velocityBlend = clamp01(deltaTime * 3.1)
  const lifetimeDecay = deltaTime / particleLifetime

  for (let particleIndex = 0; particleIndex < buffers.lifetimes.length; particleIndex++) {
    const baseIndex = particleIndex * 3
    const lifetime = buffers.lifetimes[particleIndex] ?? 0

    if (lifetime <= 0) {
      continue
    }

    buffers.lifetimes[particleIndex] = lifetime - lifetimeDecay

    if ((buffers.lifetimes[particleIndex] ?? 0) <= 0) {
      respawnParticle(particleIndex, buffers, emitters, particleLifetime)
      continue
    }

    const x = buffers.positions[baseIndex] ?? 0
    const y = buffers.positions[baseIndex + 1] ?? 0
    const z = buffers.positions[baseIndex + 2] ?? 0

    const ownerEmitterIndex = clamp(buffers.emitterIndices[particleIndex] ?? 0, 0, emitters.length - 1)
    const ownerEmitter = emitters[ownerEmitterIndex] ?? emitters[0]
    if (!ownerEmitter) continue

    if (velocityField) {
      sampleVelocityFieldInto(_sampleVelocity, velocityField, x, y, z)
    } else {
      _sampleVelocity.x = 0
      _sampleVelocity.y = 0
      _sampleVelocity.z = 0
    }

    sampleAttractorFieldInto(
      _sampleSink,
      x,
      y,
      z,
      attractors,
      options.sink === false ? 0 : sinkStrength,
    )

    if (_sampleSink.captured) {
      respawnParticle(particleIndex, buffers, emitters, particleLifetime)
      continue
    }

    const roomTemperature = temperatureField
      ? sampleTemperatureField(temperatureField, x, y, z)
      : ambientTemperature
    const currentParticleTemperature = buffers.temperatures[particleIndex] ?? roomTemperature
    buffers.temperatures[particleIndex] = lerp(
      currentParticleTemperature,
      roomTemperature,
      clamp01(deltaTime * heatExchangeRate),
    )

    const distanceFromEmitter = Math.hypot(
      x - ownerEmitter.position[0],
      y - ownerEmitter.position[1],
      z - ownerEmitter.position[2],
    )
    const launchInfluence = 1 - clamp01(distanceFromEmitter / Math.max((ownerEmitter.radius ?? 0.2) * 6, 1.25))
    const launchVelocityX = ownerEmitter.direction[0] * ownerEmitter.velocity * launchInfluence
    const launchVelocityY = ownerEmitter.direction[1] * ownerEmitter.velocity * launchInfluence
    const launchVelocityZ = ownerEmitter.direction[2] * ownerEmitter.velocity * launchInfluence
    const targetVelocityX = _sampleVelocity.x + launchVelocityX + _sampleSink.x
    const targetVelocityY = _sampleVelocity.y + launchVelocityY + _sampleSink.y
    const targetVelocityZ = _sampleVelocity.z + launchVelocityZ + _sampleSink.z

    buffers.velocities[baseIndex] = lerp(
      buffers.velocities[baseIndex] ?? 0,
      targetVelocityX,
      velocityBlend,
    )
    buffers.velocities[baseIndex + 1] = lerp(
      buffers.velocities[baseIndex + 1] ?? 0,
      targetVelocityY,
      velocityBlend,
    )
    buffers.velocities[baseIndex + 2] = lerp(
      buffers.velocities[baseIndex + 2] ?? 0,
      targetVelocityZ,
      velocityBlend,
    )

    if (pressureField && options.pressure) {
      const gradient = samplePressureGradient(pressureField, x, y, z)
      buffers.velocities[baseIndex]! -= gradient.x * pressureStrength * deltaTime
      buffers.velocities[baseIndex + 1]! -= gradient.y * pressureStrength * deltaTime
      buffers.velocities[baseIndex + 2]! -= gradient.z * pressureStrength * deltaTime
    }

    if (options.buoyancy) {
      const buoyancy =
        ((buffers.temperatures[particleIndex] ?? ambientTemperature) - ambientTemperature)
        * 0.06
        * buoyancyStrength
      buffers.velocities[baseIndex + 1]! += buoyancy * deltaTime
    }

    buffers.positions[baseIndex]! += (buffers.velocities[baseIndex] ?? 0) * deltaTime
    buffers.positions[baseIndex + 1]! += (buffers.velocities[baseIndex + 1] ?? 0) * deltaTime
    buffers.positions[baseIndex + 2]! += (buffers.velocities[baseIndex + 2] ?? 0) * deltaTime

    sampleAttractorFieldInto(
      _sampleSink,
      buffers.positions[baseIndex] ?? 0,
      buffers.positions[baseIndex + 1] ?? 0,
      buffers.positions[baseIndex + 2] ?? 0,
      attractors,
      options.sink === false ? 0 : sinkStrength,
    )

    if (_sampleSink.captured) {
      respawnParticle(particleIndex, buffers, emitters, particleLifetime)
      continue
    }

    handleBoundarySlide(buffers, particleIndex, bounds)
  }
}

export function updateParticleColors(
  buffers: Pick<ParticleData, 'colors' | 'positions' | 'temperatures'>,
  temperatureField: TemperatureField3D | undefined,
  _colorScheme: string,
  getColorFromScheme: (
    temp: number,
    minTemp: number,
    maxTemp: number,
    target?: Color,
  ) => Color,
  temperatureRange?: { min: number; max: number },
): void {
  let minTemp = temperatureRange?.min
  let maxTemp = temperatureRange?.max

  if (minTemp === undefined || maxTemp === undefined) {
    if (temperatureField?.data.length) {
      minTemp = Number.POSITIVE_INFINITY
      maxTemp = Number.NEGATIVE_INFINITY

      for (const value of temperatureField.data) {
        minTemp = Math.min(minTemp, value)
        maxTemp = Math.max(maxTemp, value)
      }
    } else {
      minTemp = Number.POSITIVE_INFINITY
      maxTemp = Number.NEGATIVE_INFINITY

      for (const value of buffers.temperatures) {
        minTemp = Math.min(minTemp, value)
        maxTemp = Math.max(maxTemp, value)
      }
    }
  }

  if (!Number.isFinite(minTemp) || !Number.isFinite(maxTemp) || minTemp === maxTemp) {
    minTemp = 18
    maxTemp = 28
  }

  for (let index = 0; index < buffers.temperatures.length; index++) {
    const color = getColorFromScheme(
      buffers.temperatures[index] ?? DEFAULT_AMBIENT_TEMPERATURE,
      minTemp,
      maxTemp,
      _particleDisplayColor,
    )
    const baseIndex = index * 3
    buffers.colors[baseIndex] = color.r
    buffers.colors[baseIndex + 1] = color.g
    buffers.colors[baseIndex + 2] = color.b
  }
}
