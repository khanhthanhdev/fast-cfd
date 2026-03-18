import { HeatmapRenderer } from './heatmap-renderer'
import type { HeatmapNode } from '@pascal-app/core'
import { useViewerStore } from '../../../store/use-viewer'

interface TemperatureHeatmapProps {
  node: HeatmapNode
  roomBounds: { minX: number; maxX: number; minZ: number; maxZ: number }
}

/**
 * Temperature heatmap visualization at occupant head level (1.2m)
 * Supports 2D slice and 3D volume rendering modes
 */
export const TemperatureHeatmap = ({
  node,
  roomBounds,
}: TemperatureHeatmapProps) => {
  const renderMode = useViewerStore((state) => state.heatmapRenderMode)
  const slicePosition = useViewerStore((state) => state.heatmapSlicePosition)

  return (
    <HeatmapRenderer
      node={{ ...node, visualizationType: 'temperature' }}
      roomBounds={roomBounds}
      heightOffset={1.2} // Head level for occupant comfort analysis
      renderMode={renderMode}
      slicePosition={slicePosition}
    />
  )
}
