import type { GinotInferenceResponse } from './ai-inference-client'
import type { Bounds3D, VelocityDirectionCell } from './cfd-types'

const DEFAULT_GRID_SIZE = 20
const DEFAULT_VERTICAL_LEVELS = 25
const DEFAULT_SLICE_HEIGHT = 1.2
const EPSILON = 1e-6

interface BuildGinotHeatmapOptions {
  gridSize?: number
  verticalLevels?: number
  sliceHeight?: number
}

interface NormalizedGinotPoint {
  x: number
  y: number
  z: number
  speed: number
  pressure: number
  vx: number
  vy: number
  vz: number
}

export interface GinotHeatmapGrids {
  gridSize: number
  verticalLevels: number
  velocityGrid: number[][]
  velocityDirection: VelocityDirectionCell[][]
  velocityGrid3D: number[][][]
  velocityGrid3DDirection: VelocityDirectionCell[][][]
  pressureGrid: number[][]
  pressureGrid3D: number[][][]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createScalarGrid2D(gridSize: number, fill = 0) {
  return Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => fill))
}

function createScalarGrid3D(verticalLevels: number, gridSize: number, fill = 0) {
  return Array.from(
    { length: verticalLevels },
    () => createScalarGrid2D(gridSize, fill),
  )
}

function createDirectionGrid2D(gridSize: number): VelocityDirectionCell[][] {
  return Array.from({ length: gridSize }, () =>
    Array.from({ length: gridSize }, () => ({ x: 0, y: 0, z: 0 })),
  )
}

function createDirectionGrid3D(
  verticalLevels: number,
  gridSize: number,
): VelocityDirectionCell[][][] {
  return Array.from({ length: verticalLevels }, () => createDirectionGrid2D(gridSize))
}

function normalizeToIndex(value: number, min: number, max: number, lastIndex: number) {
  if (!Number.isFinite(value) || lastIndex <= 0 || Math.abs(max - min) < EPSILON) {
    return 0
  }

  return clamp(((value - min) / (max - min)) * lastIndex, 0, lastIndex)
}

function sanitizeNumber(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback
}

function normalizeVelocityDirection(
  vx: number,
  vy: number,
  vz: number,
): VelocityDirectionCell {
  const length = Math.hypot(vx, vy, vz)

  if (length < EPSILON) {
    return { x: 0, y: 0, z: 0 }
  }

  return {
    x: vx / length,
    y: vy / length,
    z: vz / length,
  }
}

function cloneScalarSlice(grid3D: number[][][], sliceIndex: number): number[][] {
  const slice = grid3D[sliceIndex]
  return slice ? slice.map((row) => [...row]) : []
}

function cloneDirectionSlice(
  grid3D: VelocityDirectionCell[][][],
  sliceIndex: number,
): VelocityDirectionCell[][] {
  const slice = grid3D[sliceIndex]
  return slice ? slice.map((row) => row.map((cell) => ({ ...cell }))) : []
}

function resolveSliceIndex(
  bounds: Bounds3D,
  verticalLevels: number,
  sliceHeight: number,
) {
  const clampedHeight = clamp(sliceHeight, bounds.min.y, bounds.max.y)
  return Math.round(
    normalizeToIndex(clampedHeight, bounds.min.y, bounds.max.y, verticalLevels - 1),
  )
}

function findNearestPoint(
  points: NormalizedGinotPoint[],
  targetX: number,
  targetY: number,
  targetZ: number,
): NormalizedGinotPoint | null {
  let nearest: NormalizedGinotPoint | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < points.length; index++) {
    const point = points[index]!
    const dx = point.x - targetX
    const dy = point.y - targetY
    const dz = point.z - targetZ
    const distance = dx * dx + dy * dy + dz * dz

    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = point
    }
  }

  return nearest
}

export function buildGinotHeatmapGrids(
  response: Pick<GinotInferenceResponse, 'positions' | 'velocities' | 'pressure' | 'speed'>,
  bounds: Bounds3D,
  options: BuildGinotHeatmapOptions = {},
): GinotHeatmapGrids {
  const gridSize = options.gridSize ?? DEFAULT_GRID_SIZE
  const verticalLevels = options.verticalLevels ?? DEFAULT_VERTICAL_LEVELS
  const sliceHeight = options.sliceHeight ?? DEFAULT_SLICE_HEIGHT

  const velocityGrid3D = createScalarGrid3D(verticalLevels, gridSize, 0)
  const pressureGrid3D = createScalarGrid3D(verticalLevels, gridSize, 0)
  const velocityGrid3DDirection = createDirectionGrid3D(verticalLevels, gridSize)

  if (response.positions.length === 0) {
    const emptyVelocityGrid = createScalarGrid2D(gridSize, 0)
    const emptyPressureGrid = createScalarGrid2D(gridSize, 0)
    const emptyDirectionGrid = createDirectionGrid2D(gridSize)

    return {
      gridSize,
      verticalLevels,
      velocityGrid: emptyVelocityGrid,
      velocityDirection: emptyDirectionGrid,
      velocityGrid3D,
      velocityGrid3DDirection,
      pressureGrid: emptyPressureGrid,
      pressureGrid3D,
    }
  }

  const speedSums = createScalarGrid3D(verticalLevels, gridSize, 0)
  const pressureSums = createScalarGrid3D(verticalLevels, gridSize, 0)
  const weightSums = createScalarGrid3D(verticalLevels, gridSize, 0)
  const velocityXSums = createScalarGrid3D(verticalLevels, gridSize, 0)
  const velocityYSums = createScalarGrid3D(verticalLevels, gridSize, 0)
  const velocityZSums = createScalarGrid3D(verticalLevels, gridSize, 0)

  const normalizedPoints: NormalizedGinotPoint[] = []

  for (let index = 0; index < response.positions.length; index++) {
    const position = response.positions[index]
    const velocity = response.velocities[index]

    if (!(position && velocity)) {
      continue
    }

    const normalizedX = normalizeToIndex(
      sanitizeNumber(position[0] ?? bounds.min.x),
      bounds.min.x,
      bounds.max.x,
      gridSize - 1,
    )
    const normalizedY = normalizeToIndex(
      sanitizeNumber(position[1] ?? bounds.min.y),
      bounds.min.y,
      bounds.max.y,
      verticalLevels - 1,
    )
    const normalizedZ = normalizeToIndex(
      sanitizeNumber(position[2] ?? bounds.min.z),
      bounds.min.z,
      bounds.max.z,
      gridSize - 1,
    )

    const speed = sanitizeNumber(response.speed[index] ?? 0)
    const pressure = sanitizeNumber(response.pressure[index] ?? 0)
    const vx = sanitizeNumber(velocity[0] ?? 0)
    const vy = sanitizeNumber(velocity[1] ?? 0)
    const vz = sanitizeNumber(velocity[2] ?? 0)

    normalizedPoints.push({
      x: normalizedX,
      y: normalizedY,
      z: normalizedZ,
      speed,
      pressure,
      vx,
      vy,
      vz,
    })

    const x0 = Math.floor(normalizedX)
    const x1 = Math.min(gridSize - 1, x0 + 1)
    const y0 = Math.floor(normalizedY)
    const y1 = Math.min(verticalLevels - 1, y0 + 1)
    const z0 = Math.floor(normalizedZ)
    const z1 = Math.min(gridSize - 1, z0 + 1)

    const tx = normalizedX - x0
    const ty = normalizedY - y0
    const tz = normalizedZ - z0

    const xWeights: [number, number][] = [[x0, 1 - tx], [x1, tx]]
    const yWeights: [number, number][] = [[y0, 1 - ty], [y1, ty]]
    const zWeights: [number, number][] = [[z0, 1 - tz], [z1, tz]]

    for (let yi = 0; yi < yWeights.length; yi++) {
      const [yIndex, yWeight] = yWeights[yi]!
      for (let zi = 0; zi < zWeights.length; zi++) {
        const [zIndex, zWeight] = zWeights[zi]!
        for (let xi = 0; xi < xWeights.length; xi++) {
          const [xIndex, xWeight] = xWeights[xi]!
          const weight = xWeight * yWeight * zWeight

          if (weight <= 0) {
            continue
          }

          const speedRow = speedSums[yIndex]?.[zIndex]
          const pressureRow = pressureSums[yIndex]?.[zIndex]
          const velocityXRow = velocityXSums[yIndex]?.[zIndex]
          const velocityYRow = velocityYSums[yIndex]?.[zIndex]
          const velocityZRow = velocityZSums[yIndex]?.[zIndex]
          const weightRow = weightSums[yIndex]?.[zIndex]

          if (
            !speedRow ||
            !pressureRow ||
            !velocityXRow ||
            !velocityYRow ||
            !velocityZRow ||
            !weightRow
          ) {
            continue
          }

          speedRow[xIndex] = (speedRow[xIndex] ?? 0) + speed * weight
          pressureRow[xIndex] = (pressureRow[xIndex] ?? 0) + pressure * weight
          velocityXRow[xIndex] = (velocityXRow[xIndex] ?? 0) + vx * weight
          velocityYRow[xIndex] = (velocityYRow[xIndex] ?? 0) + vy * weight
          velocityZRow[xIndex] = (velocityZRow[xIndex] ?? 0) + vz * weight
          weightRow[xIndex] = (weightRow[xIndex] ?? 0) + weight
        }
      }
    }
  }

  for (let y = 0; y < verticalLevels; y++) {
    for (let z = 0; z < gridSize; z++) {
      for (let x = 0; x < gridSize; x++) {
        const weight = weightSums[y]?.[z]?.[x] ?? 0

        if (weight > EPSILON) {
          const vx = (velocityXSums[y]?.[z]?.[x] ?? 0) / weight
          const vy = (velocityYSums[y]?.[z]?.[x] ?? 0) / weight
          const vz = (velocityZSums[y]?.[z]?.[x] ?? 0) / weight
          const velocityRow = velocityGrid3D[y]?.[z]
          const pressureRow = pressureGrid3D[y]?.[z]
          const directionRow = velocityGrid3DDirection[y]?.[z]

          if (!(velocityRow && pressureRow && directionRow)) {
            continue
          }

          velocityRow[x] = (speedSums[y]?.[z]?.[x] ?? 0) / weight
          pressureRow[x] = (pressureSums[y]?.[z]?.[x] ?? 0) / weight
          directionRow[x] = normalizeVelocityDirection(vx, vy, vz)
          continue
        }

        const nearestPoint = findNearestPoint(normalizedPoints, x, y, z)

        if (!nearestPoint) {
          continue
        }

        const velocityRow = velocityGrid3D[y]?.[z]
        const pressureRow = pressureGrid3D[y]?.[z]
        const directionRow = velocityGrid3DDirection[y]?.[z]

        if (!(velocityRow && pressureRow && directionRow)) {
          continue
        }

        velocityRow[x] = nearestPoint.speed
        pressureRow[x] = nearestPoint.pressure
        directionRow[x] = normalizeVelocityDirection(
          nearestPoint.vx,
          nearestPoint.vy,
          nearestPoint.vz,
        )
      }
    }
  }

  const sliceIndex = resolveSliceIndex(bounds, verticalLevels, sliceHeight)

  return {
    gridSize,
    verticalLevels,
    velocityGrid: cloneScalarSlice(velocityGrid3D, sliceIndex),
    velocityDirection: cloneDirectionSlice(velocityGrid3DDirection, sliceIndex),
    velocityGrid3D,
    velocityGrid3DDirection,
    pressureGrid: cloneScalarSlice(pressureGrid3D, sliceIndex),
    pressureGrid3D,
  }
}
