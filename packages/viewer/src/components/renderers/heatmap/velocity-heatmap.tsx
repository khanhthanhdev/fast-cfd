import { HeatmapRenderer } from './heatmap-renderer'
import type { HeatmapNode } from '@pascal-app/core'
import { useViewerStore } from '../../../store/use-viewer'

interface VelocityHeatmapProps {
  node: HeatmapNode
  roomBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/**
 * Velocity magnitude heatmap visualization at occupant head level (1.2m)
 * Uses viridis colormap for better magnitude perception
 * Supports 2D slice and 3D volume rendering modes
 */
export const VelocityHeatmap = ({
  node,
  roomBounds,
}: VelocityHeatmapProps) => {
  const renderMode = useViewerStore((state) => state.heatmapRenderMode)
  const slicePosition = useViewerStore((state) => state.heatmapSlicePosition)

  return (
    <HeatmapRenderer
      node={{
        ...node,
        visualizationType: 'velocity',
        colorScheme: node.colorScheme === 'jet' ? 'viridis' : node.colorScheme,
      }}
      roomBounds={roomBounds}
      heightOffset={1.2}
      renderMode={renderMode}
      slicePosition={slicePosition}
    />
  )
}
