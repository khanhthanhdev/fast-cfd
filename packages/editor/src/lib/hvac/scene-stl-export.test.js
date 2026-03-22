import { afterEach, describe, expect, it, mock } from 'bun:test'
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'

const sceneRegistry = {
  nodes: new Map(),
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

const { buildExportScene, exportSceneToStlBlob } = await import('./scene-stl-export')
const { getZoneNodeFromSceneNodes, isMeshInZone } = await import('./scene-stl-export-utils')

afterEach(() => {
  sceneRegistry.nodes.clear()

  for (const ids of Object.values(sceneRegistry.byType)) {
    ids.clear()
  }

  mockSceneState.nodes = {}
})

describe('buildExportScene', () => {
  it('resolves the selected zone from scene nodes instead of the object registry', () => {
    const zoneId = 'zone_test'
    const zone = getZoneNodeFromSceneNodes(
      {
        [zoneId]: createZoneNode(zoneId, [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
        ]),
      },
      zoneId,
    )

    expect(zone).toEqual(
      createZoneNode(zoneId, [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    )
  })

  it('filters meshes using the selected zone polygon', () => {
    const sceneGroup = new Group()
    const insideMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    insideMesh.position.set(1, 0.5, 1)

    const outsideMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    outsideMesh.position.set(8, 0.5, 8)

    sceneGroup.add(insideMesh, outsideMesh)
    sceneGroup.updateMatrixWorld(true)

    const zone = createZoneNode('zone_test', [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ])

    expect(isMeshInZone(insideMesh, zone)).toBe(true)
    expect(isMeshInZone(outsideMesh, zone)).toBe(false)
  })

  it('uses the polygon instead of only the zone bounding box', () => {
    const sceneGroup = new Group()
    const insideMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    insideMesh.position.set(0.5, 0.5, 3)

    const boxedButOutsideMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    boxedButOutsideMesh.position.set(3, 0.5, 3)

    sceneGroup.add(insideMesh, boxedButOutsideMesh)
    sceneGroup.updateMatrixWorld(true)

    const zone = createZoneNode('zone_test', [
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ])

    expect(isMeshInZone(insideMesh, zone)).toBe(true)
    expect(isMeshInZone(boxedButOutsideMesh, zone)).toBe(false)
  })

  it('excludes helper, glass, invisible, and hitbox meshes from the export scene', () => {
    const sceneGroup = new Group()

    const validMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())

    const glassMesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ opacity: 0.35, transparent: true, name: 'glass' }),
    )

    const invisibleMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
    invisibleMesh.visible = false

    const hitboxMaterial = new MeshBasicMaterial()
    hitboxMaterial.visible = false
    const hitboxMesh = new Mesh(new BoxGeometry(1, 1, 1), hitboxMaterial)

    const helperMesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())

    sceneGroup.add(validMesh, glassMesh, invisibleMesh, hitboxMesh, helperMesh)
    sceneGroup.updateMatrixWorld(true)

    sceneRegistry.nodes.set('heatmap_helper', helperMesh)
    sceneRegistry.byType.heatmap.add('heatmap_helper')

    const exportScene = buildExportScene(sceneGroup)

    expect(exportScene.children).toHaveLength(1)
  })

  it('returns undefined when the selected zone is missing from scene nodes', () => {
    expect(getZoneNodeFromSceneNodes({}, 'zone_missing')).toBeUndefined()
  })

  it('returns a binary STL blob suitable for multipart upload', async () => {
    const sceneGroup = new Group()
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())

    sceneGroup.add(mesh)
    sceneGroup.updateMatrixWorld(true)

    const blob = await exportSceneToStlBlob(sceneGroup)
    const arrayBuffer = await blob.arrayBuffer()

    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/octet-stream')
    expect(arrayBuffer.byteLength).toBeGreaterThan(84)
  })
})

function createZoneNode(id, polygon) {
  return {
    id,
    type: 'zone',
    polygon,
  }
}
