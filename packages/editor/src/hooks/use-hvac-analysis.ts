'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { useScene, HeatmapNode } from '@pascal-app/core'
import type { HeatmapNode as HeatmapNodeValue } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useHVACScenarios } from '../store/use-hvac-scenarios'
import type { HVACBoundaryConditions, HVACScenario } from '../store/use-hvac-scenarios'
import { callGinotMeshInference } from '../lib/hvac/ai-inference-client'
import {
  findAllDiffusers,
  findDiffusersInZone,
  getAggregatedDiffuserPosition,
  getPrimaryDiffuser,
} from '../lib/hvac/diffuser-detector'
import {
  exportSceneToStlBlob,
  buildDiffuserInput,
  buildGinotHeatmapGrids,
  getValidDiffusersForInference,
  validateDiffuserSet,
} from '../lib/hvac'
import type { LevelNode, ZoneNode } from '@pascal-app/core'
import type { Bounds3D } from '../lib/hvac'
import { MeshAnalysisRunCoordinator } from '../lib/hvac/mesh-analysis-run-coordinator'
import {
  createGinotMeshValidationError,
  formatGinotMeshInferenceError,
} from '../lib/hvac/mesh-inference-errors'

type AirflowVisualizationType = 'speed' | 'pressure'

function getLevelHeight(level: LevelNode | null | undefined): number {
  const metadata = level?.metadata as Record<string, unknown> | undefined
  return typeof metadata?.ceilingHeight === 'number' ? metadata.ceilingHeight : 2.8
}

function getRoomBounds(
  zone: ZoneNode,
  level: LevelNode | null | undefined,
): Bounds3D {
  const xs = zone.polygon.map((point) => point[0])
  const zs = zone.polygon.map((point) => point[1])
  const height = getLevelHeight(level)

  return {
    min: {
      x: Math.min(...xs),
      y: 0,
      z: Math.min(...zs),
    },
    max: {
      x: Math.max(...xs),
      y: height,
      z: Math.max(...zs),
    },
  }
}

export interface HVACAnalysisResult {
  isLoading: boolean
  error: string | null
  activeHeatmapId: string | null
  boundaryConditions: HVACBoundaryConditions
  setBoundaryConditions: Dispatch<SetStateAction<HVACBoundaryConditions>>
  currentScenario: HVACScenario | null
  visualizationType: AirflowVisualizationType
  colorScheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  opacity: number
  showVectors: boolean
  renderMode: '2d' | '3d-slice' | '3d-volume'
  slicePosition: number
  has3DData: boolean
  hasGinotPointCloud: boolean
  showGinotPointCloud: boolean
  ginotPointMetric: 'speed' | 'pressure'
  ginotPointSize: number
  ginotPointOpacity: number
  heatmapVisible: boolean
  activeHeatmapNode: HeatmapNodeValue | null
  handleRunAnalysis: () => Promise<void>
  handleVisualizationTypeChange: (type: AirflowVisualizationType) => void
  handleColorSchemeChange: (scheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm') => void
  handleOpacityChange: (newOpacity: number) => void
  setShowVectors: (show: boolean) => void
  handleRenderModeChange: (mode: '2d' | '3d-slice' | '3d-volume') => void
  handleSlicePositionChange: (position: number) => void
  handleGinotPointCloudVisibilityChange: (show: boolean) => void
  handleGinotPointMetricChange: (metric: 'speed' | 'pressure') => void
  handleGinotPointSizeChange: (size: number) => void
  handleGinotPointOpacityChange: (nextOpacity: number) => void
  toggleHeatmap: () => void
}

function stripParticleSystemMetadata(
  metadata?: HeatmapNodeValue['metadata'],
): HeatmapNodeValue['metadata'] | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined
  }

  const { particleSystem: _particleSystem, ...rest } = metadata as Record<string, unknown>
  return Object.keys(rest).length > 0 ? (rest as HeatmapNodeValue['metadata']) : undefined
}

/**
 * Hook that manages HVAC analysis orchestration:
 * - Boundary conditions state
 * - Diffuser auto-detection
 * - Mesh inference calls
 * - Heatmap node CRUD
 * - Scenario CRUD
 * - Visualization settings
 */
export function useHVACAnalysis(): HVACAnalysisResult {
  const nodes = useScene((state) => state.nodes)
  const createNode = useScene((state) => state.createNode)
  const selection = useViewer((state) => state.selection)
  const showHeatmap = useViewer((state) => state.showHeatmap)
  const setShowHeatmap = useViewer((state) => state.setShowHeatmap)
  const showVectors = useViewer((state) => state.showHeatmapVectors)
  const setShowVectors = useViewer((state) => state.setShowHeatmapVectors)
  const renderMode = useViewer((state) => state.heatmapRenderMode)
  const setRenderMode = useViewer((state) => state.setHeatmapRenderMode)
  const slicePosition = useViewer((state) => state.heatmapSlicePosition)
  const setSlicePosition = useViewer((state) => state.setHeatmapSlicePosition)
  const showGinotPointCloud = useViewer((state) => state.showGinotPointCloud)
  const setShowGinotPointCloud = useViewer((state) => state.setShowGinotPointCloud)
  const ginotPointMetric = useViewer((state) => state.ginotPointMetric)
  const setGinotPointMetric = useViewer((state) => state.setGinotPointMetric)
  const ginotPointSize = useViewer((state) => state.ginotPointSize)
  const setGinotPointSize = useViewer((state) => state.setGinotPointSize)
  const ginotPointOpacity = useViewer((state) => state.ginotPointOpacity)
  const setGinotPointOpacity = useViewer((state) => state.setGinotPointOpacity)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeHeatmapId, setActiveHeatmapId] = useState<string | null>(null)

  // Visualization settings
  const [visualizationType, setVisualizationType] = useState<AirflowVisualizationType>('speed')
  const [colorScheme, setColorScheme] = useState<'jet' | 'viridis' | 'plasma' | 'coolwarm'>('jet')
  const [opacity, setOpacity] = useState(0.7)
  const runCoordinatorRef = useRef(new MeshAnalysisRunCoordinator())

  const {
    createScenario,
    updateScenario,
    activeScenarioId,
    scenarios,
    selectedZoneId,
  } = useHVACScenarios()

  const [boundaryConditions, setBoundaryConditions] = useState<HVACBoundaryConditions>({
    supplyAirTemp: 20,
    airflowRate: 100,
    diffuserPosition: [0, 2.5, 0],
    diffusers: [],
    occupancy: 2,
    outdoorTemp: 25,
  })

  const activeHeatmapNode = useMemo<HeatmapNodeValue | null>(() => {
    if (!activeHeatmapId) return null
    const node = nodes[activeHeatmapId as keyof typeof nodes]
    return node?.type === 'heatmap' ? (node as HeatmapNodeValue) : null
  }, [activeHeatmapId, nodes])

  const has3DData = useMemo(() => {
    if (!activeHeatmapNode) return false
    return (
      !!activeHeatmapNode.data.temperatureGrid3D?.length ||
      !!activeHeatmapNode.data.velocityGrid3D?.length ||
      !!activeHeatmapNode.data.pressureGrid3D?.length
    )
  }, [activeHeatmapNode])

  const hasGinotPointCloud = useMemo(() => {
    return !!activeHeatmapNode?.data.ginotPointCloud?.length
  }, [activeHeatmapNode])

  useEffect(() => {
    return () => {
      runCoordinatorRef.current.abortCurrent('mesh-analysis-unmount')
    }
  }, [])

  // Auto-detect diffusers when zone selection or nodes change
  useEffect(() => {
    const zoneNode = selectedZoneId
      ? (nodes as any)[selectedZoneId]
      : selection.zoneId
        ? (nodes as any)[selection.zoneId]
        : Object.values(nodes).find((n) => n?.type === 'zone')

    const allDiffusers = findAllDiffusers(nodes)

    if (allDiffusers.length > 0) {
      let diffusers = allDiffusers
      if (zoneNode?.polygon) {
        diffusers = findDiffusersInZone(zoneNode.id, nodes, zoneNode.polygon)
      }

      if (diffusers.length === 0) {
        diffusers = allDiffusers
      }

      const aggregatedPosition = getAggregatedDiffuserPosition(diffusers)
      const primaryDiffuser = getPrimaryDiffuser(diffusers)

      if (aggregatedPosition) {
        setBoundaryConditions((prev) => ({
          ...prev,
          diffuserPosition: aggregatedPosition,
          diffusers,
        }))
      } else if (primaryDiffuser) {
        setBoundaryConditions((prev) => ({
          ...prev,
          diffuserPosition: primaryDiffuser.position,
          diffusers,
        }))
      }
    }
  }, [selectedZoneId, selection.zoneId, nodes])

  const handleRunAnalysis = useCallback(async () => {
    const controller = new AbortController()
    const runId = runCoordinatorRef.current.start(controller)

    setIsLoading(true)
    setError(null)

    try {
      const zoneNode = selectedZoneId
        ? (nodes as any)[selectedZoneId]
        : selection.zoneId
          ? (nodes as any)[selection.zoneId]
          : Object.values(nodes).find((n) => n?.type === 'zone')
      const levelNode = selection.levelId
        ? (nodes as any)[selection.levelId]
        : Object.values(nodes).find((n) => n?.type === 'level')

      if (!zoneNode || !levelNode) {
        throw new Error('No zone or level found. Please create a room first.')
      }

      // Detect diffusers for the mesh inference request.
      const allDiffusers = findAllDiffusers(nodes)
      let diffusers = allDiffusers
      if (zoneNode?.polygon) {
        diffusers = findDiffusersInZone(zoneNode.id, nodes, zoneNode.polygon)
      }
      if (diffusers.length === 0) {
        diffusers = allDiffusers
      }

      const roomBounds = getRoomBounds(zoneNode as ZoneNode, levelNode as LevelNode)

      const threeScene = useViewer.getState().threeScene
      if (!threeScene) {
        throw new Error('Three.js scene not available')
      }
      const sceneGroup = threeScene.getObjectByName('scene-renderer')
      if (!sceneGroup) {
        throw new Error('Scene renderer not found')
      }

      const stlBlob = await exportSceneToStlBlob(sceneGroup, {
        zoneId: zoneNode.id,
        levelId: levelNode.id,
      })

      if (controller.signal.aborted || !runCoordinatorRef.current.isCurrent(runId)) {
        return
      }

      const inferenceDiffusers = getValidDiffusersForInference(diffusers)
      const diffuserValidation = validateDiffuserSet(inferenceDiffusers)
      if (!diffuserValidation.valid) {
        throw createGinotMeshValidationError(diffuserValidation.errors)
      }

      const ginotResponse = await callGinotMeshInference({
        meshFile: stlBlob,
        diffusers: buildDiffuserInput(inferenceDiffusers),
        options: {
          quality: 'standard',
        },
        context: {
          projectId: 'current',
          levelId: levelNode.id,
          zoneId: zoneNode.id,
        },
      }, {
        signal: controller.signal,
      })

      if (controller.signal.aborted || !runCoordinatorRef.current.isCurrent(runId)) {
        return
      }

      const { positions, velocities, pressure, speed } = ginotResponse
      if (
        positions.length !== velocities.length ||
        positions.length !== pressure.length ||
        positions.length !== speed.length
      ) {
        throw new Error('Invalid response: array length mismatch')
      }

      const pointCloudData = ginotResponse.positions.map((position, index) => ({
        position,
        velocity: ginotResponse.velocities[index] ?? [0, 0, 0],
        pressure: ginotResponse.pressure[index] ?? 0,
        speed: ginotResponse.speed[index] ?? 0,
      }))
      const ginotHeatmapGrids = buildGinotHeatmapGrids(ginotResponse, roomBounds, {
        gridSize: 20,
        verticalLevels: 25,
      })

      const heatmapData = {
        gridSize: ginotHeatmapGrids.gridSize,
        temperatureGrid: [],
        velocityGrid: ginotHeatmapGrids.velocityGrid,
        velocityDirection: ginotHeatmapGrids.velocityDirection,
        pressureGrid: ginotHeatmapGrids.pressureGrid,
        temperatureGrid3D: undefined,
        velocityGrid3D: ginotHeatmapGrids.velocityGrid3D,
        velocityGrid3DDirection: ginotHeatmapGrids.velocityGrid3DDirection,
        pressureGrid3D: ginotHeatmapGrids.pressureGrid3D,
        heightOffsets: undefined,
        ginotPointCloud: pointCloudData,
        speedField: [...ginotResponse.speed],
        pressureField: [...ginotResponse.pressure],
        averageTemperature: 0,
        pmv: 0,
        comfortScore: 0,
        verticalLevels: ginotHeatmapGrids.verticalLevels,
      }

      let heatmapId = activeHeatmapId

      if (heatmapId) {
        const currentNode = useScene.getState().nodes[heatmapId as keyof typeof nodes]
        const existingHeatmapNode =
          currentNode?.type === 'heatmap' ? (currentNode as HeatmapNodeValue) : null
        const cleanedMetadata = stripParticleSystemMetadata(existingHeatmapNode?.metadata)

        useScene.getState().updateNode(heatmapId as any, {
          data: heatmapData,
          inferenceId: ginotResponse.inferenceId,
          inferenceTimestamp: ginotResponse.timestamp,
          visualizationType,
          colorScheme,
          opacity,
          heatDiffusionEnabled: false,
          metadata: cleanedMetadata ?? {},
        })
      } else {
        const heatmapNode = HeatmapNode.parse({
          data: heatmapData,
          levelId: levelNode.id,
          zoneId: zoneNode.id,
          inferenceId: ginotResponse.inferenceId,
          inferenceTimestamp: ginotResponse.timestamp,
          parentId: levelNode.id,
          visualizationType,
          colorScheme,
          opacity,
          heatDiffusionEnabled: false,
        })
        createNode(heatmapNode, levelNode.id as any)
        heatmapId = heatmapNode.id
        setActiveHeatmapId(heatmapId)

        useScene.getState().dirtyNodes.add(heatmapNode.id)
      }

      setShowHeatmap(true)
      setShowGinotPointCloud(true)
      setGinotPointMetric(visualizationType)

      // Update scenario state
      const scenarioName = `Scenario ${scenarios.length + 1}`
      if (activeScenarioId) {
        updateScenario(activeScenarioId, undefined)
      } else {
        createScenario(scenarioName, boundaryConditions)
      }
    } catch (err) {
      if (!runCoordinatorRef.current.isCurrent(runId)) {
        return
      }

      const message = formatGinotMeshInferenceError(err)
      if (message) {
        setError(message)
      }
    } finally {
      if (runCoordinatorRef.current.finish(runId)) {
        setIsLoading(false)
      }
    }
  }, [
    nodes,
    createNode,
    boundaryConditions,
    selectedZoneId,
    selection.zoneId,
    selection.levelId,
    activeHeatmapId,
    activeScenarioId,
    scenarios.length,
    createScenario,
    updateScenario,
    visualizationType,
    colorScheme,
    opacity,
    setShowHeatmap,
    setShowGinotPointCloud,
    setGinotPointMetric,
  ])

  const handleVisualizationTypeChange = useCallback((type: AirflowVisualizationType) => {
    setVisualizationType(type)
    setGinotPointMetric(type)
    if (activeHeatmapId) {
      useScene.getState().updateNode(activeHeatmapId as any, { visualizationType: type })
    }
  }, [activeHeatmapId, setGinotPointMetric])

  const handleColorSchemeChange = useCallback((scheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm') => {
    setColorScheme(scheme)
    if (activeHeatmapId) {
      useScene.getState().updateNode(activeHeatmapId as any, { colorScheme: scheme })
    }
  }, [activeHeatmapId])

  const handleOpacityChange = useCallback((newOpacity: number) => {
    setOpacity(newOpacity)
    if (activeHeatmapId) {
      useScene.getState().updateNode(activeHeatmapId as any, { opacity: newOpacity })
    }
  }, [activeHeatmapId])

  const handleRenderModeChange = useCallback((mode: '2d' | '3d-slice' | '3d-volume') => {
    setRenderMode(mode)
  }, [setRenderMode])

  const handleSlicePositionChange = useCallback((position: number) => {
    setSlicePosition(position)
  }, [setSlicePosition])

  const handleGinotPointCloudVisibilityChange = useCallback((show: boolean) => {
    setShowGinotPointCloud(show)
  }, [setShowGinotPointCloud])

  const handleGinotPointMetricChange = useCallback((metric: 'speed' | 'pressure') => {
    handleVisualizationTypeChange(metric)
  }, [handleVisualizationTypeChange])

  const handleGinotPointSizeChange = useCallback((size: number) => {
    setGinotPointSize(Math.round(size * 1000) / 1000)
  }, [setGinotPointSize])

  const handleGinotPointOpacityChange = useCallback((nextOpacity: number) => {
    setGinotPointOpacity(Math.round(nextOpacity * 100) / 100)
  }, [setGinotPointOpacity])

  const toggleHeatmap = useCallback(() => {
    setShowHeatmap(!showHeatmap)
  }, [showHeatmap, setShowHeatmap])

  const currentScenario = activeScenarioId
    ? scenarios.find((s) => s.id === activeScenarioId) ?? null
    : null

  return {
    isLoading,
    error,
    activeHeatmapId,
    boundaryConditions,
    setBoundaryConditions,
    currentScenario,
    visualizationType,
    colorScheme,
    opacity,
    showVectors,
    renderMode,
    slicePosition,
    has3DData,
    hasGinotPointCloud,
    showGinotPointCloud,
    ginotPointMetric,
    ginotPointSize,
    ginotPointOpacity,
    heatmapVisible: showHeatmap,
    activeHeatmapNode,
    handleRunAnalysis,
    handleVisualizationTypeChange,
    handleColorSchemeChange,
    handleOpacityChange,
    setShowVectors,
    handleRenderModeChange,
    handleSlicePositionChange,
    handleGinotPointCloudVisibilityChange,
    handleGinotPointMetricChange,
    handleGinotPointSizeChange,
    handleGinotPointOpacityChange,
    toggleHeatmap,
  }
}
