import type { TemperatureField3D, ParticleAttractor } from '@pascal-app/core'
import type { ParticleData } from './particle-system'

/**
 * Convert flat TemperatureField3D data to 3D array
 */
export function temperatureFieldTo3DArray(
  field: TemperatureField3D,
): number[][][] {
  const [nx, ny, nz] = field.gridResolution
  const grid: number[][][] = []

  for (let k = 0; k < nz; k++) {
    grid[k] = []
    for (let j = 0; j < ny; j++) {
      grid[k]![j] = []
      for (let i = 0; i < nx; i++) {
        const idx = k * ny * nx + j * nx + i
        grid[k]![j]![i] = field.data[idx] ?? 293
      }
    }
  }

  return grid
}

/**
 * Convert 3D array back to flat TemperatureField3D data
 */
export function temperatureFieldFrom3DArray(
  grid: number[][][],
  field: TemperatureField3D,
): void {
  const [nx, ny, nz] = field.gridResolution

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = k * ny * nx + j * nx + i
        field.data[idx] = grid[k]?.[j]?.[i] ?? 293
      }
    }
  }
}

interface HeatDepositionParams {
  particleData: ParticleData
  temperatureGrid3D: number[][][]
  gridResolution: [number, number, number]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  depositionRate: number
  decayRate: number
  ambientTemp: number
  deltaTime: number
}

interface HeatRemovalParams {
  temperatureGrid3D: number[][][]
  gridResolution: [number, number, number]
  bounds: { min: [number, number, number]; max: [number, number, number] }
  attractors: ParticleAttractor[]
  ambientTemperature: number
  deltaTime: number
}

/**
 * Deposit heat from particles to 3D temperature grid
 */
export function depositHeatToGrid(params: HeatDepositionParams): void {
  const {
    particleData,
    temperatureGrid3D,
    gridResolution,
    bounds,
    depositionRate,
    decayRate,
    ambientTemp,
    deltaTime,
  } = params
  const [nx, ny, nz] = gridResolution

  // 1. Apply decay to existing heat (cooling toward ambient)
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const current = temperatureGrid3D[k]?.[j]?.[i] ?? ambientTemp
        temperatureGrid3D[k]![j]![i] = current + (ambientTemp - current) * decayRate * deltaTime
      }
    }
  }

  // 2. Deposit heat from particles
  for (let p = 0; p < particleData.positions.length / 3; p++) {
    if (particleData.lifetimes[p]! <= 0) continue

    const x = particleData.positions[p * 3]!
    const y = particleData.positions[p * 3 + 1]!
    const z = particleData.positions[p * 3 + 2]!

    // Convert world position to grid coordinates
    const gx = Math.floor(((x - bounds.min[0]) / (bounds.max[0] - bounds.min[0])) * (nx - 1))
    const gy = Math.floor(((y - bounds.min[1]) / (bounds.max[1] - bounds.min[1])) * (ny - 1))
    const gz = Math.floor(((z - bounds.min[2]) / (bounds.max[2] - bounds.min[2])) * (nz - 1))

    // Clamp to grid bounds
    const cellX = Math.max(0, Math.min(nx - 1, gx))
    const cellY = Math.max(0, Math.min(ny - 1, gy))
    const cellZ = Math.max(0, Math.min(nz - 1, gz))

    // Get particle temperature (from colors or stored data)
    const particleTemp = getParticleTemperature(particleData, p)

    // Deposit heat
    const currentTemp = temperatureGrid3D[cellZ]?.[cellY]?.[cellX] ?? ambientTemp
    temperatureGrid3D[cellZ]![cellY]![cellX] =
      currentTemp + (particleTemp - ambientTemp) * depositionRate * deltaTime
  }
}

/**
 * Remove heat at return/exhaust diffuser locations
 */
export function removeHeatAtDiffusers(params: HeatRemovalParams): void {
  const {
    temperatureGrid3D,
    gridResolution,
    bounds,
    attractors,
    ambientTemperature,
    deltaTime,
  } = params

  const [nx, ny, nz] = gridResolution

  for (const attractor of attractors) {
    if (attractor.heatRemovalRate <= 0) continue

    // Convert attractor position to grid coordinates
    const ax = attractor.position[0]
    const ay = attractor.position[1]
    const az = attractor.position[2]

    const gx = Math.floor(((ax - bounds.min[0]) / (bounds.max[0] - bounds.min[0])) * (nx - 1))
    const gy = Math.floor(((ay - bounds.min[1]) / (bounds.max[1] - bounds.min[1])) * (ny - 1))
    const gz = Math.floor(((az - bounds.min[2]) / (bounds.max[2] - bounds.min[2])) * (nz - 1))

    // Spherical removal radius in grid cells
    const minCellSize = Math.min(
      (bounds.max[0] - bounds.min[0]) / nx,
      (bounds.max[1] - bounds.min[1]) / ny,
      (bounds.max[2] - bounds.min[2]) / nz,
    )
    const radiusCells = attractor.removalRadius / minCellSize
    const radiusSq = radiusCells * radiusCells

    // Remove heat in spherical region around diffuser
    const startK = Math.max(0, gz - Math.ceil(radiusCells))
    const endK = Math.min(nz - 1, gz + Math.ceil(radiusCells))
    const startJ = Math.max(0, gy - Math.ceil(radiusCells))
    const endJ = Math.min(ny - 1, gy + Math.ceil(radiusCells))
    const startI = Math.max(0, gx - Math.ceil(radiusCells))
    const endI = Math.min(nx - 1, gx + Math.ceil(radiusCells))

    for (let k = startK; k <= endK; k++) {
      for (let j = startJ; j <= endJ; j++) {
        for (let i = startI; i <= endI; i++) {
          const dx = i - gx
          const dy = j - gy
          const dz = k - gz
          const distSq = dx * dx + dy * dy + dz * dz

          if (distSq <= radiusSq) {
            const currentTemp = temperatureGrid3D[k]?.[j]?.[i] ?? ambientTemperature

            // Linear interpolation: full removal at center, zero at edge
            const falloff = 1 - Math.sqrt(distSq / radiusSq)
            const removalAmount =
              (currentTemp - ambientTemperature) * attractor.heatRemovalRate * falloff * deltaTime

            temperatureGrid3D[k]![j]![i] = currentTemp - removalAmount
          }
        }
      }
    }
  }
}

function getParticleTemperature(particleData: ParticleData, index: number): number {
  // Extract temperature from particle color
  const r = particleData.colors[index * 3]!
  const g = particleData.colors[index * 3 + 1]!
  const b = particleData.colors[index * 3 + 2]!

  // Simple heuristic: red = hot, blue = cold
  const t = (r - b + 1) / 2 // 0-1 range
  return 288 + t * 15 // 288K-303K range
}
