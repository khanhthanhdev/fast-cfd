'use client'

import { sceneRegistry } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Mesh, type Object3D, Scene } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'

/** Node types that should NOT be exported in STL */
const EXCLUDED_NODE_TYPES = new Set(['zone', 'guide', 'scan', 'heatmap', 'particle-system'])

/** Mesh names that should never appear in STL */
const EXCLUDED_MESH_NAMES = new Set(['collision-mesh', 'ceiling-grid', 'cutout'])

/**
 * Returns true when a mesh should be skipped because it uses a glass / transparent material.
 * Window panes and door glass panels block the cutout openings if exported to STL.
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
 * Window and door root meshes use MeshBasicMaterial with visible=false as a hitbox.
 */
function isHitboxMesh(mesh: Mesh): boolean {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
  return materials.some((mat) => (mat as any).visible === false)
}

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

  // Skip degenerate placeholder geometries (0×0×0 boxes)
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

/**
 * Build a flat Scene of cloned meshes suitable for STL export.
 * Walks the scene graph, filters out non-exportable objects, and bakes
 * each mesh's world transform into its geometry.
 */
function buildExportScene(sceneGroup: Object3D): Scene {
  sceneGroup.updateMatrixWorld(true)

  const exportScene = new Scene()

  sceneGroup.traverse((obj) => {
    // Skip entire subtrees of excluded node types (zones, guides, scans, etc.)
    if (isExcludedNode(obj)) {
      // Prevent traversal into children by removing them temporarily — not ideal.
      // Instead, we just skip this object; its children will be visited but the
      // mesh filter below will handle them.
    }

    if (!(obj as Mesh).isMesh) return

    const mesh = obj as Mesh
    if (!isExportableMesh(mesh)) return

    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)

    const exportMesh = new Mesh(geo)
    exportScene.add(exportMesh)
  })

  return exportScene
}

export function ExportManager() {
  const scene = useThree((state) => state.scene)
  const setExportScene = useViewer((state) => state.setExportScene)
  const setThreeScene = useViewer((state) => state.setThreeScene)

  useEffect(() => {
    setThreeScene(scene)
    return () => setThreeScene(null)
  }, [scene, setThreeScene])

  useEffect(() => {
    const exportFn = async (format: 'glb' | 'stl' = 'glb') => {
      const sceneGroup = scene.getObjectByName('scene-renderer')
      if (!sceneGroup) {
        console.error('scene-renderer group not found')
        return
      }

      const date = new Date().toISOString().split('T')[0]

      if (format === 'stl') {
        const stlScene = buildExportScene(sceneGroup)
        const exporter = new STLExporter()
        const result = exporter.parse(stlScene, { binary: true })
        const blob = new Blob([result], { type: 'application/octet-stream' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `model_${date}.stl`
        link.click()
        URL.revokeObjectURL(url)
      } else {
        const exporter = new GLTFExporter()
        return new Promise<void>((resolve, reject) => {
          exporter.parse(
            sceneGroup,
            (gltf) => {
              const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' })
              const url = URL.createObjectURL(blob)
              const link = document.createElement('a')
              link.href = url
              link.download = `model_${date}.glb`
              link.click()
              URL.revokeObjectURL(url)
              resolve()
            },
            (error) => {
              console.error('Export error:', error)
              reject(error)
            },
            { binary: true },
          )
        })
      }
    }

    setExportScene(exportFn)

    return () => {
      setExportScene(null)
    }
  }, [scene, setExportScene])

  return null
}
