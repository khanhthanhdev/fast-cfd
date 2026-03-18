import type { LevelNode, ZoneNode } from '@pascal-app/core'
import type { HVACBoundaryConditions } from '../../store/use-hvac-scenarios'

/**
 * Room geometry for AI inference
 */
export interface RoomGeometry {
  length: number // m
  width: number // m
  height: number // m
  windowArea: number // m²
  wallExposureRatio: number // 0-1
}

/**
 * Builds the AI input feature vector as specified in PRD section 7.1
 * [RoomLength, RoomWidth, RoomHeight, WindowArea, WallExposureRatio,
 *  SupplyTemp, AirflowRate, Occupancy, OutdoorTemp,
 *  DiffuserX, DiffuserY, DiffuserZ]
 */
export function buildFeatureVector(
  geometry: RoomGeometry,
  boundary: HVACBoundaryConditions,
): number[] {
  return [
    geometry.length,
    geometry.width,
    geometry.height,
    geometry.windowArea,
    geometry.wallExposureRatio,
    boundary.supplyAirTemp,
    boundary.airflowRate,
    boundary.occupancy,
    boundary.outdoorTemp,
    boundary.diffuserPosition[0],
    boundary.diffuserPosition[1],
    boundary.diffuserPosition[2],
  ]
}

/**
 * Extract room geometry from scene nodes
 */
export function extractRoomGeometry(
  level: LevelNode,
  zone: ZoneNode,
  allNodes: Record<string, any>,
): RoomGeometry {
  // Calculate bounding box from zone polygon
  const polygon = zone.polygon
  const xValues = polygon.map((p) => p[0])
  const zValues = polygon.map((p) => p[1])

  const length = Math.max(...xValues) - Math.min(...xValues)
  const width = Math.max(...zValues) - Math.min(...zValues)

  // Get ceiling height from level or default
  const meta = level.metadata as Record<string, unknown> | undefined
  const height = (typeof meta?.ceilingHeight === 'number' ? meta.ceilingHeight : 2.8)

  // Calculate window area from child door/window nodes
  const windowArea = level.children
    .map((id) => allNodes[id])
    .filter((n) => n?.type === 'window')
    .reduce((sum, w) => sum + ((w?.metadata?.area as number) ?? 0), 0)

  // Wall exposure ratio (simplified: perimeter * height)
  const perimeter = 2 * (length + width)
  const wallArea = perimeter * height
  const wallExposureRatio = windowArea / wallArea || 0

  return {
    length,
    width,
    height,
    windowArea,
    wallExposureRatio,
  }
}
