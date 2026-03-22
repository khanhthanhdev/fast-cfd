'use client'

import { type AnyNode, useScene } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { BuildingRenderer } from './building/building-renderer'
import { CeilingRenderer } from './ceiling/ceiling-renderer'
import { DoorRenderer } from './door/door-renderer'
import { GuideRenderer } from './guide/guide-renderer'
import { ItemRenderer } from './item/item-renderer'
import { LevelRenderer } from './level/level-renderer'
import { RoofRenderer } from './roof/roof-renderer'
import { ScanRenderer } from './scan/scan-renderer'
import { SiteRenderer } from './site/site-renderer'
import { SlabRenderer } from './slab/slab-renderer'
import { WallRenderer } from './wall/wall-renderer'
import { WindowRenderer } from './window/window-renderer'
import { ZoneRenderer } from './zone/zone-renderer'
import { Heatmap3DRenderer } from './heatmap/heatmap-3d-renderer'

export const NodeRenderer = ({ nodeId }: { nodeId: AnyNode['id'] }) => {
  const node = useScene((state) => state.nodes[nodeId])
  const showVectors = useViewer((state) => state.showHeatmapVectors)
  const showHeatmap = useViewer((state) => state.showHeatmap)
  const showGinotPointCloud = useViewer((state) => state.showGinotPointCloud)

  if (!node) return null

  const shouldRenderHeatmapNode = showHeatmap || showVectors || showGinotPointCloud

  return (
    <>
      {node.type === 'site' && <SiteRenderer node={node} />}
      {node.type === 'building' && <BuildingRenderer node={node} />}
      {node.type === 'ceiling' && <CeilingRenderer node={node} />}
      {node.type === 'level' && <LevelRenderer node={node} />}
      {node.type === 'item' && <ItemRenderer node={node} />}
      {node.type === 'slab' && <SlabRenderer node={node} />}
      {node.type === 'wall' && <WallRenderer node={node} />}
      {node.type === 'door' && <DoorRenderer node={node} />}
      {node.type === 'window' && <WindowRenderer node={node} />}
      {node.type === 'zone' && <ZoneRenderer node={node} />}
      {node.type === 'roof' && <RoofRenderer node={node} />}
      {node.type === 'scan' && <ScanRenderer node={node} />}
      {node.type === 'guide' && <GuideRenderer node={node} />}
      {node.type === 'heatmap' && shouldRenderHeatmapNode && (
        <Heatmap3DRenderer node={node} showVectors={showVectors} />
      )}
    </>
  )
}
