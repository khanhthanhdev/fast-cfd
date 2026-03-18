import { useRegistry, type HeatmapNode, useScene, type ZoneNode, type LevelNode } from '@pascal-app/core'
import { useEffect, useMemo, useRef } from 'react'
import { DoubleSide, type Group, MeshBasicMaterial, PlaneGeometry, Matrix4 } from 'three'
import {
  createHeatmapTexture3D,
  type GridData3D,
} from '../../../lib/heatmap-texture-generator'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { VelocityVectors } from './velocity-vectors'

interface Heatmap3DVolumeRendererProps {
  node: HeatmapNode
  // Optional: explicit room bounds (overrides auto-calculated)
  roomBounds?: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  // Volume mode: 'full' | 'slice'
  volumeMode?: 'full' | 'slice'
  // Slice position (0-1) for slice mode
  slicePosition?: number
  // Number of visible layers in full volume mode
  visibleLayers?: number
  // Opacity per layer (decreases with depth for depth cue)
  layerOpacityDecay?: number
  // Show velocity vectors overlay
  showVectors?: boolean
}

/**
 * Calculate room bounds from level walls (preferred) or zone polygon.
 * Uses wall centerline coordinates so the heatmap fills the full room.
 */
function useRoomBounds(node: HeatmapNode): { minX: number; maxX: number; minZ: number; maxZ: number; height?: number } {
  const allNodes = useScene((state) => state.nodes)

  return useMemo(() => {
    // Priority 1: Level bounds from children walls (wall centerlines fill the room)
    if (node.levelId) {
      const level = allNodes[node.levelId as keyof typeof allNodes] as unknown as LevelNode | undefined
      if (level?.children) {
        const wallCoords: [number, number][] = []
        level.children.forEach((childId) => {
          const wall = allNodes[childId as keyof typeof allNodes]
          if (wall?.type === 'wall' && 'start' in wall && 'end' in wall) {
            wallCoords.push(wall.start as [number, number], wall.end as [number, number])
          }
        })
        if (wallCoords.length > 0) {
          const xs = wallCoords.map((c) => c[0])
          const zs = wallCoords.map((c) => c[1])
          return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minZ: Math.min(...zs),
            maxZ: Math.max(...zs),
          }
        }
      }
    }

    // Priority 2: Zone bounds from polygon
    if (node.zoneId) {
      const zone = allNodes[node.zoneId as keyof typeof allNodes] as unknown as ZoneNode | undefined
      if (zone?.polygon && zone.polygon.length > 0) {
        const xs = zone.polygon.map((p) => p[0])
        const zs = zone.polygon.map((p) => p[1])
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
        }
      }
    }

    // Fallback: default bounds
    return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }
  }, [allNodes, node.zoneId, node.levelId])
}

/**
 * Render 3D volumetric heatmap using layered semi-transparent slices
 */
export const Heatmap3DVolumeRenderer = ({
  node,
  roomBounds: explicitRoomBounds,
  volumeMode = 'full',
  slicePosition = 0.5,
  visibleLayers = 10,
  layerOpacityDecay = 0.92,
  showVectors = false,
}: Heatmap3DVolumeRendererProps) => {
  const ref = useRef<Group>(null!)
  const calculatedBounds = useRoomBounds(node)
  const roomBounds = explicitRoomBounds ?? calculatedBounds
  const allNodes = useScene((state) => state.nodes)

  useRegistry(node.id, 'heatmap', ref)

  // Get room height from level
  const roomHeight = useMemo(() => {
    if (node.levelId) {
      const level = allNodes[node.levelId as keyof typeof allNodes] as unknown as LevelNode | undefined
      const meta = level?.metadata as Record<string, unknown> | undefined
      return (meta?.ceilingHeight as number) ?? 2.8
    }
    return 2.8
  }, [allNodes, node.levelId])

  // Prepare 3D grid data based on visualization type
  const gridData3D: GridData3D | null = useMemo(() => {
    const { data } = node
    const { visualizationType } = node

    // Check if 3D data is available
    if (!data.temperatureGrid3D || !data.velocityGrid3D) {
      return null
    }

    let values: number[][][]

    switch (visualizationType) {
      case 'velocity':
        values = data.velocityGrid3D
        break
      case 'pmv':
        values = data.temperatureGrid3D // Placeholder
        break
      case 'temperature':
      default:
        values = data.temperatureGrid3D
    }

    return {
      values,
      min: node.dataMin ?? data.averageTemperature - 5,
      max: node.dataMax ?? data.averageTemperature + 5,
      verticalLevels: data.verticalLevels ?? 10,
      heightOffsets: data.heightOffsets,
    }
  }, [node.data, node.visualizationType, node.dataMin, node.dataMax])

  // Generate textures for all layers
  const textures = useMemo(() => {
    if (!gridData3D) return []
    return createHeatmapTexture3D(gridData3D, node.colorScheme)
  }, [gridData3D, node.colorScheme])

  useEffect(() => {
    return () => {
      for (const tex of textures) {
        tex.dispose()
      }
    }
  }, [textures])

  // Compute room dimensions for geometry and planes
  const width = roomBounds.maxX - roomBounds.minX
  const depth = roomBounds.maxZ - roomBounds.minZ

  // Shared geometry for all horizontal slices
  const geometry = useMemo(() => {
    return new PlaneGeometry(width, depth)
  }, [width, depth])

  useEffect(() => {
    return () => {
      geometry.dispose()
    }
  }, [geometry])

  // Calculate plane positions and layer indices
  const planesData = useMemo(() => {
    const centerX = (roomBounds.minX + roomBounds.maxX) / 2
    const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2

    // Determine which layers to render based on mode
    const totalLevels = gridData3D?.verticalLevels ?? 10
    let layerIndices: number[] = []

    if (volumeMode === 'slice') {
      // Single slice at specified position
      const sliceIndex = Math.floor(slicePosition * (totalLevels - 1))
      layerIndices = [sliceIndex]
    } else {
      // Full volume: render subset of layers
      const step = Math.max(1, Math.floor(totalLevels / visibleLayers))
      for (let i = 0; i < totalLevels; i += step) {
        layerIndices.push(i)
      }
    }

    return layerIndices.map((layerIndex) => {
      const normalizedHeight = gridData3D?.heightOffsets?.[layerIndex] ?? (layerIndex / (totalLevels - 1))
      const y = normalizedHeight * roomHeight

      const matrix = new Matrix4()
      matrix.makeRotationX(-Math.PI / 2)
      matrix.setPosition(centerX, y, centerZ)

      return {
        geometry,
        matrix,
        layerIndex,
        y,
      }
    })
  }, [roomBounds, roomHeight, volumeMode, slicePosition, visibleLayers, gridData3D, geometry])

  // Create materials for each plane
  const materials = useMemo(() => {
    if (!textures.length) return []

    return planesData.map((plane, index) => {
      const baseOpacity = node.opacity ?? 0.7

      // Apply opacity decay based on layer depth
      let opacity = baseOpacity
      if (volumeMode === 'full') {
        // Layers get more transparent as they go up
        opacity = baseOpacity * layerOpacityDecay ** plane.layerIndex
      }

      return new MeshBasicMaterial({
        map: textures[plane.layerIndex],
        transparent: true,
        opacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })
    })
  }, [textures, planesData, node.opacity, volumeMode, layerOpacityDecay])

  useEffect(() => {
    return () => {
      for (const mat of materials) {
        mat.dispose()
      }
    }
  }, [materials])

  const handlers = useNodeEvents(node, 'heatmap')

  if (!gridData3D || textures.length === 0) {
    // Fallback to 2D if no 3D data
    return null
  }

  return (
    <group ref={ref} {...handlers}>
      {planesData.map((plane, index) => (
        <mesh
          key={plane.layerIndex}
          geometry={plane.geometry}
          material={materials[index]}
          matrix={plane.matrix}
        />
      ))}
      {showVectors && volumeMode === 'slice' && (
        <VelocityVectors
          node={node}
          roomBounds={roomBounds}
          heightOffset={planesData[0]?.y ?? 1.2}
          sliceIndex={planesData[0]?.layerIndex}
        />
      )}
    </group>
  )
}
