import { useFrame } from '@react-three/fiber'
import useScene from '../../store/use-scene'
import { sceneRegistry } from '../../hooks/scene-registry/scene-registry'

/**
 * System for updating heatmap geometry and textures
 * Processes dirty heatmap nodes each frame
 */
export const HeatmapSystem = () => {
  const dirtyNodes = useScene((state) => state.dirtyNodes)

  useFrame(() => {
    for (const nodeId of dirtyNodes) {
      const node = useScene.getState().nodes[nodeId]
      if (!node || node.type !== 'heatmap') continue

      const obj = sceneRegistry.nodes.get(nodeId)
      if (!obj) continue

      // Texture update is handled by React useMemo deps in renderer
      // Just remove from dirty set
      useScene.getState().clearDirty(nodeId)
    }
  })

  return null
}
