import {
  ParticleSystemNode,
  type ParticleAttractor,
  type ParticleEmitter,
  type ParticleSystemNodeType,
  type PressureField3D,
  type TemperatureField3D,
  type VelocityField3D,
} from '@pascal-app/core'
import type { Bounds3D, Vector3Like, VelocityDirectionCell } from './cfd-types'
import type { DiffuserInfo } from './diffuser-detector'

export interface MockCFDOptions {
  roomBounds: Bounds3D
  ambientTemperature: number
  supplyTemperature: number
  gridResolution: [number, number, number]
}

export interface ParticleSystemData {
  emitters: ParticleEmitter[]
  attractors: ParticleAttractor[]
  velocityField: VelocityField3D
  temperatureField: TemperatureField3D
  pressureField: PressureField3D
}

export interface BuildParticleSystemConfigOptions {
  levelId?: string | null
  zoneId?: string | null
  heatmapNodeId?: string | null
  supplyDiffusers: DiffuserInfo[]
  returnDiffusers: DiffuserInfo[]
  roomBounds: Bounds3D
  ambientTemperature: number
  supplyTemperature: number
  airflowRate?: number
  gridResolution?: [number, number, number]
  particleCount?: number
  particleLifetime?: number
  colorScheme?: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  temperatureGrid3D?: number[][][]
  velocityGrid3D?: number[][][]
  velocityGrid3DDirection?: VelocityDirectionCell[][][]
}

const DEFAULT_GRID_RESOLUTION: [number, number, number] = [20, 10, 20]

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function normalizeVector(vector: [number, number, number]): [number, number, number] {
  const magnitude = Math.hypot(vector[0], vector[1], vector[2])
  if (magnitude <= 1e-6) {
    return [0, -1, 0]
  }

  return [
    vector[0] / magnitude,
    vector[1] / magnitude,
    vector[2] / magnitude,
  ]
}

function getDiffuserDischargeArea(
  dimensions: [number, number, number],
  direction: [number, number, number],
): number {
  const [dirX, dirY, dirZ] = normalizeVector(direction)
  const absX = Math.abs(dirX)
  const absY = Math.abs(dirY)
  const absZ = Math.abs(dirZ)

  if (absY >= absX && absY >= absZ) {
    return Math.max(dimensions[0] * dimensions[2], 0.08)
  }

  if (absX >= absZ) {
    return Math.max(dimensions[1] * dimensions[2], 0.08)
  }

  return Math.max(dimensions[0] * dimensions[1], 0.08)
}

function distributeAirflowAcrossDiffusers(
  diffusers: DiffuserInfo[],
  totalAirflowRate?: number,
): number[] | null {
  if (!Number.isFinite(totalAirflowRate) || (totalAirflowRate ?? 0) <= 0 || diffusers.length === 0) {
    return null
  }

  const weights = diffusers.map((diffuser) =>
    Math.max(
      diffuser.airflowRate,
      getDiffuserDischargeArea(diffuser.dimensions, diffuser.direction) * 10,
      0.1,
    ),
  )
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || diffusers.length

  return diffusers.map((_, index) => ((totalAirflowRate ?? 0) * (weights[index] ?? 0)) / totalWeight)
}

function convertAirflowRateToVelocity(
  airflowRate: number,
  diffuser: DiffuserInfo,
): number {
  const dischargeArea = getDiffuserDischargeArea(diffuser.dimensions, diffuser.direction)
  const volumetricFlowRate = airflowRate / 3600

  return clamp((volumetricFlowRate / dischargeArea) * 6.5, 0.35, 1.85)
}

function blendVelocityFields(
  primaryField: VelocityField3D,
  secondaryField: VelocityField3D,
  primaryWeight: number = 0.72,
): VelocityField3D {
  const sameResolution =
    primaryField.gridResolution[0] === secondaryField.gridResolution[0]
    && primaryField.gridResolution[1] === secondaryField.gridResolution[1]
    && primaryField.gridResolution[2] === secondaryField.gridResolution[2]
  const sameBounds =
    primaryField.bounds.min[0] === secondaryField.bounds.min[0]
    && primaryField.bounds.min[1] === secondaryField.bounds.min[1]
    && primaryField.bounds.min[2] === secondaryField.bounds.min[2]
    && primaryField.bounds.max[0] === secondaryField.bounds.max[0]
    && primaryField.bounds.max[1] === secondaryField.bounds.max[1]
    && primaryField.bounds.max[2] === secondaryField.bounds.max[2]

  if (!sameResolution || !sameBounds || primaryField.data.length !== secondaryField.data.length) {
    return primaryField
  }

  const secondaryWeight = 1 - primaryWeight
  const data = primaryField.data.map((value, index) =>
    value * primaryWeight + (secondaryField.data[index] ?? 0) * secondaryWeight,
  )

  return {
    ...primaryField,
    data,
  }
}

function getCellCenter(
  bounds: Bounds3D,
  resolution: [number, number, number],
  xIndex: number,
  yIndex: number,
  zIndex: number,
): Vector3Like {
  const [nx, ny, nz] = resolution
  const width = bounds.max.x - bounds.min.x
  const height = bounds.max.y - bounds.min.y
  const depth = bounds.max.z - bounds.min.z

  return {
    x: bounds.min.x + ((xIndex + 0.5) / nx) * width,
    y: bounds.min.y + ((yIndex + 0.5) / ny) * height,
    z: bounds.min.z + ((zIndex + 0.5) / nz) * depth,
  }
}

function getTemperatureRange(values: number[]): [number, number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY

  for (const value of values) {
    if (!Number.isFinite(value)) continue
    min = Math.min(min, value)
    max = Math.max(max, value)
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [289, 300]
  }

  if (min === max) {
    return [min - 1, max + 1]
  }

  return [min, max]
}

function inferGridResolutionFromTemperatureGrid(
  temperatureGrid3D?: number[][][],
): [number, number, number] | undefined {
  const verticalLevels = temperatureGrid3D?.length ?? 0
  const rows = temperatureGrid3D?.[0]?.length ?? 0
  const cols = temperatureGrid3D?.[0]?.[0]?.length ?? 0

  if (!verticalLevels || !rows || !cols) {
    return undefined
  }

  // Nested grids are [verticalLevel][row][col], while flat fields encode the
  // same shape as [cols(x), verticalLevels(y), rows(z)].
  return [cols, verticalLevels, rows]
}

function createVelocityFieldFromHeatmapData(
  velocityGrid3D: number[][][],
  velocityDirections: VelocityDirectionCell[][][],
  bounds: Bounds3D,
): VelocityField3D {
  const resolution = inferGridResolutionFromTemperatureGrid(velocityGrid3D)

  if (!resolution) {
    return {
      gridResolution: DEFAULT_GRID_RESOLUTION,
      bounds: {
        min: [bounds.min.x, bounds.min.y, bounds.min.z],
        max: [bounds.max.x, bounds.max.y, bounds.max.z],
      },
      data: [],
    }
  }

  const [nx, ny, nz] = resolution
  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const magnitude = velocityGrid3D[y]?.[z]?.[x] ?? 0
        const direction = velocityDirections[y]?.[z]?.[x] ?? { x: 0, y: 0, z: 0 }
        const dirLength = Math.hypot(direction.x, direction.y, direction.z) || 1

        data.push(
          (direction.x / dirLength) * magnitude,
          (direction.y / dirLength) * magnitude,
          (direction.z / dirLength) * magnitude,
        )
      }
    }
  }

  return {
    gridResolution: resolution,
    bounds: {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
    data,
  }
}

function createTemperatureFieldFromHeatmapData(
  temperatureGrid3D: number[][][],
  bounds: Bounds3D,
): TemperatureField3D {
  const resolution = inferGridResolutionFromTemperatureGrid(temperatureGrid3D)

  if (!resolution) {
    return {
      gridResolution: DEFAULT_GRID_RESOLUTION,
      bounds: {
        min: [bounds.min.x, bounds.min.y, bounds.min.z],
        max: [bounds.max.x, bounds.max.y, bounds.max.z],
      },
      data: [],
    }
  }

  const [nx, ny, nz] = resolution
  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        data.push(temperatureGrid3D[y]?.[z]?.[x] ?? 22)
      }
    }
  }

  return {
    gridResolution: resolution,
    bounds: {
      min: [bounds.min.x, bounds.min.y, bounds.min.z],
      max: [bounds.max.x, bounds.max.y, bounds.max.z],
    },
    data,
  }
}

function calculateSupplyJetVelocity(
  point: Vector3Like,
  emitter: ParticleEmitter,
): Vector3Like {
  const relX = point.x - emitter.position[0]
  const relY = point.y - emitter.position[1]
  const relZ = point.z - emitter.position[2]

  const dirX = emitter.direction[0]
  const dirY = emitter.direction[1]
  const dirZ = emitter.direction[2]
  const along = relX * dirX + relY * dirY + relZ * dirZ

  if (along < -0.12) {
    return { x: 0, y: 0, z: 0 }
  }

  const projectedX = dirX * Math.max(along, 0)
  const projectedY = dirY * Math.max(along, 0)
  const projectedZ = dirZ * Math.max(along, 0)
  const radialX = relX - projectedX
  const radialY = relY - projectedY
  const radialZ = relZ - projectedZ
  const radialDistance = Math.hypot(radialX, radialY, radialZ)
  const spread = emitter.radius + Math.tan(emitter.spreadAngle) * (0.25 + Math.max(along, 0))
  const gaussian = Math.exp(-(radialDistance ** 2) / (2 * spread * spread))
  const decay = Math.exp(-Math.max(along, 0) / 2.8)
  const magnitude = emitter.velocity * gaussian * decay

  return {
    x: dirX * magnitude,
    y: dirY * magnitude,
    z: dirZ * magnitude,
  }
}

function calculateSupplySpreadVelocity(
  point: Vector3Like,
  emitter: ParticleEmitter,
): Vector3Like {
  const relX = point.x - emitter.position[0]
  const relY = point.y - emitter.position[1]
  const relZ = point.z - emitter.position[2]
  const dirX = emitter.direction[0]
  const dirY = emitter.direction[1]
  const dirZ = emitter.direction[2]
  const along = relX * dirX + relY * dirY + relZ * dirZ

  if (along <= 0.05) {
    return { x: 0, y: 0, z: 0 }
  }

  const projectedX = dirX * along
  const projectedY = dirY * along
  const projectedZ = dirZ * along
  const radialX = relX - projectedX
  const radialY = relY - projectedY
  const radialZ = relZ - projectedZ
  const radialDistance = Math.hypot(radialX, radialY, radialZ)

  if (radialDistance <= 1e-4) {
    return { x: 0, y: 0, z: 0 }
  }

  const spread = emitter.radius + Math.tan(emitter.spreadAngle) * (0.35 + along)
  const plume =
    Math.exp(-(radialDistance ** 2) / (2 * spread * spread))
    * Math.exp(-Math.max(along, 0) / 3.6)
  const magnitude =
    emitter.velocity
    * 0.42
    * smoothstep(0.05, 0.8, along)
    * plume
    * clamp01(radialDistance / Math.max(spread, 0.08))
  const invDistance = 1 / radialDistance

  return {
    x: radialX * invDistance * magnitude,
    y: radialY * invDistance * magnitude,
    z: radialZ * invDistance * magnitude,
  }
}

function calculateReturnFlowVelocity(
  point: Vector3Like,
  attractor: ParticleAttractor,
): Vector3Like {
  const toX = attractor.position[0] - point.x
  const toY = attractor.position[1] - point.y
  const toZ = attractor.position[2] - point.z
  const distSq = toX * toX + toY * toY + toZ * toZ
  const dist = Math.sqrt(distSq)

  if (dist <= 1e-4) {
    return { x: 0, y: 0, z: 0 }
  }

  const captureRadius = Math.max(attractor.radius, 0.25)
  const falloff = Math.exp(-Math.max(0, dist - captureRadius) * 0.8)
  const magnitude = (attractor.strength * attractor.sinkStrength * falloff) / (distSq + 0.35)
  const invDist = 1 / dist

  return {
    x: toX * invDist * magnitude,
    y: toY * invDist * magnitude,
    z: toZ * invDist * magnitude,
  }
}

function calculateRoomRecirculationVelocity(
  point: Vector3Like,
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  bounds: Bounds3D,
): Vector3Like {
  if (emitters.length === 0) {
    return { x: 0, y: 0, z: 0 }
  }

  const roomCenterX = (bounds.min.x + bounds.max.x) / 2
  const roomCenterY = (bounds.min.y + bounds.max.y) / 2
  const roomCenterZ = (bounds.min.z + bounds.max.z) / 2
  const roomSpan = Math.max(
    Math.hypot(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z),
    0.5,
  )
  const roomHeight = Math.max(bounds.max.y - bounds.min.y, 0.1)
  const normalizedHeight = clamp01((point.y - bounds.min.y) / roomHeight)

  let nearestSupplyDistance = Number.POSITIVE_INFINITY
  for (const emitter of emitters) {
    nearestSupplyDistance = Math.min(
      nearestSupplyDistance,
      Math.hypot(
        point.x - emitter.position[0],
        point.y - emitter.position[1],
        point.z - emitter.position[2],
      ),
    )
  }

  const settleFactor = smoothstep(0.35, 2.8, nearestSupplyDistance)

  if (attractors.length === 0) {
    const toCenterX = roomCenterX - point.x
    const toCenterY = roomCenterY - point.y
    const toCenterZ = roomCenterZ - point.z
    const dist = Math.hypot(toCenterX, toCenterY, toCenterZ)

    if (dist <= 1e-4) {
      return { x: 0, y: 0, z: 0 }
    }

    const magnitude =
      0.08
      * settleFactor
      * (0.85 - normalizedHeight * 0.2)
      * clamp01(dist / roomSpan)
    const invDist = 1 / dist

    return {
      x: toCenterX * invDist * magnitude,
      y: toCenterY * invDist * magnitude * 0.25,
      z: toCenterZ * invDist * magnitude,
    }
  }

  let weightedX = 0
  let weightedY = 0
  let weightedZ = 0
  let totalWeight = 0

  for (const attractor of attractors) {
    const weight = Math.max(attractor.strength * (attractor.sinkStrength ?? 1), 0.1)
    weightedX += attractor.position[0] * weight
    weightedY += attractor.position[1] * weight
    weightedZ += attractor.position[2] * weight
    totalWeight += weight
  }

  const targetX = totalWeight > 0 ? weightedX / totalWeight : roomCenterX
  const targetY = totalWeight > 0 ? weightedY / totalWeight : roomCenterY
  const targetZ = totalWeight > 0 ? weightedZ / totalWeight : roomCenterZ
  const toReturnX = targetX - point.x
  const toReturnY = targetY - point.y
  const toReturnZ = targetZ - point.z
  const dist = Math.hypot(toReturnX, toReturnY, toReturnZ)

  if (dist <= 1e-4) {
    return { x: 0, y: 0, z: 0 }
  }

  const magnitude =
    0.16
    * settleFactor
    * (0.72 + (1 - normalizedHeight) * 0.28)
    * clamp01(dist / roomSpan)
  const invDist = 1 / dist

  return {
    x: toReturnX * invDist * magnitude,
    y: toReturnY * invDist * magnitude,
    z: toReturnZ * invDist * magnitude,
  }
}

function calculateWallDamping(point: Vector3Like, bounds: Bounds3D): number {
  const edgeDistance = Math.min(
    point.x - bounds.min.x,
    bounds.max.x - point.x,
    point.y - bounds.min.y,
    bounds.max.y - point.y,
    point.z - bounds.min.z,
    bounds.max.z - point.z,
  )

  return 0.45 + 0.55 * clamp01(edgeDistance / 0.4)
}

function calculateVelocityAt(
  point: Vector3Like,
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  bounds: Bounds3D,
  ambientTemperature: number,
): Vector3Like {
  let velocityX = 0
  let velocityY = 0
  let velocityZ = 0

  for (const emitter of emitters) {
    const jet = calculateSupplyJetVelocity(point, emitter)
    const spread = calculateSupplySpreadVelocity(point, emitter)
    velocityX += jet.x
    velocityX += spread.x
    velocityY += jet.y
    velocityY += spread.y
    velocityZ += jet.z
    velocityZ += spread.z
  }

  for (const attractor of attractors) {
    const sink = calculateReturnFlowVelocity(point, attractor)
    velocityX += sink.x
    velocityY += sink.y
    velocityZ += sink.z
  }

  const recirculation = calculateRoomRecirculationVelocity(
    point,
    emitters,
    attractors,
    bounds,
  )
  velocityX += recirculation.x
  velocityY += recirculation.y
  velocityZ += recirculation.z

  if (emitters.length > 0) {
    const supplyAverage =
      emitters.reduce((sum, emitter) => sum + emitter.temperature, 0) / emitters.length
    const height = Math.max(bounds.max.y - bounds.min.y, 0.1)
    const normalizedHeight = clamp01((point.y - bounds.min.y) / height)
    const buoyancy = clamp((supplyAverage - ambientTemperature) * 0.006, -0.08, 0.08)
    velocityY += buoyancy * (1 - normalizedHeight * 0.4)
  }

  const damping = calculateWallDamping(point, bounds)

  return {
    x: velocityX * damping,
    y: velocityY * damping,
    z: velocityZ * damping,
  }
}

function calculateTemperatureAt(
  point: Vector3Like,
  emitters: ParticleEmitter[],
  ambientTemperature: number,
  bounds: Bounds3D,
): number {
  let temperature = ambientTemperature

  for (const emitter of emitters) {
    const relX = point.x - emitter.position[0]
    const relY = point.y - emitter.position[1]
    const relZ = point.z - emitter.position[2]
    const along =
      relX * emitter.direction[0]
      + relY * emitter.direction[1]
      + relZ * emitter.direction[2]

    if (along < -0.2) continue

    const projectedX = emitter.direction[0] * Math.max(along, 0)
    const projectedY = emitter.direction[1] * Math.max(along, 0)
    const projectedZ = emitter.direction[2] * Math.max(along, 0)
    const radialDistance = Math.hypot(
      relX - projectedX,
      relY - projectedY,
      relZ - projectedZ,
    )
    const spread = emitter.radius + Math.tan(emitter.spreadAngle) * (0.4 + Math.max(along, 0))
    const plume = Math.exp(-(radialDistance ** 2) / (2 * spread * spread))
      * Math.exp(-Math.max(along, 0) / 3.25)

    temperature += (emitter.temperature - ambientTemperature) * plume
  }

  const roomHeight = Math.max(bounds.max.y - bounds.min.y, 0.1)
  const normalizedHeight = clamp01((point.y - bounds.min.y) / roomHeight)
  temperature += lerp(-0.25, 0.6, normalizedHeight)

  return temperature
}

export function createEmittersFromDiffusers(
  diffusers: DiffuserInfo[],
  supplyTemp: number,
  totalAirflowRate?: number,
): ParticleEmitter[] {
  const distributedAirflows = distributeAirflowAcrossDiffusers(diffusers, totalAirflowRate)

  return diffusers.map((diffuser, index) => {
    const direction = normalizeVector(diffuser.direction)
    const footprint = Math.max(diffuser.dimensions[0], diffuser.dimensions[2], 0.15)
    const resolvedAirflow = distributedAirflows?.[index]
    const velocity =
      resolvedAirflow !== undefined
        ? convertAirflowRateToVelocity(resolvedAirflow, diffuser)
        : diffuser.airflowRate
    const emissionRate =
      resolvedAirflow !== undefined
        ? Math.round(clamp(72 + resolvedAirflow * 0.65 + footprint * 60, 90, 280))
        : Math.round(clamp(48 + diffuser.airflowRate * 120 + footprint * 50, 80, 240))

    return {
      id: diffuser.id || `emitter_${index}`,
      position: diffuser.position,
      direction,
      velocity,
      temperature: supplyTemp,
      spreadAngle: diffuser.spreadAngle,
      emissionRate,
      radius: clamp(footprint * 0.24, 0.1, 0.3),
    }
  })
}

export function createAttractorsFromDiffusers(
  diffusers: DiffuserInfo[],
  totalAirflowRate?: number,
): ParticleAttractor[] {
  const distributedAirflows = distributeAirflowAcrossDiffusers(diffusers, totalAirflowRate)

  return diffusers.map((diffuser, index) => {
    const footprint = Math.max(diffuser.dimensions[0], diffuser.dimensions[2], 0.2)
    const radius = clamp(footprint * 1.15, 0.35, 1.25)
    const resolvedAirflow = distributedAirflows?.[index]
    const resolvedVelocity =
      resolvedAirflow !== undefined
        ? convertAirflowRateToVelocity(resolvedAirflow, diffuser)
        : diffuser.airflowRate

    return {
      id: diffuser.id || `collector_${index}`,
      position: diffuser.position,
      strength: clamp(resolvedVelocity * 0.95, 0.28, 1.35),
      radius,
      heatRemovalRate: clamp(0.14 + resolvedVelocity * 0.05, 0.14, 0.24),
      removalRadius: radius * 0.85,
      sinkStrength: clamp(0.9 + resolvedVelocity * 0.18, 0.9, 1.35),
    }
  })
}

export function generateMockVelocityField(
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  options: MockCFDOptions,
): VelocityField3D {
  const [nx, ny, nz] = options.gridResolution
  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const point = getCellCenter(options.roomBounds, options.gridResolution, x, y, z)
        const velocity = calculateVelocityAt(
          point,
          emitters,
          attractors,
          options.roomBounds,
          options.ambientTemperature,
        )

        data.push(velocity.x, velocity.y, velocity.z)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [options.roomBounds.min.x, options.roomBounds.min.y, options.roomBounds.min.z],
      max: [options.roomBounds.max.x, options.roomBounds.max.y, options.roomBounds.max.z],
    },
    data,
  }
}

export function generateMockTemperatureField(
  emitters: ParticleEmitter[],
  ambientTemp: number,
  options: MockCFDOptions,
): TemperatureField3D {
  const [nx, ny, nz] = options.gridResolution
  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const point = getCellCenter(options.roomBounds, options.gridResolution, x, y, z)
        data.push(calculateTemperatureAt(point, emitters, ambientTemp, options.roomBounds))
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [options.roomBounds.min.x, options.roomBounds.min.y, options.roomBounds.min.z],
      max: [options.roomBounds.max.x, options.roomBounds.max.y, options.roomBounds.max.z],
    },
    data,
  }
}

export function generateMockPressureField(
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  options: MockCFDOptions,
): PressureField3D {
  const [nx, ny, nz] = options.gridResolution
  const data: number[] = []

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const point = getCellCenter(options.roomBounds, options.gridResolution, x, y, z)
        let pressure = 0

        for (const emitter of emitters) {
          const dist = Math.hypot(
            point.x - emitter.position[0],
            point.y - emitter.position[1],
            point.z - emitter.position[2],
          )
          pressure += 0.18 * Math.exp(-dist / 1.5)
        }

        for (const attractor of attractors) {
          const dist = Math.hypot(
            point.x - attractor.position[0],
            point.y - attractor.position[1],
            point.z - attractor.position[2],
          )
          pressure -= attractor.strength * Math.exp(-dist / Math.max(attractor.radius, 0.25))
        }

        data.push(pressure)
      }
    }
  }

  return {
    gridResolution: [nx, ny, nz],
    bounds: {
      min: [options.roomBounds.min.x, options.roomBounds.min.y, options.roomBounds.min.z],
      max: [options.roomBounds.max.x, options.roomBounds.max.y, options.roomBounds.max.z],
    },
    data,
  }
}

export function generateMockCFDData(
  supplyDiffusers: DiffuserInfo[],
  returnDiffusers: DiffuserInfo[],
  options: MockCFDOptions,
  airflowRate?: number,
): ParticleSystemData {
  const emitters = createEmittersFromDiffusers(
    supplyDiffusers,
    options.supplyTemperature,
    airflowRate,
  )
  const attractors = createAttractorsFromDiffusers(returnDiffusers, airflowRate)

  return {
    emitters,
    attractors,
    velocityField: generateMockVelocityField(emitters, attractors, options),
    temperatureField: generateMockTemperatureField(emitters, options.ambientTemperature, options),
    pressureField: generateMockPressureField(emitters, attractors, options),
  }
}

export function buildParticleSystemNodeConfig({
  levelId = null,
  zoneId = null,
  heatmapNodeId = null,
  supplyDiffusers,
  returnDiffusers,
  roomBounds,
  ambientTemperature,
  supplyTemperature,
  airflowRate,
  gridResolution,
  particleCount,
  particleLifetime,
  colorScheme = 'jet',
  temperatureGrid3D,
  velocityGrid3D,
  velocityGrid3DDirection,
}: BuildParticleSystemConfigOptions): ParticleSystemNodeType {
  const resolvedGridResolution =
    gridResolution
    ?? inferGridResolutionFromTemperatureGrid(temperatureGrid3D)
    ?? DEFAULT_GRID_RESOLUTION

  const mockData = generateMockCFDData(supplyDiffusers, returnDiffusers, {
    roomBounds,
    ambientTemperature,
    supplyTemperature,
    gridResolution: resolvedGridResolution,
  }, airflowRate)

  const temperatureField = temperatureGrid3D?.length
    ? createTemperatureFieldFromHeatmapData(temperatureGrid3D, roomBounds)
    : mockData.temperatureField

  const velocityField =
    velocityGrid3D?.length && velocityGrid3DDirection?.length
      ? blendVelocityFields(
          createVelocityFieldFromHeatmapData(
            velocityGrid3D,
            velocityGrid3DDirection,
            roomBounds,
          ),
          mockData.velocityField,
        )
      : mockData.velocityField

  const temperatureRange = getTemperatureRange(temperatureField.data)
  const emitterCount = Math.max(mockData.emitters.length, 1)
  const resolvedParticleCount =
    particleCount
    ?? clamp(Math.round(900 + emitterCount * 650), 1200, 4200)

  return ParticleSystemNode.parse({
    levelId,
    zoneId,
    heatmapNodeId,
    particleCount: resolvedParticleCount,
    particleSize: 0.034,
    particleLifetime: particleLifetime ?? 8,
    emitters: mockData.emitters,
    attractors: mockData.attractors,
    velocityField,
    temperatureField,
    pressureField: mockData.pressureField,
    heatDepositionRate: 0.18,
    heatDecayRate: 0.05,
    ambientTemperature,
    heatExchangeRate: 1.35,
    temperatureRange,
    colorByTemperature: true,
    colorScheme,
    showTrails: false,
    trailLength: 14,
    trailFade: 2.4,
    particleOpacity: 0.82,
    enablePressure: false,
    enableBuoyancy: false,
    enableSink: true,
    pressureStrength: 0.18,
    buoyancyStrength: 0.15,
    sinkStrength: 0.95,
    enabled: mockData.emitters.length > 0,
  })
}
