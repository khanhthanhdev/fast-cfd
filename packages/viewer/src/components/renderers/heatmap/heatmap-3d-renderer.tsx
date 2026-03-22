import {
  diffuseHeat,
  ParticleSystemNode as ParticleSystemNodeSchema,
  useRegistry,
  useScene,
  type HeatmapNode,
  type LevelNode,
  type ParticleSystemNodeType,
  type ZoneNode,
} from '@pascal-app/core'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DataTexture,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  Vector3,
  type Group,
} from 'three'
import { useNodeEvents } from '../../../hooks/use-node-events'
import { createHeatmapTexture, createHeatmapTexture3D, createHeatmapTextureFromSlice, type GridData, type GridData3D } from '../../../lib/heatmap-texture-generator'
import {
  createActiveHeatCellSet,
  getHeatGridCellIndex,
  projectTemperatureGrid3DTo2D,
} from '../../../lib/heat-deposition'
import { useViewerStore } from '../../../store/use-viewer'
import { GinotPointCloud } from './ginot-point-cloud'
import { VelocityVectors } from './velocity-vectors'
import { colorMaps } from '../../../lib/color-maps'
import { ParticleFlowRenderer } from '../particles/particle-flow-renderer'
import { generateFallbackParticleSystem } from '../../../lib/particle-system-fallback'

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

function useRoomBounds(node: HeatmapNode): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const allNodes = useScene((state) => state.nodes)

  return useMemo(() => {
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
          const xs = wallCoords.map((coord) => coord[0])
          const zs = wallCoords.map((coord) => coord[1])
          return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minZ: Math.min(...zs),
            maxZ: Math.max(...zs),
          }
        }
      }
    }

    if (node.zoneId) {
      const zone = allNodes[node.zoneId as keyof typeof allNodes] as unknown as ZoneNode | undefined
      if (zone?.polygon?.length) {
        const xs = zone.polygon.map((point) => point[0])
        const zs = zone.polygon.map((point) => point[1])
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
        }
      }
    }

    return { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }
  }, [allNodes, node.levelId, node.zoneId])
}

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
      const value =
        axis === 'z'
          ? (grid3D[k]?.[sliceIndex]?.[h] ?? min)
          : (grid3D[k]?.[h]?.[sliceIndex] ?? min)
      const color = colorMapFn(value, min, max)

      for (let dy = 0; dy < upscale; dy++) {
        for (let dx = 0; dx < upscale; dx++) {
          const px = h * upscale + dx
          const py = k * upscale + dy
          const idx = (py * texW + px) * 4
          pixels[idx] = Math.round(color.r * 255)
          pixels[idx + 1] = Math.round(color.g * 255)
          pixels[idx + 2] = Math.round(color.b * 255)
          pixels[idx + 3] = 255
        }
      }
    }
  }

  const texture = new DataTexture(pixels, texW, texH, RGBAFormat)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

function disposeMaterialWithMap(material: MeshBasicMaterial, seen: Set<string>) {
  if (seen.has(material.uuid)) return
  seen.add(material.uuid)
  material.map?.dispose()
  material.dispose()
}

function getBounds(values: number[], fallbackMin: number, fallbackMax: number) {
  if (values.length === 0) {
    return { min: fallbackMin, max: fallbackMax }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (min === max) {
    return { min, max: min + 1 }
  }

  return { min, max }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getHeatmapScalarMode(node: HeatmapNode): 'temperature' | 'velocity' | 'none' {
  switch (node.visualizationType) {
    case 'velocity':
    case 'speed':
      return 'velocity'
    case 'pressure':
      return 'none'
    default:
      return 'temperature'
  }
}

type LodTier = 'near' | 'mid' | 'far'

export const Heatmap3DRenderer = ({
  node,
  roomBounds: explicitRoomBounds,
  showVectors = false,
}: Heatmap3DRendererProps) => {
  const ref = useRef<Group>(null!)
  const calculatedBounds = useRoomBounds(node)
  const roomBounds = explicitRoomBounds ?? calculatedBounds
  const allNodes = useScene((state) => state.nodes)
  const renderMode = useViewerStore((state) => state.heatmapRenderMode)
  const slicePosition = useViewerStore((state) => state.heatmapSlicePosition)
  const showHeatmap = useViewerStore((state) => state.showHeatmap)
  const showGinotPointCloud = useViewerStore((state) => state.showGinotPointCloud)
  const ginotPointMetric = useViewerStore((state) => state.ginotPointMetric)
  const ginotPointSize = useViewerStore((state) => state.ginotPointSize)
  const ginotPointOpacity = useViewerStore((state) => state.ginotPointOpacity)
  const showHeatParticles = useViewerStore((state) => state.showHeatParticles)
  const particleDensity = useViewerStore((state) => state.particleDensity)
  const particleSize = useViewerStore((state) => state.particleSize)
  const showParticleTrails = useViewerStore((state) => state.showParticleTrails)
  const particleTrailLength = useViewerStore((state) => state.particleTrailLength)
  const particlePressureEnabled = useViewerStore((state) => state.particlePressureEnabled)
  const particleBuoyancyEnabled = useViewerStore((state) => state.particleBuoyancyEnabled)

  useRegistry(node.id, 'heatmap', ref)

  const roomHeight = useMemo(() => {
    if (node.levelId) {
      const level = allNodes[node.levelId as keyof typeof allNodes] as unknown as LevelNode | undefined
      const metadata = level?.metadata as Record<string, unknown> | undefined
      return (metadata?.ceilingHeight as number) ?? 2.8
    }
    return 2.8
  }, [allNodes, node.levelId])

  const grid3DRef = useRef<number[][][] | null>(null)
  const activeHeatCellIndicesRef = useRef<Set<number> | null>(null)
  const [heatVersion, setHeatVersion] = useState(0)
  const heatRefreshAccumulatorRef = useRef(0)

  useEffect(() => {
    if (!node.heatDiffusionEnabled || !node.data.temperatureGrid3D?.length) {
      grid3DRef.current = null
      activeHeatCellIndicesRef.current = null
      heatRefreshAccumulatorRef.current = 0
      return
    }

    grid3DRef.current = null
    activeHeatCellIndicesRef.current = null
    heatRefreshAccumulatorRef.current = 0
  }, [node.data.temperatureGrid3D, node.heatDiffusionEnabled])

  useFrame((_, delta) => {
    if (!node.heatDiffusionEnabled || !node.data.temperatureGrid3D?.length) return

    const cappedDelta = Math.min(delta, 0.1)
    const gridSize = node.data.gridSize || 20
    const verticalLevels = node.data.verticalLevels ?? 25
    const ambientTemperature = node.data.averageTemperature || 22
    const fieldGridResolution: [number, number, number] = [gridSize, verticalLevels, gridSize]
    // `diffuseHeat` iterates the nested grid as [level][row][col] => [k][j][i].
    const diffusionGridResolution: [number, number, number] = [
      gridSize,
      gridSize,
      verticalLevels,
    ]
    const activeHeatAmbient = overlayParticleSystem?.ambientTemperature ?? ambientTemperature

    if (!grid3DRef.current) {
      grid3DRef.current = Array.from({ length: verticalLevels }, (_, levelIndex) =>
        Array.from({ length: gridSize }, (_, rowIndex) =>
          Array.from(
            { length: gridSize },
            (_, colIndex) =>
              node.data.temperatureGrid3D?.[levelIndex]?.[rowIndex]?.[colIndex]
              ?? ambientTemperature,
          ),
        ),
      )
      activeHeatCellIndicesRef.current = createActiveHeatCellSet(
        grid3DRef.current,
        fieldGridResolution,
        activeHeatAmbient,
      )
    }

    if (!grid3DRef.current) return

    const cellSize: [number, number, number] = [
      (roomBounds.maxX - roomBounds.minX) / gridSize,
      (roomBounds.maxZ - roomBounds.minZ) / gridSize,
      roomHeight / verticalLevels,
    ]

    diffuseHeat({
      temperatureGrid3D: grid3DRef.current,
      gridResolution: diffusionGridResolution,
      cellSize,
      diffusionCoefficient: node.diffusionCoefficient,
      deltaTime: cappedDelta,
      iterations: node.diffusionIterations,
      ambientTemperature,
    })

    activeHeatCellIndicesRef.current?.clear()

    for (let k = 0; k < verticalLevels; k++) {
      for (let j = 0; j < gridSize; j++) {
        for (let i = 0; i < gridSize; i++) {
          const value = grid3DRef.current[k]?.[j]?.[i] ?? ambientTemperature

          if (Math.abs(value - activeHeatAmbient) > 1e-3) {
            activeHeatCellIndicesRef.current?.add(
              getHeatGridCellIndex(i, k, j, fieldGridResolution),
            )
          }

          if (node.data.temperatureGrid3D?.[k]?.[j]?.[i] !== undefined) {
            node.data.temperatureGrid3D[k]![j]![i] = value
          }
        }
      }
    }

    if (node.data.temperatureGrid.length > 0) {
      projectTemperatureGrid3DTo2D(grid3DRef.current, node.data.temperatureGrid)
    }

    heatRefreshAccumulatorRef.current += cappedDelta
    if (heatRefreshAccumulatorRef.current >= 0.15) {
      heatRefreshAccumulatorRef.current = 0
      setHeatVersion((version) => version + 1)
    }
  })

  const scalarMode = useMemo(() => getHeatmapScalarMode(node), [node])
  const hasTemperature2D = node.data.temperatureGrid.length > 0
  const hasVelocity2D = node.data.velocityGrid.length > 0
  const hasTemperature3D = !!node.data.temperatureGrid3D?.length
  const hasVelocity3D = !!node.data.velocityGrid3D?.length
  const hasGinotPoints = !!node.data.ginotPointCloud?.length
  const storedParticleSystem = useMemo<ParticleSystemNodeType | null>(() => {
    const metadata = node.metadata as Record<string, unknown> | undefined
    const particleSystem = metadata?.particleSystem

    if (particleSystem) {
      const parsed = ParticleSystemNodeSchema.safeParse(particleSystem)
      if (parsed.success) return parsed.data
    }

    // Fallback: auto-generate particle system from heatmap data
    return generateFallbackParticleSystem(node, roomBounds, roomHeight)
  }, [node, roomBounds, roomHeight])

  const hasRenderable2DData =
    scalarMode === 'temperature'
      ? hasTemperature2D
      : scalarMode === 'velocity'
        ? hasVelocity2D
        : false

  const hasRenderable3DData =
    scalarMode === 'temperature'
      ? hasTemperature3D
      : scalarMode === 'velocity'
        ? hasVelocity3D
        : false

  const selected2DGrid = useMemo(() => {
    if (scalarMode === 'velocity') {
      return node.data.velocityGrid
    }
    if (scalarMode === 'temperature') {
      return node.data.temperatureGrid
    }
    return []
  }, [node.data.temperatureGrid, node.data.velocityGrid, scalarMode])

  const selected3DGrid = useMemo(() => {
    if (scalarMode === 'velocity') {
      return node.data.velocityGrid3D ?? []
    }
    if (scalarMode === 'temperature') {
      return node.data.temperatureGrid3D ?? []
    }
    return []
  }, [node.data.temperatureGrid3D, node.data.velocityGrid3D, scalarMode])

  const thermalDataBounds = useMemo(() => {
    void heatVersion
    const fallback = {
      min: node.data.averageTemperature - 4,
      max: node.data.averageTemperature + 4,
    }
    const values = node.data.temperatureGrid3D?.length
      ? node.data.temperatureGrid3D.flat(2)
      : node.data.temperatureGrid.flat()
    return getBounds(values, fallback.min, fallback.max)
  }, [heatVersion, node.data.averageTemperature, node.data.temperatureGrid, node.data.temperatureGrid3D])

  const dataBounds = useMemo(() => {
    void heatVersion
    const fallback = {
      min: node.data.averageTemperature - 5,
      max: node.data.averageTemperature + 5,
    }
    const values =
      renderMode !== '2d' && hasRenderable3DData
        ? selected3DGrid.flat(2)
        : selected2DGrid.flat()
    const computed = getBounds(values, fallback.min, fallback.max)
    const min = node.dataMin ?? computed.min
    const max = node.dataMax ?? computed.max

    if (min === max) {
      return { min, max: min + 1 }
    }

    return { min, max }
  }, [
    heatVersion,
    hasRenderable3DData,
    node.data.averageTemperature,
    node.dataMax,
    node.dataMin,
    renderMode,
    selected2DGrid,
    selected3DGrid,
  ])

  const overlayParticleSystem = useMemo<ParticleSystemNodeType | null>(() => {
    if (!storedParticleSystem) return null

    return {
      ...storedParticleSystem,
      particleCount: clamp(
        Math.round(storedParticleSystem.particleCount * particleDensity),
        400,
        5000,
      ),
      particleSize,
      showTrails: showParticleTrails,
      trailLength: particleTrailLength,
      colorScheme: node.colorScheme,
      particleOpacity: clamp(0.55 + (node.opacity ?? 0.7) * 0.35, 0.45, 0.9),
      temperatureRange: [thermalDataBounds.min, thermalDataBounds.max],
      enablePressure: particlePressureEnabled,
      enableBuoyancy: particleBuoyancyEnabled,
      debugShowVectors: showVectors,
      enabled: storedParticleSystem.enabled && showHeatParticles,
    }
  }, [
    node.colorScheme,
    node.opacity,
    particleBuoyancyEnabled,
    particleDensity,
    particlePressureEnabled,
    particleSize,
    particleTrailLength,
    showHeatParticles,
    showParticleTrails,
    showVectors,
    storedParticleSystem,
    thermalDataBounds.max,
    thermalDataBounds.min,
  ])

  const gridData2D = useMemo<GridData | null>(() => {
    void heatVersion
    if (!hasRenderable2DData) return null
    return {
      values: selected2DGrid,
      min: dataBounds.min,
      max: dataBounds.max,
    }
  }, [dataBounds.max, dataBounds.min, hasRenderable2DData, heatVersion, selected2DGrid])

  const gridData3D = useMemo<GridData3D | null>(() => {
    void heatVersion
    if (!hasRenderable3DData) return null

    const verticalLevels = selected3DGrid.length || node.data.verticalLevels || 0
    return {
      values: selected3DGrid,
      min: dataBounds.min,
      max: dataBounds.max,
      verticalLevels,
      heightOffsets: node.data.heightOffsets,
    }
  }, [
    dataBounds.max,
    dataBounds.min,
    hasRenderable3DData,
    heatVersion,
    node.data.heightOffsets,
    node.data.verticalLevels,
    selected3DGrid,
  ])

  const { width, depth, centerX, centerZ } = useMemo(() => {
    const width = roomBounds.maxX - roomBounds.minX
    const depth = roomBounds.maxZ - roomBounds.minZ
    const centerX = (roomBounds.minX + roomBounds.maxX) / 2
    const centerZ = (roomBounds.minZ + roomBounds.maxZ) / 2
    return { width, depth, centerX, centerZ }
  }, [roomBounds])

  const sliceIndex = useMemo(() => {
    if (!gridData3D) return 0
    const totalLevels = Math.max(gridData3D.verticalLevels, 1)
    return Math.min(
      totalLevels - 1,
      Math.max(0, Math.round(slicePosition * (totalLevels - 1))),
    )
  }, [gridData3D, slicePosition])

  const singlePlaneY = useMemo(() => {
    if (renderMode !== '3d-slice' || !gridData3D) {
      return Math.min(1.2, roomHeight)
    }

    const totalLevels = Math.max(gridData3D.verticalLevels - 1, 1)
    const normalizedHeight = gridData3D.heightOffsets?.[sliceIndex] ?? sliceIndex / totalLevels
    return normalizedHeight * roomHeight
  }, [gridData3D, renderMode, roomHeight, sliceIndex])

  const singlePlaneTexture = useMemo(() => {
    if (renderMode === '3d-volume') return null

    if (renderMode === '3d-slice' && gridData3D) {
      return createHeatmapTextureFromSlice(gridData3D, sliceIndex, node.colorScheme)
    }

    if (!gridData2D) return null
    return createHeatmapTexture(gridData2D, node.colorScheme)
  }, [gridData2D, gridData3D, node.colorScheme, renderMode, sliceIndex])

  const singlePlaneMaterial = useMemo(() => {
    if (!singlePlaneTexture) return null

    return new MeshBasicMaterial({
      map: singlePlaneTexture,
      transparent: true,
      opacity: node.opacity ?? 0.7,
      side: DoubleSide,
      depthWrite: false,
      depthTest: true,
    })
  }, [node.opacity, singlePlaneTexture])

  useEffect(() => {
    if (!singlePlaneMaterial) return

    return () => {
      const seen = new Set<string>()
      disposeMaterialWithMap(singlePlaneMaterial, seen)
    }
  }, [singlePlaneMaterial])

  const [lodTier, setLodTier] = useState<LodTier>('mid')
  const lodTierRef = useRef<LodTier>(lodTier)
  const { camera } = useThree()
  const roomCenterRef = useRef(new Vector3())

  useFrame(() => {
    roomCenterRef.current.set(centerX, roomHeight / 2, centerZ)
    const distance = camera.position.distanceTo(roomCenterRef.current)
    const nextTier: LodTier = distance < 5 ? 'near' : distance < 15 ? 'mid' : 'far'

    if (nextTier !== lodTierRef.current) {
      lodTierRef.current = nextTier
      setLodTier(nextTier)
    }
  })

  const horizontalSlices = useMemo(() => {
    if (renderMode !== '3d-volume') return []

    const baseOpacity = node.opacity ?? 0.7
    const totalVerticalLevels = gridData3D?.verticalLevels ?? (node.data.verticalLevels ?? 25)

    if (gridData3D) {
      const visibleLevels = (() => {
        if (lodTier === 'near') return Math.min(25, totalVerticalLevels)
        if (lodTier === 'mid') return Math.min(15, totalVerticalLevels)
        return Math.min(10, totalVerticalLevels)
      })()

      const textures = createHeatmapTexture3D(
        { ...gridData3D, verticalLevels: visibleLevels },
        node.colorScheme,
      )
      const opacityScale = (10 / visibleLevels) * 0.7

      return textures.map((texture, index) => {
        const normalizedHeight =
          node.data.heightOffsets?.[index] ?? index / Math.max(visibleLevels - 1, 1)
        const y = normalizedHeight * roomHeight
        const opacity =
          baseOpacity *
          (0.3 + 0.7 * (1 - Math.abs(normalizedHeight - 0.5) * 0.5)) *
          opacityScale

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

    if (!gridData2D) return []

    const sliceCount = 8
    const texture = createHeatmapTexture(gridData2D, node.colorScheme)

    return Array.from({ length: sliceCount }, (_, index) => {
      const t = index / Math.max(sliceCount - 1, 1)
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
  }, [
    gridData2D,
    gridData3D,
    lodTier,
    node.colorScheme,
    node.data.heightOffsets,
    node.data.verticalLevels,
    node.opacity,
    renderMode,
    roomHeight,
  ])

  useEffect(() => {
    return () => {
      const seen = new Set<string>()
      for (const slice of horizontalSlices) {
        disposeMaterialWithMap(slice.material, seen)
      }
    }
  }, [horizontalSlices])

  const wallSlices = useMemo(() => {
    if (renderMode !== '3d-volume') return null

    const baseOpacity = (node.opacity ?? 0.7) * 0.35
    const gridSize = node.data.gridSize || 20
    const totalVerticalLevels = gridData3D?.verticalLevels ?? (node.data.verticalLevels ?? 25)

    if (!gridData3D) {
      if (!gridData2D) return null

      const texture = createHeatmapTexture(gridData2D, node.colorScheme)
      const material = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })

      return {
        frontMat: material,
        backMat: material,
        leftMat: material,
        rightMat: material,
      }
    }

    const visibleLevels = (() => {
      if (lodTier === 'near') return Math.min(25, totalVerticalLevels)
      if (lodTier === 'mid') return Math.min(15, totalVerticalLevels)
      return Math.min(10, totalVerticalLevels)
    })()

    const frontTex = createVerticalSliceTexture(
      gridData3D.values,
      dataBounds.min,
      dataBounds.max,
      'z',
      0,
      gridSize,
      visibleLevels,
      node.colorScheme,
    )
    const backTex = createVerticalSliceTexture(
      gridData3D.values,
      dataBounds.min,
      dataBounds.max,
      'z',
      gridSize - 1,
      gridSize,
      visibleLevels,
      node.colorScheme,
    )
    const leftTex = createVerticalSliceTexture(
      gridData3D.values,
      dataBounds.min,
      dataBounds.max,
      'x',
      0,
      gridSize,
      visibleLevels,
      node.colorScheme,
    )
    const rightTex = createVerticalSliceTexture(
      gridData3D.values,
      dataBounds.min,
      dataBounds.max,
      'x',
      gridSize - 1,
      gridSize,
      visibleLevels,
      node.colorScheme,
    )

    const createMaterial = (texture: DataTexture) =>
      new MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: baseOpacity,
        side: DoubleSide,
        depthWrite: false,
        depthTest: true,
      })

    return {
      frontMat: createMaterial(frontTex),
      backMat: createMaterial(backTex),
      leftMat: createMaterial(leftTex),
      rightMat: createMaterial(rightTex),
    }
  }, [
    dataBounds.max,
    dataBounds.min,
    gridData2D,
    gridData3D,
    lodTier,
    node.colorScheme,
    node.data.gridSize,
    node.data.verticalLevels,
    node.opacity,
    renderMode,
  ])

  useEffect(() => {
    if (!wallSlices) return

    return () => {
      const seen = new Set<string>()
      disposeMaterialWithMap(wallSlices.frontMat, seen)
      disposeMaterialWithMap(wallSlices.backMat, seen)
      disposeMaterialWithMap(wallSlices.leftMat, seen)
      disposeMaterialWithMap(wallSlices.rightMat, seen)
    }
  }, [wallSlices])

  const horizontalGeo = useMemo(() => new PlaneGeometry(width, depth), [depth, width])
  const wallGeoFrontBack = useMemo(() => new PlaneGeometry(width, roomHeight), [roomHeight, width])
  const wallGeoLeftRight = useMemo(() => new PlaneGeometry(depth, roomHeight), [depth, roomHeight])

  useEffect(() => () => horizontalGeo.dispose(), [horizontalGeo])
  useEffect(() => () => wallGeoFrontBack.dispose(), [wallGeoFrontBack])
  useEffect(() => () => wallGeoLeftRight.dispose(), [wallGeoLeftRight])

  const handlers = useNodeEvents(node, 'heatmap')
  const canRenderHeatmapSurface =
    renderMode === '3d-volume' ? horizontalSlices.length > 0 : !!singlePlaneMaterial
  const shouldRenderHeatmapSurface = showHeatmap && canRenderHeatmapSurface
  const shouldRenderVectors = showVectors && (hasRenderable2DData || hasRenderable3DData)
  const shouldShareHeatGrid = node.heatDiffusionEnabled && !!node.data.temperatureGrid3D?.length

  return (
    <group ref={ref} {...handlers}>
      {renderMode === '3d-volume' && shouldRenderHeatmapSurface && (
        <>
          {horizontalSlices.map((slice, index) => (
            <mesh
              key={`horizontal-${index}`}
              geometry={horizontalGeo}
              material={slice.material}
              position={[centerX, slice.y, centerZ]}
              rotation={[-Math.PI / 2, 0, 0]}
            />
          ))}

          {wallSlices && (
            <>
              <mesh
                geometry={wallGeoFrontBack}
                material={wallSlices.frontMat}
                position={[centerX, roomHeight / 2, roomBounds.minZ]}
              />
              <mesh
                geometry={wallGeoFrontBack}
                material={wallSlices.backMat}
                position={[centerX, roomHeight / 2, roomBounds.maxZ]}
              />
              <mesh
                geometry={wallGeoLeftRight}
                material={wallSlices.leftMat}
                position={[roomBounds.minX, roomHeight / 2, centerZ]}
                rotation={[0, Math.PI / 2, 0]}
              />
              <mesh
                geometry={wallGeoLeftRight}
                material={wallSlices.rightMat}
                position={[roomBounds.maxX, roomHeight / 2, centerZ]}
                rotation={[0, Math.PI / 2, 0]}
              />
            </>
          )}
        </>
      )}

      {renderMode !== '3d-volume' && shouldRenderHeatmapSurface && singlePlaneMaterial && (
        <mesh
          geometry={horizontalGeo}
          material={singlePlaneMaterial}
          position={[centerX, singlePlaneY, centerZ]}
          rotation={[-Math.PI / 2, 0, 0]}
        />
      )}

      {overlayParticleSystem && (
        <ParticleFlowRenderer
          node={overlayParticleSystem}
          roomBounds={{
            min: [roomBounds.minX, 0, roomBounds.minZ],
            max: [roomBounds.maxX, roomHeight, roomBounds.maxZ],
          }}
          sharedHeatGridRef={shouldShareHeatGrid ? grid3DRef : undefined}
          sharedActiveHeatCellIndicesRef={
            shouldShareHeatGrid ? activeHeatCellIndicesRef : undefined
          }
        />
      )}

      {shouldRenderVectors && (
        <VelocityVectors
          node={node}
          roomBounds={roomBounds}
          heightOffset={renderMode === '3d-slice' ? singlePlaneY : 1.2}
        />
      )}

      {showGinotPointCloud && hasGinotPoints && (
        <GinotPointCloud
          node={node}
          metric={ginotPointMetric}
          pointSize={ginotPointSize}
          opacity={ginotPointOpacity}
        />
      )}
    </group>
  )
}
