import { useRegistry, useScene, type HeatmapNode, type LevelNode, type ZoneNode } from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, type Group, MeshBasicMaterial, PlaneGeometry, DataTexture, RGBAFormat, LinearFilter, Vector3 } from 'three'
import { createHeatmapTexture, createHeatmapTexture3D, type GridData, type GridData3D } from '../../../lib/heatmap-texture-generator'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { VelocityVectors } from './velocity-vectors'
import { colorMaps } from '../../../lib/color-maps'
import { diffuseHeat } from '@pascal-app/core'

interface Heatmap3DRendererProps {
  node: HeatmapNode
  roomBounds?: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
  }
  showVectors?: boolean
}

/**
 * Calculate room bounds from level walls (preferred) or zone polygon.
 * Uses wall centerline coordinates so the heatmap fills the full room
 * up to the wall inner faces, avoiding gaps between heatmap and walls.
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

/**
 * Create a vertical wall texture from 3D grid data
 * Samples a vertical cross-section (height × horizontal) from the 3D volume
 */
function createVerticalSliceTexture(
  grid3D: number[][][],
  min: number,
  max: number,
  axis: 'x' | 'z',
  sliceIndex: number,
  gridSize: number,
  verticalLevels: number,
  colorScheme: string,
  upscale = 4,
): DataTexture {
  const colorMapFn = (colorMaps[colorScheme] ?? colorMaps.jet)!
  const texW = gridSize * upscale
  const texH = verticalLevels * upscale
  const pixels = new Uint8Array(texW * texH * 4)

  for (let k = 0; k < verticalLevels; k++) {
    for (let h = 0; h < gridSize; h++) {
      let value: number
      if (axis === 'z') {
        // Slice along Z: row=sliceIndex, vary columns (x=h)
        value = grid3D[k]?.[sliceIndex]?.[h] ?? min
      } else {
        // Slice along X: vary rows (z=h), col=sliceIndex
        value = grid3D[k]?.[h]?.[sliceIndex] ?? min
      }
      const color = colorMapFn(value, min, max)

      for (let dy = 0; dy < upscale; dy++) {
        for (let dx = 0; dx < upscale; dx++) {
          const px = h * upscale + dx
          const py = k * upscale + dy // bottom=0 is floor
          const idx = (py * texW + px) * 4
          pixels[idx + 0] = Math.round(color.r * 255)
          pixels[idx + 1] = Math.round(color.g * 255)
          pixels[idx + 2] = Math.round(color.b * 255)
          pixels[idx + 3] = 255
        }
      }
    }
  }

  const tex = new DataTexture(pixels, texW, texH, RGBAFormat)
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

function disposeMaterialWithMap(mat: MeshBasicMaterial, seen: Set<string>) {
  if (seen.has(mat.uuid)) return
  seen.add(mat.uuid)
  mat.map?.dispose()
  mat.dispose()
}

type LodTier = 'near' | 'mid' | 'far'

/**
 * Full-room 3D volumetric heatmap renderer.
 * Renders horizontal slices at each vertical level AND vertical wall slices
 * on all 4 sides of the room, filling the entire room space.
 */
export const Heatmap3DRenderer = ({
  node,
  roomBounds: explicitRoomBounds,
  showVectors = false,
}: Heatmap3DRendererProps) => {
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

  // Ref for 3D grid to apply diffusion
  const grid3DRef = useRef<number[][][] | null>(null)

  // Heat diffusion update loop
  useFrame((_, delta) => {
    if (!node.heatDiffusionEnabled || !node.data.temperatureGrid3D) return

    const cappedDelta = Math.min(delta, 0.1)

    // Initialize grid ref if needed
    if (!grid3DRef.current && node.data.temperatureGrid3D) {
      grid3DRef.current = node.data.temperatureGrid3D.map((level) =>
        level.map((row) => [...row]),
      )
    }

    if (grid3DRef.current) {
      const gridSize = node.data.gridSize || 20
      const verticalLevels = node.data.verticalLevels ?? 10
      // cellSize must match grid indexing: [i=x, j=z, k=height]
      const cellSize: [number, number, number] = [
        (roomBounds.maxX - roomBounds.minX) / gridSize,
        (roomBounds.maxZ - roomBounds.minZ) / gridSize,
        roomHeight / verticalLevels,
      ]

      diffuseHeat({
        temperatureGrid3D: grid3DRef.current,
        gridResolution: [gridSize, gridSize, verticalLevels],
        cellSize,
        diffusionCoefficient: node.diffusionCoefficient,
        deltaTime: cappedDelta,
        iterations: node.diffusionIterations,
        ambientTemperature: 293,
      })

      // Sync back to node data
      for (let k = 0; k < verticalLevels; k++) {
        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            if (node.data.temperatureGrid3D?.[k]?.[j]?.[i] !== undefined) {
              node.data.temperatureGrid3D[k]![j]![i] = grid3DRef.current[k]?.[j]?.[i] ?? 293
            }
          }
        }
      }
    }
  })

  // Check if 3D data available
  const has3DData = useMemo(() => {
    return !!node.data.temperatureGrid3D && !!node.data.velocityGrid3D
  }, [node.data.temperatureGrid3D, node.data.velocityGrid3D])

  // Room dimensions
  const { width, depth, centerX, centerZ } = useMemo(() => {
    const width = roomBounds.maxX - roomBounds.minX
    const depth = roomBounds.maxZ - roomBounds.minZ
    const centerX = (roomBounds.minX + roomBounds.maxX) / 2
    const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2
    return { width, depth, centerX, centerZ }
  }, [roomBounds])

  // Data bounds
  const dataBounds = useMemo(() => {
    return {
      min: node.dataMin ?? node.data.averageTemperature - 5,
      max: node.dataMax ?? node.data.averageTemperature + 5,
    }
  }, [node.dataMin, node.dataMax, node.data.averageTemperature])

  // Select 3D grid values based on visualization type
  const grid3DValues = useMemo(() => {
    if (!has3DData) return null
    switch (node.visualizationType) {
      case 'velocity':
        return node.data.velocityGrid3D!
      case 'pmv':
      case 'temperature':
      default:
        return node.data.temperatureGrid3D!
    }
  }, [has3DData, node.data, node.visualizationType])

  // Fallback 2D grid data
  const gridData2D: GridData = useMemo(() => {
    let values: number[][]
    switch (node.visualizationType) {
      case 'velocity':
        values = node.data.velocityGrid
        break
      case 'pmv':
      case 'temperature':
      default:
        values = node.data.temperatureGrid
    }
    return { values, ...dataBounds }
  }, [node.data, node.visualizationType, dataBounds])

  // LOD tier based on camera distance (bucketed to avoid thrashing)
  const [lodTier, setLodTier] = useState<LodTier>('mid')
  const lodTierRef = useRef<LodTier>(lodTier)

  const { camera } = useThree()
  const roomCenterRef = useRef(new Vector3())
  useFrame(() => {
    roomCenterRef.current.set(centerX, roomHeight / 2, centerZ)
    const dist = camera.position.distanceTo(roomCenterRef.current)
    const tier: LodTier = dist < 5 ? 'near' : dist < 15 ? 'mid' : 'far'
    if (tier !== lodTierRef.current) {
      lodTierRef.current = tier
      setLodTier(tier)
    }
  })

  const horizontalSlices = useMemo(() => {
    const baseOpacity = node.opacity ?? 0.7
    const gridSize = node.data.gridSize || 20
    const totalVerticalLevels = node.data.verticalLevels ?? 25

    // LOD based on camera distance tier
    const visibleLevels = (() => {
      if (lodTier === 'near') return Math.min(25, totalVerticalLevels)
      if (lodTier === 'mid') return Math.min(15, totalVerticalLevels)
      return Math.min(10, totalVerticalLevels)
    })()

    if (has3DData && grid3DValues) {
      // True 3D: one texture per vertical level (or LOD-reduced)
      const gridData3D: GridData3D = {
        values: grid3DValues,
        ...dataBounds,
        verticalLevels: visibleLevels,
        heightOffsets: node.data.heightOffsets,
      }
      const textures = createHeatmapTexture3D(gridData3D, node.colorScheme)

      // Adjust opacity for visual clarity with more slices
      const opacityScale = (10 / visibleLevels) * 0.7

      return textures.map((texture, k) => {
        const normalizedHeight = node.data.heightOffsets?.[k] ?? k / (visibleLevels - 1)
        const y = normalizedHeight * roomHeight
        const opacity = baseOpacity * (0.3 + 0.7 * (1 - Math.abs(normalizedHeight - 0.5) * 0.5)) * opacityScale

        const material = new MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: Math.min(opacity, 0.5),
          side: DoubleSide,
          depthWrite: false,
          depthTest: true,
        })

        return { material, y }
      })
    }

    // Fallback: repeat 2D texture at several heights
    const sliceCount = 8
    const texture = createHeatmapTexture(gridData2D, node.colorScheme)
    return Array.from({ length: sliceCount }, (_, i) => {
      const t = i / (sliceCount - 1)
      const y = t * roomHeight
      const opacity = baseOpacity * (0.3 + 0.4 * (1 - Math.abs(t - 0.5)))

      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: Math.min(opacity, 0.45),
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })

      return { material, y }
    })
  }, [has3DData, grid3DValues, gridData2D, node.colorScheme, node.opacity, node.data, roomHeight, dataBounds, lodTier])

  // Dispose horizontal slice materials and textures
  useEffect(() => {
    return () => {
      const seen = new Set<string>()
      for (const slice of horizontalSlices) {
        disposeMaterialWithMap(slice.material, seen)
      }
    }
  }, [horizontalSlices])

  // Generate vertical wall slice materials for all 4 walls
  const wallSlices = useMemo(() => {
    const baseOpacity = (node.opacity ?? 0.7) * 0.35
    const gridSize = node.data.gridSize || 20
    const totalVerticalLevels = node.data.verticalLevels ?? 25

    // LOD based on camera distance tier
    const visibleLevels = (() => {
      if (lodTier === 'near') return Math.min(25, totalVerticalLevels)
      if (lodTier === 'mid') return Math.min(15, totalVerticalLevels)
      return Math.min(10, totalVerticalLevels)
    })()

    if (!has3DData || !grid3DValues) {
      // Fallback: single 2D texture on walls
      const texture = createHeatmapTexture(gridData2D, node.colorScheme)
      const mat = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })
      return {
        frontMat: mat,
        backMat: mat,
        leftMat: mat,
        rightMat: mat,
      }
    }

    // Front wall (Z = minZ): slice along z-row=0
    const frontTex = createVerticalSliceTexture(
      grid3DValues, dataBounds.min, dataBounds.max,
      'z', 0, gridSize, visibleLevels, node.colorScheme,
    )
    // Back wall (Z = maxZ): slice along z-row=gridSize-1
    const backTex = createVerticalSliceTexture(
      grid3DValues, dataBounds.min, dataBounds.max,
      'z', gridSize - 1, gridSize, visibleLevels, node.colorScheme,
    )
    // Left wall (X = minX): slice along x-col=0
    const leftTex = createVerticalSliceTexture(
      grid3DValues, dataBounds.min, dataBounds.max,
      'x', 0, gridSize, visibleLevels, node.colorScheme,
    )
    // Right wall (X = maxX): slice along x-col=gridSize-1
    const rightTex = createVerticalSliceTexture(
      grid3DValues, dataBounds.min, dataBounds.max,
      'x', gridSize - 1, gridSize, visibleLevels, node.colorScheme,
    )

    const makeMat = (tex: DataTexture) =>
      new MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: baseOpacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })

    return {
      frontMat: makeMat(frontTex),
      backMat: makeMat(backTex),
      leftMat: makeMat(leftTex),
      rightMat: makeMat(rightTex),
    }
  }, [has3DData, grid3DValues, gridData2D, node.colorScheme, node.opacity, node.data, dataBounds, lodTier])

  // Dispose wall slice materials and textures
  useEffect(() => {
    return () => {
      const seen = new Set<string>()
      disposeMaterialWithMap(wallSlices.frontMat, seen)
      disposeMaterialWithMap(wallSlices.backMat, seen)
      disposeMaterialWithMap(wallSlices.leftMat, seen)
      disposeMaterialWithMap(wallSlices.rightMat, seen)
    }
  }, [wallSlices])

  // Geometries
  const horizontalGeo = useMemo(() => new PlaneGeometry(width, depth), [width, depth])
  const wallGeoFrontBack = useMemo(() => new PlaneGeometry(width, roomHeight), [width, roomHeight])
  const wallGeoLeftRight = useMemo(() => new PlaneGeometry(depth, roomHeight), [depth, roomHeight])

  // Dispose geometries
  useEffect(() => () => horizontalGeo.dispose(), [horizontalGeo])
  useEffect(() => () => wallGeoFrontBack.dispose(), [wallGeoFrontBack])
  useEffect(() => () => wallGeoLeftRight.dispose(), [wallGeoLeftRight])

  const handlers = useNodeEvents(node, 'heatmap')

  return (
    <group ref={ref} {...handlers}>
      {/* Horizontal slices filling the room volume */}
      {horizontalSlices.map((slice, index) => (
        <mesh
          key={`h-${index}`}
          geometry={horizontalGeo}
          material={slice.material}
          position={[centerX, slice.y, centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      ))}

      {/* Front wall (Z = minZ) */}
      <mesh
        geometry={wallGeoFrontBack}
        material={wallSlices.frontMat}
        position={[centerX, roomHeight / 2, roomBounds.minZ]}
      />

      {/* Back wall (Z = maxZ) */}
      <mesh
        geometry={wallGeoFrontBack}
        material={wallSlices.backMat}
        position={[centerX, roomHeight / 2, roomBounds.maxZ]}
      />

      {/* Left wall (X = minX) */}
      <mesh
        geometry={wallGeoLeftRight}
        material={wallSlices.leftMat}
        position={[roomBounds.minX, roomHeight / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Right wall (X = maxX) */}
      <mesh
        geometry={wallGeoLeftRight}
        material={wallSlices.rightMat}
        position={[roomBounds.maxX, roomHeight / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {/* Velocity vectors at head level */}
      {showVectors && (
        <VelocityVectors
          node={node}
          roomBounds={roomBounds}
          heightOffset={1.2}
        />
      )}
    </group>
  )
}
