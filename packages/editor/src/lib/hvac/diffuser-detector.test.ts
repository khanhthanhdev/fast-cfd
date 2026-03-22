import { afterEach, describe, expect, it, mock } from 'bun:test'
import { Group } from 'three'

const sceneRegistry = {
  nodes: new Map<string, Group>(),
  byType: {
    site: new Set(),
    building: new Set(),
    ceiling: new Set(),
    level: new Set(),
    wall: new Set(),
    item: new Set(),
    slab: new Set(),
    zone: new Set(),
    roof: new Set(),
    scan: new Set(),
    guide: new Set(),
    window: new Set(),
    door: new Set(),
    heatmap: new Set(),
    'particle-system': new Set(),
  },
}

const mockSceneState = {
  nodes: {},
}

mock.module('@pascal-app/core', () => ({
  getScaledDimensions: () => [0.6, 0.15, 0.6],
  sceneRegistry,
  useScene: {
    getState: () => mockSceneState,
  },
}))

const { findAllDiffusers, findDiffusersInZone } = await import('./diffuser-detector')

afterEach(() => {
  sceneRegistry.nodes.clear()
})

describe('diffuser-detector', () => {
  it('reads diffuser world position and direction from the scene registry', () => {
    const parent = new Group()
    parent.position.set(10, 0, 5)
    parent.rotation.y = Math.PI / 2

    const diffuserObject = new Group()
    diffuserObject.position.set(1, 2, 3)

    parent.add(diffuserObject)
    parent.updateMatrixWorld(true)

    sceneRegistry.nodes.set('item_1', diffuserObject)

    const [diffuser] = findAllDiffusers({
      item_1: createItemNode('item_1'),
    })

    expect(diffuser).toBeDefined()
    if (!diffuser) {
      throw new Error('Expected diffuser')
    }

    expect(roundVector(diffuser.position)).toEqual([13, 2, 4])
    expect(roundVector(diffuser.direction)).toEqual([-1, 0, 0])
  })

  it('filters zone diffusers using the world-space position', () => {
    const parent = new Group()
    parent.position.set(10, 0, 5)

    const diffuserObject = new Group()
    diffuserObject.position.set(2, 2, 2)
    parent.add(diffuserObject)
    parent.updateMatrixWorld(true)

    sceneRegistry.nodes.set('item_2', diffuserObject)

    const diffusers = findDiffusersInZone(
      'zone_1',
      { item_2: createItemNode('item_2') },
      [
        [11, 6],
        [13, 6],
        [13, 8],
        [11, 8],
      ],
    )

    expect(diffusers).toHaveLength(1)
    expect(diffusers[0]).toBeDefined()
    if (!diffusers[0]) {
      throw new Error('Expected diffuser in zone')
    }

    expect(roundVector(diffusers[0].position)).toEqual([12, 2, 7])
  })
})

function createItemNode(id: string) {
  return {
    id,
    type: 'item',
    position: [1, 2, 3],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    parentId: 'wall_1',
    visible: true,
    children: [],
    asset: {
      id: 'diffuser-in',
      category: 'hvac',
      name: 'Supply Diffuser',
      thumbnail: '',
      src: '',
      dimensions: [0.6, 0.15, 0.6],
      attachTo: 'wall',
      tags: ['hvac', 'supply', 'wall'],
      offset: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    },
    metadata: {},
  } as any
}

function roundVector(vector: [number, number, number]): [number, number, number] {
  return vector.map((value) => {
    const rounded = Number(value.toFixed(6))
    return Object.is(rounded, -0) ? 0 : rounded
  }) as [number, number, number]
}
