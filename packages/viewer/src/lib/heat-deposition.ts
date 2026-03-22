import type { ParticleAttractor, TemperatureField3D } from '@pascal-app/core'
import type { ParticleData } from './particle-system'

/**
 * Flat field resolution aligned with nested heat grids:
 * `[cols(x), verticalLevels(y), rows(z)]` for nested `[verticalLevel][row][col]`.
 */
export type HeatGridResolution = [colsX: number, verticalLevelsY: number, rowsZ: number]

interface HeatDepositionParams {
  particleData: ParticleData
  temperatureGrid3D: number[][][]
  gridResolution: HeatGridResolution
  bounds: { min: [number, number, number]; max: [number, number, number] }
  depositionRate: number
  decayRate: number
  ambientTemp: number
  deltaTime: number
  activeCellIndices?: Set<number>
}

interface HeatRemovalParams {
  temperatureGrid3D: number[][][]
  gridResolution: HeatGridResolution
  bounds: { min: [number, number, number]; max: [number, number, number] }
  attractors: ParticleAttractor[]
  ambientTemperature: number
  deltaTime: number
  activeCellIndices?: Set<number>
}

const ACTIVE_HEAT_EPSILON = 1e-3

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function getHeatGridCellIndex(
  cellX: number,
  cellY: number,
  cellZ: number,
  gridResolution: HeatGridResolution,
): number {
  const [nx, , nz] = gridResolution
  return cellY * nz * nx + cellZ * nx + cellX
}

function getHeatGridCellCoordinates(
  cellIndex: number,
  gridResolution: HeatGridResolution,
): [cellX: number, cellY: number, cellZ: number] {
  const [nx, , nz] = gridResolution
  const cellsPerLevel = nz * nx
  const cellY = Math.floor(cellIndex / cellsPerLevel)
  const remainder = cellIndex - cellY * cellsPerLevel
  const cellZ = Math.floor(remainder / nx)
  const cellX = remainder % nx
  return [cellX, cellY, cellZ]
}

function isActiveHeatCell(value: number, ambientTemp: number): boolean {
  return Math.abs(value - ambientTemp) > ACTIVE_HEAT_EPSILON
}

function syncActiveHeatCell(
  activeCellIndices: Set<number> | undefined,
  cellIndex: number,
  value: number,
  ambientTemp: number,
): void {
  if (!activeCellIndices) return

  if (isActiveHeatCell(value, ambientTemp)) {
    activeCellIndices.add(cellIndex)
  } else {
    activeCellIndices.delete(cellIndex)
  }
}

export function createActiveHeatCellSet(
  grid: number[][][],
  gridResolution: HeatGridResolution,
  ambientTemp: number,
): Set<number> {
  const [nx, ny, nz] = gridResolution
  const activeCellIndices = new Set<number>()

  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        const value = grid[y]?.[z]?.[x] ?? ambientTemp
        if (!isActiveHeatCell(value, ambientTemp)) continue

        activeCellIndices.add(getHeatGridCellIndex(x, y, z, gridResolution))
      }
    }
  }

  return activeCellIndices
}

function ensureTemperatureGridRow(
  grid: number[][][],
  levelIndex: number,
  rowIndex: number,
  rowCount: number,
  colCount: number,
  fillValue: number,
): number[] {
  let level = grid[levelIndex]
  if (!level) {
    level = Array.from({ length: rowCount }, () => new Array(colCount).fill(fillValue))
    grid[levelIndex] = level
  }

  let row = level[rowIndex]
  if (!row) {
    row = new Array(colCount).fill(fillValue)
    level[rowIndex] = row
  }

  return row
}

export function temperatureFieldTo3DArray(
  field: TemperatureField3D,
): number[][][] {
  // Flat field data uses [cols(x), verticalLevels(y), rows(z)] and expands to
  // nested [verticalLevel][row][col] for simulation and rendering.
  const [nx, ny, nz] = field.gridResolution
  const grid: number[][][] = Array.from({ length: ny }, () =>
    Array.from({ length: nz }, () => new Array(nx).fill(field.data[0] ?? 22)),
  )

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const index = z * ny * nx + y * nx + x
        grid[y]![z]![x] = field.data[index] ?? 22
      }
    }
  }

  return grid
}

export function temperatureFieldFrom3DArray(
  grid: number[][][],
  field: TemperatureField3D,
): void {
  // Flatten nested [verticalLevel][row][col] back to [cols(x), verticalLevels(y), rows(z)].
  const [nx, ny, nz] = field.gridResolution

  for (let z = 0; z < nz; z++) {
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const index = z * ny * nx + y * nx + x
        field.data[index] = grid[y]?.[z]?.[x] ?? 22
      }
    }
  }
}

export function projectTemperatureGrid3DTo2D(
  grid: number[][][],
  target: number[][],
  sliceIndex?: number,
): void {
  const verticalLevels = grid.length
  const rows = grid[0]?.length ?? 0
  const cols = grid[0]?.[0]?.length ?? 0
  const resolvedSlice = clamp(
    sliceIndex ?? Math.round((verticalLevels - 1) * 0.4),
    0,
    Math.max(verticalLevels - 1, 0),
  )

  for (let row = 0; row < rows; row++) {
    if (!target[row]) {
      target[row] = new Array(cols).fill(0)
    }

    for (let col = 0; col < cols; col++) {
      target[row]![col] = grid[resolvedSlice]?.[row]?.[col] ?? 22
    }
  }
}

export function depositHeatToGrid({
  particleData,
  temperatureGrid3D,
  gridResolution,
  bounds,
  depositionRate,
  decayRate,
  ambientTemp,
  deltaTime,
  activeCellIndices,
}: HeatDepositionParams): void {
  const [nx, ny, nz] = gridResolution

  if (activeCellIndices) {
    for (const cellIndex of activeCellIndices) {
      const [cellX, cellY, cellZ] = getHeatGridCellCoordinates(cellIndex, gridResolution)
      const row = ensureTemperatureGridRow(temperatureGrid3D, cellY, cellZ, nz, nx, ambientTemp)
      const current = row[cellX] ?? ambientTemp
      const next = current + (ambientTemp - current) * decayRate * deltaTime

      row[cellX] = next
      syncActiveHeatCell(activeCellIndices, cellIndex, next, ambientTemp)
    }
  } else {
    for (let y = 0; y < ny; y++) {
      const level = ensureTemperatureGridRow(temperatureGrid3D, y, 0, nz, nx, ambientTemp)

      for (let z = 0; z < nz; z++) {
        const row =
          z === 0 ? level : ensureTemperatureGridRow(temperatureGrid3D, y, z, nz, nx, ambientTemp)

        for (let x = 0; x < nx; x++) {
          const current = row[x] ?? ambientTemp
          row[x] = current + (ambientTemp - current) * decayRate * deltaTime
        }
      }
    }
  }

  const width = Math.max(bounds.max[0] - bounds.min[0], 1e-6)
  const height = Math.max(bounds.max[1] - bounds.min[1], 1e-6)
  const depth = Math.max(bounds.max[2] - bounds.min[2], 1e-6)

  for (let particleIndex = 0; particleIndex < particleData.lifetimes.length; particleIndex++) {
    if ((particleData.lifetimes[particleIndex] ?? 0) <= 0) continue

    const x = particleData.positions[particleIndex * 3] ?? 0
    const y = particleData.positions[particleIndex * 3 + 1] ?? 0
    const z = particleData.positions[particleIndex * 3 + 2] ?? 0
    const temperature = particleData.temperatures[particleIndex] ?? ambientTemp
    const gx = clamp(((x - bounds.min[0]) / width) * (nx - 1), 0, nx - 1)
    const gy = clamp(((y - bounds.min[1]) / height) * (ny - 1), 0, ny - 1)
    const gz = clamp(((z - bounds.min[2]) / depth) * (nz - 1), 0, nz - 1)
    const x0 = Math.floor(gx)
    const y0 = Math.floor(gy)
    const z0 = Math.floor(gz)
    const x1 = Math.min(nx - 1, x0 + 1)
    const y1 = Math.min(ny - 1, y0 + 1)
    const z1 = Math.min(nz - 1, z0 + 1)
    const dx = gx - x0
    const dy = gy - y0
    const dz = gz - z0
    const heatDelta = (temperature - ambientTemp) * depositionRate * deltaTime

    const deposit = (cellX: number, cellY: number, cellZ: number, weight: number) => {
      if (weight <= 0) return
      const row = ensureTemperatureGridRow(temperatureGrid3D, cellY, cellZ, nz, nx, ambientTemp)
      const current = row[cellX] ?? ambientTemp
      const next = current + heatDelta * weight

      row[cellX] = next
      syncActiveHeatCell(
        activeCellIndices,
        getHeatGridCellIndex(cellX, cellY, cellZ, gridResolution),
        next,
        ambientTemp,
      )
    }

    deposit(x0, y0, z0, (1 - dx) * (1 - dy) * (1 - dz))
    deposit(x1, y0, z0, dx * (1 - dy) * (1 - dz))
    deposit(x0, y1, z0, (1 - dx) * dy * (1 - dz))
    deposit(x1, y1, z0, dx * dy * (1 - dz))
    deposit(x0, y0, z1, (1 - dx) * (1 - dy) * dz)
    deposit(x1, y0, z1, dx * (1 - dy) * dz)
    deposit(x0, y1, z1, (1 - dx) * dy * dz)
    deposit(x1, y1, z1, dx * dy * dz)
  }
}

export function removeHeatAtDiffusers({
  temperatureGrid3D,
  gridResolution,
  bounds,
  attractors,
  ambientTemperature,
  deltaTime,
  activeCellIndices,
}: HeatRemovalParams): void {
  const [nx, ny, nz] = gridResolution
  const width = Math.max(bounds.max[0] - bounds.min[0], 1e-6)
  const height = Math.max(bounds.max[1] - bounds.min[1], 1e-6)
  const depth = Math.max(bounds.max[2] - bounds.min[2], 1e-6)

  for (const attractor of attractors) {
    if ((attractor.heatRemovalRate ?? 0) <= 0) continue

    const gridRadius = Math.max(
      attractor.removalRadius / Math.min(width / nx, height / ny, depth / nz),
      1,
    )
    const gx = clamp(((attractor.position[0] - bounds.min[0]) / width) * (nx - 1), 0, nx - 1)
    const gy = clamp(((attractor.position[1] - bounds.min[1]) / height) * (ny - 1), 0, ny - 1)
    const gz = clamp(((attractor.position[2] - bounds.min[2]) / depth) * (nz - 1), 0, nz - 1)
    const minX = Math.max(0, Math.floor(gx - gridRadius))
    const maxX = Math.min(nx - 1, Math.ceil(gx + gridRadius))
    const minY = Math.max(0, Math.floor(gy - gridRadius))
    const maxY = Math.min(ny - 1, Math.ceil(gy + gridRadius))
    const minZ = Math.max(0, Math.floor(gz - gridRadius))
    const maxZ = Math.min(nz - 1, Math.ceil(gz + gridRadius))

    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        const row = ensureTemperatureGridRow(temperatureGrid3D, y, z, nz, nx, ambientTemperature)

        for (let x = minX; x <= maxX; x++) {
          const dx = x - gx
          const dy = y - gy
          const dz = z - gz
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

          if (distance > gridRadius) continue

          const falloff = 1 - distance / gridRadius
          const current = row[x] ?? ambientTemperature
          const removal =
            (current - ambientTemperature)
            * attractor.heatRemovalRate
            * falloff
            * deltaTime
          const next = current - removal

          row[x] = next
          syncActiveHeatCell(
            activeCellIndices,
            getHeatGridCellIndex(x, y, z, gridResolution),
            next,
            ambientTemperature,
          )
        }
      }
    }
  }
}
