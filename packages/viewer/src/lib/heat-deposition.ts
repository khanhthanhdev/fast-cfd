/**
 * Flat field resolution aligned with nested heat grids:
 * `[cols(x), verticalLevels(y), rows(z)]` for nested `[verticalLevel][row][col]`.
 */
export type HeatGridResolution = [colsX: number, verticalLevelsY: number, rowsZ: number]

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

function isActiveHeatCell(value: number, ambientTemp: number): boolean {
  return Math.abs(value - ambientTemp) > ACTIVE_HEAT_EPSILON
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
