import { useRegistry, type HeatmapNode, useScene, type ZoneNode, type LevelNode } from '@pascal-app/core'
import { useMemo, useRef } from 'react'
import { DoubleSide, type Group, MeshBasicMaterial, PlaneGeometry, Matrix4 } from 'three'
import { createHeatmapTexture, createHeatmapTextureFromSlice, createHeatmapTexture3D, type GridData, type GridData3D } from '../../../lib/heatmap-texture-generator'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { VelocityVectors } from './velocity-vectors'

interface HeatmapRendererProps {
  node: HeatmapNode
  // Optional: explicit room bounds (overrides auto-calculated)
  roomBounds?: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  // Height offset (e.g., at occupant head level ~1.2m)
  heightOffset?: number
  // Show velocity vectors overlay
  showVectors?: boolean
  // 3D rendering mode
  renderMode?: '2d' | '3d-slice' | '3d-volume'
  // Slice position for 3D-slice mode (0-1)
  slicePosition?: number
  // Room height for 3D rendering
  roomHeight?: number
}

/**
 * Calculate room bounds from level walls (preferred) or zone polygon.
 * Uses wall centerline coordinates so the heatmap fills the full room.
 */
function useRoomBounds(node: HeatmapNode): { minX: number; maxX: number; minZ: number; maxZ: number } {
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

export const HeatmapRenderer = ({
  node,
  roomBounds: explicitRoomBounds,
  heightOffset = 1.2,
  showVectors = false,
  renderMode = '2d',
  slicePosition = 0.5,
  roomHeight = 2.8,
}: HeatmapRendererProps) => {
  const ref = useRef<Group>(null!)
  const calculatedBounds = useRoomBounds(node)
  const roomBounds = explicitRoomBounds ?? calculatedBounds
  const allNodes = useScene((state) => state.nodes)

  useRegistry(node.id, 'heatmap', ref)

  // Check if 3D data is available
  const has3DData = useMemo(() => {
    return !!node.data.temperatureGrid3D && !!node.data.velocityGrid3D
  }, [node.data])

  // Get actual room height from level if not provided
  const actualRoomHeight = useMemo(() => {
    if (roomHeight !== 2.8) return roomHeight
    if (node.levelId) {
      const level = allNodes[node.levelId as keyof typeof allNodes] as unknown as LevelNode | undefined
      const meta = level?.metadata as Record<string, unknown> | undefined
      return (meta?.ceilingHeight as number) ?? 2.8
    }
    return 2.8
  }, [allNodes, node.levelId, roomHeight])

  // Select grid data based on visualization type and render mode
  const gridData: GridData | null = useMemo(() => {
    const { data } = node
    const { visualizationType } = node

    // For 3D slice mode, extract a slice from 3D grid
    if (renderMode === '3d-slice' && has3DData && data.temperatureGrid3D) {
      let values3D: number[][][]
      switch (visualizationType) {
        case 'velocity':
          values3D = data.velocityGrid3D!
          break
        case 'pmv':
          values3D = data.temperatureGrid3D! // Placeholder
          break
        case 'temperature':
        default:
          values3D = data.temperatureGrid3D!
      }

      const totalLevels = data.verticalLevels ?? 10
      const sliceIndex = Math.floor(slicePosition * (totalLevels - 1))
      const sliceData = values3D[sliceIndex]

      if (sliceData) {
        return {
          values: sliceData,
          min: node.dataMin ?? data.averageTemperature - 5,
          max: node.dataMax ?? data.averageTemperature + 5,
        }
      }
    }

    // 2D mode or fallback
    let values: number[][]

    switch (visualizationType) {
      case 'velocity':
        values = data.velocityGrid
        break
      case 'pmv':
        values = data.temperatureGrid // Placeholder
        break
      case 'temperature':
      default:
        values = data.temperatureGrid
    }

    return {
      values,
      min: node.dataMin ?? data.averageTemperature - 5,
      max: node.dataMax ?? data.averageTemperature + 5,
    }
  }, [node.data, node.visualizationType, node.dataMin, node.dataMax, renderMode, has3DData, slicePosition])

  // Generate 3D grid data for volume rendering
  const gridData3D: GridData3D | null = useMemo(() => {
    if (renderMode !== '3d-volume' || !has3DData) return null

    const { data } = node
    const { visualizationType } = node

    let values: number[][][]

    switch (visualizationType) {
      case 'velocity':
        values = data.velocityGrid3D!
        break
      case 'pmv':
        values = data.temperatureGrid3D! // Placeholder
        break
      case 'temperature':
      default:
        values = data.temperatureGrid3D!
    }

    return {
      values,
      min: node.dataMin ?? data.averageTemperature - 5,
      max: node.dataMax ?? data.averageTemperature + 5,
      verticalLevels: data.verticalLevels ?? 10,
      heightOffsets: data.heightOffsets,
    }
  }, [node.data, node.visualizationType, node.dataMin, node.dataMax, renderMode, has3DData])

  // Generate texture for 2D/slice mode
  const texture = useMemo(() => {
    if (!gridData) return null
    if (renderMode === '3d-slice' && has3DData && gridData3D) {
      const totalLevels = gridData3D.verticalLevels
      const sliceIndex = Math.floor(slicePosition * (totalLevels - 1))
      return createHeatmapTextureFromSlice(gridData3D, sliceIndex, node.colorScheme)
    }
    return createHeatmapTexture(gridData, node.colorScheme)
  }, [gridData, gridData3D, renderMode, has3DData, slicePosition, node.colorScheme])

  // Generate textures for volume mode
  const volumeTextures = useMemo(() => {
    if (!gridData3D) return []
    return createHeatmapTexture3D(gridData3D, node.colorScheme)
  }, [gridData3D, node.colorScheme])

  // Calculate room dimensions and center
  const { planeGeometry, transform, volumePlanes } = useMemo(() => {
    const width = roomBounds.maxX - roomBounds.minX
    const depth = roomBounds.maxZ - roomBounds.minZ
    const centerX = (roomBounds.minX + roomBounds.maxX) / 2
    const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2

    const geometry = new PlaneGeometry(width, depth)

    // Single plane for 2D and slice modes
    const matrix = new Matrix4()
    matrix.makeRotationX(-Math.PI / 2)
    matrix.setPosition(centerX, heightOffset, centerZ)

    // Multiple planes for volume mode
    const planes: { matrix: Matrix4; layerIndex: number; y: number }[] = []
    if (renderMode === '3d-volume' && gridData3D) {
      const totalLevels = gridData3D.verticalLevels
      const visibleLevels = Math.min(10, totalLevels)
      const step = Math.floor(totalLevels / visibleLevels)

      for (let i = 0; i < totalLevels; i += step) {
        const normalizedHeight = gridData3D.heightOffsets?.[i] ?? (i / (totalLevels - 1))
        const y = normalizedHeight * actualRoomHeight

        const planeMatrix = new Matrix4()
        planeMatrix.makeRotationX(-Math.PI / 2)
        planeMatrix.setPosition(centerX, y, centerZ)

        planes.push({ matrix: planeMatrix, layerIndex: i, y })
      }
    }

    return { planeGeometry: geometry, transform: matrix, volumePlanes: planes }
  }, [roomBounds, heightOffset, actualRoomHeight, renderMode, gridData3D])

  // Material with heatmap texture
  const material = useMemo(() => {
    if (!texture) return null
    return new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: node.opacity ?? 0.7,
      side: DoubleSide,
      depthWrite: false,
      depthTest: true,
    })
  }, [texture, node.opacity])

  // Volume materials
  const volumeMaterials = useMemo(() => {
    if (!volumeTextures.length) return []
    const baseOpacity = node.opacity ?? 0.7
    const layerOpacityDecay = 0.92

    return volumeTextures.map((tex, index) => {
      const opacity = baseOpacity * layerOpacityDecay ** index
      return new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })
    })
  }, [volumeTextures, node.opacity])

  const handlers = useNodeEvents(node, 'heatmap')

  // Render volume mode
  if (renderMode === '3d-volume' && volumePlanes.length > 0 && volumeMaterials.length > 0) {
    return (
      <group ref={ref} {...handlers}>
        {volumePlanes.map((plane, index) => (
          <mesh
            key={plane.layerIndex}
            geometry={planeGeometry}
            material={volumeMaterials[index]}
            matrix={plane.matrix}
          />
        ))}
      </group>
    )
  }

  // Render 2D or slice mode
  if (!material) return null

  return (
    <group ref={ref} matrix={transform} {...handlers}>
      <mesh geometry={planeGeometry} material={material} />
      {showVectors && (
        <VelocityVectors
          node={node}
          roomBounds={roomBounds}
          heightOffset={heightOffset}
        />
      )}
    </group>
  )
}
