import { describe, expect, it } from 'bun:test'
import { buildGinotHeatmapGrids } from './ginot-heatmap-builder'

describe('buildGinotHeatmapGrids', () => {
  it('builds complete speed and pressure grids from a single centered sample', () => {
    const grids = buildGinotHeatmapGrids(
      {
        positions: [[0.5, 0.5, 0.5]],
        velocities: [[3, 4, 0]],
        pressure: [10],
        speed: [5],
      },
      {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        gridSize: 3,
        verticalLevels: 3,
        sliceHeight: 0.5,
      },
    )

    expect(grids.velocityGrid3D).toHaveLength(3)
    expect(grids.velocityGrid3D[0]).toHaveLength(3)
    expect(grids.velocityGrid3D[0]?.[0]).toHaveLength(3)

    for (const level of grids.velocityGrid3D) {
      for (const row of level) {
        expect(row).toEqual([5, 5, 5])
      }
    }

    for (const level of grids.pressureGrid3D) {
      for (const row of level) {
        expect(row).toEqual([10, 10, 10])
      }
    }

    for (const row of grids.velocityDirection) {
      for (const cell of row) {
        expect(cell.x).toBeCloseTo(0.6, 5)
        expect(cell.y).toBeCloseTo(0.8, 5)
        expect(cell.z).toBeCloseTo(0, 5)
      }
    }
  })

  it('uses the occupant-height slice when projecting the 3D field back to 2D', () => {
    const grids = buildGinotHeatmapGrids(
      {
        positions: [
          [0.5, 0, 0.5],
          [0.5, 1, 0.5],
        ],
        velocities: [
          [1, 0, 0],
          [0, 1, 0],
        ],
        pressure: [10, 90],
        speed: [1, 9],
      },
      {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 1, y: 1, z: 1 },
      },
      {
        gridSize: 3,
        verticalLevels: 3,
        sliceHeight: 1,
      },
    )

    for (const row of grids.velocityGrid) {
      expect(row).toEqual([9, 9, 9])
    }

    for (const row of grids.pressureGrid) {
      expect(row).toEqual([90, 90, 90])
    }

    for (const row of grids.velocityDirection) {
      for (const cell of row) {
        expect(cell.x).toBeCloseTo(0, 5)
        expect(cell.y).toBeCloseTo(1, 5)
        expect(cell.z).toBeCloseTo(0, 5)
      }
    }
  })
})
