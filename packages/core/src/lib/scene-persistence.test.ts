import { describe, expect, it } from 'bun:test'
import { sanitizeSceneNodesForPersistence } from './scene-persistence'

describe('sanitizeSceneNodesForPersistence', () => {
  it('strips transient GINOT fields and volatile particle metadata from heatmaps', () => {
    const nodes = {
      heatmap_1: {
        id: 'heatmap_1',
        type: 'heatmap',
        metadata: {
          label: 'keep-me',
          particleSystem: {
            emitterCount: 12,
          },
        },
        data: {
          gridSize: 20,
          temperatureGrid: [],
          velocityGrid: [],
          averageTemperature: 0,
          pmv: 0,
          comfortScore: 0,
          verticalLevels: 25,
          ginotPointCloud: [
            {
              position: [0, 0, 0],
              velocity: [0, 0, 0],
              pressure: 0,
              speed: 0,
            },
          ],
          speedField: [1],
          pressureField: [2],
        },
      },
    } as any

    const sanitized = sanitizeSceneNodesForPersistence(nodes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = sanitized.heatmap_1 as any

    expect(result.metadata).toEqual({
      label: 'keep-me',
    })
    expect(result.data.ginotPointCloud).toBeUndefined()
    expect(result.data.speedField).toBeUndefined()
    expect(result.data.pressureField).toBeUndefined()
  })
})
