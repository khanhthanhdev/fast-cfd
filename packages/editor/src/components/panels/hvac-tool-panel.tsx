'use client'

import { useMemo } from 'react'
import useEditor from '../../store/use-editor'
import { HVACConfigPanel } from './hvac-config-panel'
import { HeatmapLegend } from '../ui/hvac'
import { VisualizationControls } from '../ui/hvac/visualization-controls'
import { PanelWrapper } from '../ui/panels/panel-wrapper'
import { useHVACRoomSelection } from '../../hooks/use-hvac-room-selection'
import { useHVACAnalysis } from '../../hooks/use-hvac-analysis'

/**
 * HVAC Side Panel - Main container for all HVAC-related UI
 * Includes configuration, simulation, results, scenario management, and export
 */
export const HVACToolPanel = () => {
  const tool = useEditor((s) => s.tool)

  const {
    spaces,
    selectedSpaceId,
    isCreating,
    handleSelectSpace,
    handleCreateZone,
  } = useHVACRoomSelection()

  const {
    isLoading,
    error,
    activeHeatmapId,
    boundaryConditions,
    setBoundaryConditions,
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
    showParticles,
    particleDensity,
    particleSize,
    showParticleTrails,
    particleTrailLength,
    particlePressureEnabled,
    particleBuoyancyEnabled,
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
    handleShowParticlesChange,
    handleParticleDensityChange,
    handleParticleSizeChange,
    handleParticleTrailsChange,
    handleParticleTrailLengthChange,
    handleParticlePressureChange,
    handleParticleBuoyancyChange,
  } = useHVACAnalysis()

  const thermalLegend = useMemo(() => {
    const values = activeHeatmapNode?.data.temperatureGrid3D?.flat(2)
      ?? activeHeatmapNode?.data.temperatureGrid.flat()
      ?? []

    if (values.length === 0) {
      return null
    }

    return {
      min: Math.min(...values),
      max: Math.max(...values),
    }
  }, [activeHeatmapNode])

  if (tool !== 'hvac') {
    return null
  }

  return (
    <PanelWrapper title="HVAC Analysis" width={320}>
      {/* Configuration & Simulation */}
      <HVACConfigPanel
        conditions={boundaryConditions}
        onChange={setBoundaryConditions}
        onRunSimulation={handleRunAnalysis}
        isLoading={isLoading}
        spaces={spaces}
        selectedSpaceId={selectedSpaceId}
        onSelectSpace={handleSelectSpace}
        onCreateZone={handleCreateZone}
        isCreatingZone={isCreating}
      />

      {/* Error Display */}
      {error && (
        <div className="mx-3 my-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Visualization Controls */}
      {activeHeatmapId && (
        <>
          <VisualizationControls
            visualizationType={visualizationType}
            colorScheme={colorScheme}
            opacity={opacity}
            showParticles={showParticles}
            particleDensity={particleDensity}
            particleSize={particleSize}
            showParticleTrails={showParticleTrails}
            particleTrailLength={particleTrailLength}
            particlePressureEnabled={particlePressureEnabled}
            particleBuoyancyEnabled={particleBuoyancyEnabled}
            showVectors={showVectors}
            hasGinotPointCloud={hasGinotPointCloud}
            showGinotPointCloud={showGinotPointCloud}
            ginotPointMetric={ginotPointMetric}
            ginotPointSize={ginotPointSize}
            ginotPointOpacity={ginotPointOpacity}
            onVisualizationTypeChange={handleVisualizationTypeChange}
            onColorSchemeChange={handleColorSchemeChange}
            onOpacityChange={handleOpacityChange}
            onShowParticlesChange={handleShowParticlesChange}
            onParticleDensityChange={handleParticleDensityChange}
            onParticleSizeChange={handleParticleSizeChange}
            onShowParticleTrailsChange={handleParticleTrailsChange}
            onParticleTrailLengthChange={handleParticleTrailLengthChange}
            onParticlePressureChange={handleParticlePressureChange}
            onParticleBuoyancyChange={handleParticleBuoyancyChange}
            onShowVectorsChange={setShowVectors}
            onGinotPointCloudVisibilityChange={handleGinotPointCloudVisibilityChange}
            onGinotPointMetricChange={handleGinotPointMetricChange}
            onGinotPointSizeChange={handleGinotPointSizeChange}
            onGinotPointOpacityChange={handleGinotPointOpacityChange}
            renderMode={renderMode}
            slicePosition={slicePosition}
            onRenderModeChange={handleRenderModeChange}
            onSlicePositionChange={handleSlicePositionChange}
            has3DData={has3DData}
          />

          {thermalLegend && (
            <div className="px-3 pb-3">
              <HeatmapLegend
                min={thermalLegend.min}
                max={thermalLegend.max}
                unit="°C"
                colorScheme={colorScheme}
                label="Particle Temperature"
                note="Supply particles carry thermal state through the room and disappear into return collectors."
              />
            </div>
          )}
        </>
      )}
    </PanelWrapper>
  )
}
