'use client'

import { useMemo } from 'react'
import { HVACConfigPanel } from '../../../../panels/hvac-config-panel'
import { HeatmapLegend } from '../../../../ui/hvac'
import { VisualizationControls } from '../../../../ui/hvac/visualization-controls'
import { useHVACRoomSelection } from '../../../../../hooks/use-hvac-room-selection'
import { useHVACAnalysis } from '../../../../../hooks/use-hvac-analysis'
import { Button } from '../../../../ui/primitives/button'
import { Eye, EyeOff } from 'lucide-react'

/**
 * HVAC Sidebar Panel - Left sidebar panel for HVAC configuration
 * Includes room selection, boundary conditions, simulation controls, and results
 */
export function HVACPanel() {
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
    heatmapVisible,
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
    toggleHeatmap,
  } = useHVACAnalysis()

  const thermalLegend = useMemo(() => {
    const values = activeHeatmapNode?.data.temperatureGrid3D?.flat(2)
      ?? activeHeatmapNode?.data.temperatureGrid.flat()
      ?? []

    if (values.length === 0) {
      return null
    }

    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      min: Number.isFinite(min) ? min : 18,
      max: Number.isFinite(max) ? max : 28,
    }
  }, [activeHeatmapNode])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border/50 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">HVAC Analysis</h2>
        <p className="text-xs text-muted-foreground">Configure and run airflow analysis</p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Boundary Conditions & Simulation */}
        <HVACConfigPanel
          conditions={boundaryConditions}
          isLoading={isLoading}
          onChange={setBoundaryConditions}
          onRunSimulation={handleRunAnalysis}
          selectedSpaceId={selectedSpaceId}
          spaces={spaces}
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
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Heatmap</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={toggleHeatmap}
                className="h-7 gap-1 px-2"
              >
                {heatmapVisible ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" />
                    <span className="text-xs">Hide</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    <span className="text-xs">Show</span>
                  </>
                )}
              </Button>
            </div>
            <VisualizationControls
              colorScheme={colorScheme}
              has3DData={has3DData}
              opacity={opacity}
              showParticles={showParticles}
              particleDensity={particleDensity}
              particleSize={particleSize}
              showParticleTrails={showParticleTrails}
              particleTrailLength={particleTrailLength}
              particlePressureEnabled={particlePressureEnabled}
              particleBuoyancyEnabled={particleBuoyancyEnabled}
              renderMode={renderMode}
              showVectors={showVectors}
              hasGinotPointCloud={hasGinotPointCloud}
              showGinotPointCloud={showGinotPointCloud}
              ginotPointMetric={ginotPointMetric}
              ginotPointSize={ginotPointSize}
              ginotPointOpacity={ginotPointOpacity}
              slicePosition={slicePosition}
              visualizationType={visualizationType}
              onColorSchemeChange={handleColorSchemeChange}
              onGinotPointCloudVisibilityChange={handleGinotPointCloudVisibilityChange}
              onGinotPointMetricChange={handleGinotPointMetricChange}
              onGinotPointSizeChange={handleGinotPointSizeChange}
              onGinotPointOpacityChange={handleGinotPointOpacityChange}
              onOpacityChange={handleOpacityChange}
              onShowParticlesChange={handleShowParticlesChange}
              onParticleDensityChange={handleParticleDensityChange}
              onParticleSizeChange={handleParticleSizeChange}
              onShowParticleTrailsChange={handleParticleTrailsChange}
              onParticleTrailLengthChange={handleParticleTrailLengthChange}
              onParticlePressureChange={handleParticlePressureChange}
              onParticleBuoyancyChange={handleParticleBuoyancyChange}
              onRenderModeChange={handleRenderModeChange}
              onShowVectorsChange={setShowVectors}
              onSlicePositionChange={handleSlicePositionChange}
              onVisualizationTypeChange={handleVisualizationTypeChange}
            />

            {thermalLegend && (
              <div className="mt-3">
                <HeatmapLegend
                  min={thermalLegend.min}
                  max={thermalLegend.max}
                  unit="°C"
                  colorScheme={colorScheme}
                  label="Particle Temperature"
                  note="Particles leave supply diffusers with supply-air temperature, mix through the room, and disappear into return collectors."
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
