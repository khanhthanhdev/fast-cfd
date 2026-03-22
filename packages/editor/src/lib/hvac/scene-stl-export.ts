/**
 * Scene-to-STL export helper for HVAC analysis
 *
 * This module provides reusable STL export functionality that returns
 * an in-memory Blob instead of triggering a download. Used by the GINOT
 * mesh inference flow to send room geometry to the backend.
 */

import { Mesh, type Object3D, Scene } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import type { ZoneNode } from '@pascal-app/core'
import { sceneRegistry, useScene } from '@pascal-app/core'
import { getZoneNodeFromSceneNodes, isMeshInZone } from './scene-stl-export-utils'

/** Node types that should NOT be exported in STL */
const EXCLUDED_NODE_TYPES = new Set(['zone', 'guide', 'scan', 'heatmap', 'particle-system'])

/** Mesh names that should never appear in STL */
const EXCLUDED_MESH_NAMES = new Set(['collision-mesh', 'ceiling-grid', 'cutout'])

/**
 * Check if an Object3D is registered in the sceneRegistry under an excluded node type.
 */
function isExcludedNode(obj: Object3D): boolean {
  for (const type of EXCLUDED_NODE_TYPES) {
    const ids = sceneRegistry.byType[type as keyof typeof sceneRegistry.byType]
    if (!ids) continue
    for (const id of ids) {
      if (sceneRegistry.nodes.get(id) === obj) return true
    }
  }
  return false
}

/**
 * Returns true when a mesh should be skipped because it uses a glass / transparent material.
 */
function isGlassMesh(mesh: Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.some(
    (mat) =>
      mat.name === 'glass' ||
      mat.name === 'door-glass' ||
      (mat.transparent === true && mat.opacity < 0.5),
  )
}

/**
 * Returns true when a mesh uses an invisible / hitbox-only material.
 */
function isHitboxMesh(mesh: Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.some((mat) => (mat as any).visible === false)
}

/**
 * Returns true if a mesh should be included in the STL export.
 */
function isExportableMesh(mesh: Mesh): boolean {
  if (!mesh.visible) return false
  if (EXCLUDED_MESH_NAMES.has(mesh.name)) return false
  if (isHitboxMesh(mesh)) return false
  if (isGlassMesh(mesh)) return false

  const geo = mesh.geometry
  if (!geo) return false

  const pos = geo.getAttribute('position')
  if (!pos || pos.count === 0) return false

  // Skip degenerate placeholder geometries
  if (!geo.boundingBox) geo.computeBoundingBox()
  const bb = geo.boundingBox
  if (bb) {
    const sx = bb.max.x - bb.min.x
    const sy = bb.max.y - bb.min.y
    const sz = bb.max.z - bb.min.z
    if (sx < 0.0001 && sy < 0.0001 && sz < 0.0001) return false
  }

  return true
}

function getZoneNode(zoneId: string): ZoneNode | undefined {
  const nodes = useScene.getState().nodes
  return getZoneNodeFromSceneNodes(nodes, zoneId) as ZoneNode | undefined
}

/**
 * Build a flat Scene of cloned meshes for STL export.
 *
 * @param sceneGroup - The root scene object to export
 * @param options - Export options
 * @returns A Scene containing only exportable meshes
 */
export function buildExportScene(
  sceneGroup: Object3D,
  options?: {
    zoneId?: string
    levelId?: string
  }
): Scene {
  sceneGroup.updateMatrixWorld(true)

  const exportScene = new Scene()
  const zone = options?.zoneId ? getZoneNode(options.zoneId) : undefined

  if (options?.zoneId && !zone) {
    return exportScene
  }

  sceneGroup.traverse((obj) => {
    // Skip excluded node types
    if (isExcludedNode(obj)) return

    if (!(obj as Mesh).isMesh) return

    const mesh = obj as Mesh

    // Filter by zone if specified
    if (zone?.polygon && !isMeshInZone(mesh, zone)) {
      return
    }

    if (!isExportableMesh(mesh)) return

    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)

    const exportMesh = new Mesh(geo)
    exportScene.add(exportMesh)
  })

  return exportScene
}

/**
 * Export scope for analysis
 */
export interface ExportScope {
  levelId?: string
  zoneId?: string
}

/**
 * Export scene to STL blob for HVAC analysis.
 *
 * @param sceneGroup - The root scene object (typically 'scene-renderer')
 * @param scope - Optional scope to limit exported geometry
 * @returns STL binary blob
 */
export async function exportSceneToStlBlob(
  sceneGroup: Object3D,
  scope?: ExportScope
): Promise<Blob> {
  const exportScene = buildExportScene(sceneGroup, scope)
  const exporter = new STLExporter()
  const result = exporter.parse(exportScene, { binary: true })
  return new Blob([result], { type: 'application/octet-stream' })
}

/**
 * Get estimated face count for an STL export (for progress indication)
 */
export function estimateFaceCount(sceneGroup: Object3D): number {
  let count = 0

  sceneGroup.traverse((obj) => {
    if (isExcludedNode(obj)) return
    if (!(obj as Mesh).isMesh) return

    const mesh = obj as Mesh
    if (!isExportableMesh(mesh)) return

    const geo = mesh.geometry
    if (geo.index) {
      count += geo.index.count / 3
    } else if (geo.attributes.position) {
      count += geo.attributes.position.count / 3
    }
  })

  return Math.floor(count)
}
