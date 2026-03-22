import { describe, expect, it } from 'bun:test'
import { sanitizeSceneNodesForPersistence } from './scene-persistence'

describe('sanitizeSceneNodesForPersistence', () => {
  it('excludes heatmap nodes entirely', () => {
    const nodes = {
      heatmap_1: {
        id: 'heatmap_1',
        type: 'heatmap',
        metadata: { label: 'keep-me' },
        data: {
          gridSize: 20,
          temperatureGrid: [],
          velocityGrid: [],
          averageTemperature: 0,
          pmv: 0,
          comfortScore: 0,
          verticalLevels: 25,
        },
      },
      wall_1: {
        id: 'wall_1',
        type: 'wall',
        metadata: {},
      },
    } as any

    const sanitized = sanitizeSceneNodesForPersistence(nodes)

    expect(sanitized.heatmap_1).toBeUndefined()
    expect(sanitized.wall_1).toBeDefined()
  })
})
