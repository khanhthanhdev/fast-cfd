'use client'

import { useState, useCallback, useEffect } from 'react'
import { useScene, HeatmapNode } from '@pascal-app/core'
import { useViewer } from '@pascal-app/viewer'
import { useHVACScenarios } from '../store/use-hvac-scenarios'
import type { HVACBoundaryConditions } from '../store/use-hvac-scenarios'
import { callAIInference, callGinotInference } from '../lib/hvac/ai-inference-client'
import { buildFeatureVector, extractRoomGeometry } from '../lib/hvac/feature-vector-builder'
import {
  findAllDiffusers,
  findDiffusersInZone,
  getAggregatedDiffuserPosition,
  getPrimaryDiffuser,
} from '../lib/hvac/diffuser-detector'
import {
  buildGinotInput,
  buildMockGinotInput,
  validateGinotInput,
  buildRoomGeometryFromScene,
} from '../lib/hvac'
import type { LevelNode, ZoneNode } from '@pascal-app/core'

/**
 * Hook that manages HVAC analysis orchestration:
 * - Boundary conditions state
 * - Diffuser auto-detection
 * - AI inference calls
 * - Heatmap node CRUD
 * - Scenario CRUD
 * - Visualization settings
 */
export function useHVACAnalysis() {
  const nodes = useScene((state) => state.nodes)
  const createNode = useScene((state) => state.createNode)
  const deleteNode = useScene((state) => state.deleteNode)
  const selection = useViewer((state) => state.selection)
  const showVectors = useViewer((state) => state.showHeatmapVectors)
  const setShowVectors = useViewer((state) => state.setShowHeatmapVectors)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeHeatmapId, setActiveHeatmapId] = useState<string | null>(null)
  const [lastScenarioId, setLastScenarioId] = useState<string | null>(null)

  // Visualization settings
  const [visualizationType, setVisualizationType] = useState<'temperature' | 'velocity' | 'pmv' | 'speed' | 'pressure'>('temperature')
  const [colorScheme, setColorScheme] = useState<'jet' | 'viridis' | 'plasma' | 'coolwarm'>('jet')
  const [opacity, setOpacity] = useState(0.7)

  // 3D visualization settings
  const [renderMode, setRenderMode] = useState<'2d' | '3d-slice' | '3d-volume'>('2d')
  const [slicePosition, setSlicePosition] = useState(0.5)
  const [has3DData, setHas3DData] = useState(false)

  // GINOT mode flag
  const [ginotMode, setGinotMode] = useState(false)

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

      // Detect diffusers for GINOT mode
      const allDiffusers = findAllDiffusers(nodes)
      let diffusers = allDiffusers
      if (zoneNode?.polygon) {
        diffusers = findDiffusersInZone(zoneNode.id, nodes, zoneNode.polygon)
      }
      if (diffusers.length === 0) {
        diffusers = allDiffusers
      }

      const supplyDiffusers = diffusers.filter(d => d.type === 'supply')
      const returnDiffusers = diffusers.filter(d => d.type === 'return')

      // Store response state for scenario update
      let ginotResponse: Awaited<ReturnType<typeof callGinotInference>> | null = null
      let legacyResponse: Awaited<ReturnType<typeof callAIInference>> | null = null

      if (ginotMode) {
        // === GINOT Neural Operator Mode ===
        // Build room geometry snapshot
        const geometry = buildRoomGeometryFromScene(
          levelNode as LevelNode,
          zoneNode as ZoneNode,
          nodes
        )

        // Build GINOT input tensors
        const ginotInput = buildGinotInput(geometry, {
          supplyDiffusers,
          returnDiffusers,
        })

        // Validate input
        const validation = validateGinotInput(ginotInput)
        if (!validation.valid) {
          throw new Error(`GINOT input validation failed: ${validation.errors.join(', ')}`)
        }

        // Call GINOT inference
        ginotResponse = await callGinotInference({
          load: Array.from(ginotInput.load),
          pc: Array.from(ginotInput.pc),
          xyt: Array.from(ginotInput.xyt),
          metadata: ginotInput.metadata,
        })

        setHas3DData(true)

        // Convert GINOT response to heatmap node data
        // GINOT returns point cloud data - we store it for visualization
        const pointCloudData = ginotResponse!.positions.map((pos, i) => ({
          position: pos as [number, number, number],
          velocity: ginotResponse!.velocities[i] as [number, number, number],
          pressure: ginotResponse!.pressure[i]!,
          speed: ginotResponse!.speed[i]!,
        }))

        // Calculate statistics for color mapping
        const speedMin = Math.min(...ginotResponse!.speed)
        const speedMax = Math.max(...ginotResponse!.speed)
        const pressureMin = Math.min(...ginotResponse!.pressure)
        const pressureMax = Math.max(...ginotResponse!.pressure)

        let heatmapId = activeHeatmapId

        if (heatmapId) {
          useScene.getState().updateNode(heatmapId as any, {
            data: {
              gridSize: 20,
              temperatureGrid: [],
              velocityGrid: [],
              averageTemperature: 0,
              pmv: 0,
              comfortScore: 0,
              verticalLevels: 25,
              temperatureGrid3D: undefined,
              velocityGrid3D: undefined,
              ginotPointCloud: pointCloudData,
              speedField: ginotResponse!.speed,
              pressureField: ginotResponse!.pressure,
              ginotVisualizationType: visualizationType === 'speed' ? 'speed' : visualizationType === 'pressure' ? 'pressure' : undefined,
            },
            dataMin: visualizationType === 'speed' ? speedMin : pressureMin,
            dataMax: visualizationType === 'speed' ? speedMax : pressureMax,
            visualizationType,
            colorScheme,
            opacity,
          })
        } else {
          const heatmapNode = HeatmapNode.parse({
            data: {
              gridSize: 20,
              temperatureGrid: [],
              velocityGrid: [],
              temperatureGrid3D: undefined,
              velocityGrid3D: undefined,
              ginotPointCloud: pointCloudData,
              speedField: ginotResponse!.speed,
              pressureField: ginotResponse!.pressure,
              dataMin: visualizationType === 'speed' ? speedMin : pressureMin,
              dataMax: visualizationType === 'speed' ? speedMax : pressureMax,
            },
            levelId: levelNode.id,
            zoneId: zoneNode.id,
            inferenceId: ginotResponse!.inferenceId,
            inferenceTimestamp: ginotResponse!.timestamp,
            parentId: levelNode.id,
            visualizationType,
            colorScheme,
            opacity,
          })

          createNode(heatmapNode, levelNode.id as any)
          heatmapId = heatmapNode.id
          setActiveHeatmapId(heatmapId)

          useScene.getState().dirtyNodes.add(heatmapNode.id)
        }
      } else {
        // === Legacy 12-feature Surrogate Model Mode ===
        const geometry = extractRoomGeometry(levelNode, zoneNode, nodes)
        const featureVector = buildFeatureVector(geometry, boundaryConditions)

        legacyResponse = await callAIInference({
          featureVector,
          gridSize: 20,
          verticalLevels: 10,
        })

        setHas3DData(!!legacyResponse.temperatureGrid3D && !!legacyResponse.velocityGrid3D)

        let heatmapId = activeHeatmapId

        if (heatmapId) {
          useScene.getState().updateNode(heatmapId as any, {
            data: {
              gridSize: 20,
              temperatureGrid: legacyResponse.temperatureGrid,
              velocityGrid: legacyResponse.velocityGrid,
              temperatureGrid3D: legacyResponse.temperatureGrid3D,
              velocityGrid3D: legacyResponse.velocityGrid3D,
              velocityGrid3DDirection: legacyResponse.velocityGrid3DDirection,
              verticalLevels: legacyResponse.verticalLevels ?? 10,
              heightOffsets: legacyResponse.heightOffsets,
              averageTemperature: legacyResponse.averageTemperature,
              pmv: legacyResponse.pmv,
              comfortScore: legacyResponse.comfortScore,
            },
            visualizationType,
            colorScheme,
            opacity,
          })
        } else {
          const heatmapNode = HeatmapNode.parse({
            data: {
              gridSize: 20,
              temperatureGrid: legacyResponse.temperatureGrid,
              velocityGrid: legacyResponse.velocityGrid,
              temperatureGrid3D: legacyResponse.temperatureGrid3D,
              velocityGrid3D: legacyResponse.velocityGrid3D,
              velocityGrid3DDirection: legacyResponse.velocityGrid3DDirection,
              verticalLevels: legacyResponse.verticalLevels ?? 10,
              heightOffsets: legacyResponse.heightOffsets,
              averageTemperature: legacyResponse.averageTemperature,
              pmv: legacyResponse.pmv,
              comfortScore: legacyResponse.comfortScore,
            },
            levelId: levelNode.id,
            zoneId: zoneNode.id,
            inferenceId: legacyResponse.inferenceId,
            inferenceTimestamp: legacyResponse.timestamp,
            parentId: levelNode.id,
            visualizationType,
            colorScheme,
            opacity,
          })

          createNode(heatmapNode, levelNode.id as any)
          heatmapId = heatmapNode.id
          setActiveHeatmapId(heatmapId)

          useScene.getState().dirtyNodes.add(heatmapNode.id)
        }
      }

      // Update scenario state
      const scenarioName = `Scenario ${scenarios.length + 1}`
      if (activeScenarioId) {
        updateScenario(activeScenarioId, {
          temperatureGrid: ginotMode ? [] : (legacyResponse as any).temperatureGrid,
          velocityGrid: ginotMode ? [] : (legacyResponse as any).velocityGrid,
          averageTemperature: 22, // GINOT doesn't provide temperature
          pmv: 0,
          comfortScore: 0.8,
        })
      } else {
        createScenario(scenarioName, boundaryConditions)
        const newScenarioId = useHVACScenarios.getState().activeScenarioId
        if (newScenarioId) {
          updateScenario(newScenarioId, {
            temperatureGrid: ginotMode ? [] : (legacyResponse as any).temperatureGrid,
            velocityGrid: ginotMode ? [] : (legacyResponse as any).velocityGrid,
            averageTemperature: 22,
            pmv: 0,
            comfortScore: 0.8,
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setIsLoading(false)
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
    ginotMode,
  ])

  const handleVisualizationTypeChange = useCallback((type: 'temperature' | 'velocity' | 'pmv' | 'speed' | 'pressure') => {
    setVisualizationType(type)
    if (activeHeatmapId) {
      useScene.getState().updateNode(activeHeatmapId as any, { visualizationType: type })
    }
  }, [activeHeatmapId])

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
  }, [])

  const handleSlicePositionChange = useCallback((position: number) => {
    setSlicePosition(position)
  }, [])

  const toggleHeatmap = useCallback(() => {
    if (activeHeatmapId) {
      // Hide by deleting the node
      deleteNode(activeHeatmapId as any)
      setLastScenarioId(activeScenarioId)
      setActiveHeatmapId(null)
    } else if (lastScenarioId) {
      // Show by re-running analysis with last scenario
      const scenario = scenarios.find((s) => s.id === lastScenarioId)
      if (scenario) {
        // Re-create heatmap from scenario data
        const levelNode = selection.levelId
          ? (nodes as any)[selection.levelId]
          : Object.values(nodes).find((n) => n?.type === 'level')
        const zoneNode = selectedZoneId
          ? (nodes as any)[selectedZoneId]
          : selection.zoneId
            ? (nodes as any)[selection.zoneId]
            : Object.values(nodes).find((n) => n?.type === 'zone')

        if (zoneNode && levelNode && scenario.results?.temperatureGrid) {
          const heatmapNode = HeatmapNode.parse({
            data: {
              gridSize: 20,
              temperatureGrid: scenario.results.temperatureGrid,
              velocityGrid: scenario.results.velocityGrid || [],
              temperatureGrid3D: undefined,
              velocityGrid3D: undefined,
              averageTemperature: scenario.results?.averageTemperature || 22,
              pmv: scenario.results?.pmv || 0,
              comfortScore: scenario.results?.comfortScore || 0.8,
            },
            levelId: levelNode.id,
            zoneId: zoneNode.id,
            parentId: levelNode.id,
            visualizationType,
            colorScheme,
            opacity,
          })

          createNode(heatmapNode, levelNode.id as any)
          setActiveHeatmapId(heatmapNode.id)
          useScene.getState().dirtyNodes.add(heatmapNode.id)
        }
      }
    }
  }, [activeHeatmapId, lastScenarioId, activeScenarioId, scenarios, deleteNode, createNode, nodes, selection, selectedZoneId, visualizationType, colorScheme, opacity])

  const currentScenario = activeScenarioId
    ? scenarios.find((s) => s.id === activeScenarioId)
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
    heatmapVisible: !!activeHeatmapId,
    handleRunAnalysis,
    handleVisualizationTypeChange,
    handleColorSchemeChange,
    handleOpacityChange,
    setShowVectors,
    handleRenderModeChange,
    handleSlicePositionChange,
    toggleHeatmap,
  }
}
