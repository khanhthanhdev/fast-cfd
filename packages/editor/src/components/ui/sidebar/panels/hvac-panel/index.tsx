'use client'

import { HVACConfigPanel } from '../../../../panels/hvac-config-panel'
import { ComfortKPIDisplay, ExportReportButton } from '../../../../ui/hvac'
import { VisualizationControls } from '../../../../ui/hvac/visualization-controls'
import { PanelSection } from '../../../controls/panel-section'
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
    currentScenario,
    visualizationType,
    colorScheme,
    opacity,
    showVectors,
    renderMode,
    slicePosition,
    has3DData,
    heatmapVisible,
    handleRunAnalysis,
    handleVisualizationTypeChange,
    handleColorSchemeChange,
    handleOpacityChange,
    setShowVectors,
    handleRenderModeChange,
    handleSlicePositionChange,
    toggleHeatmap,
  } = useHVACAnalysis()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border/50 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">HVAC Analysis</h2>
        <p className="text-xs text-muted-foreground">Configure and run CFD simulation</p>
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

        {/* Comfort KPIs */}
        {currentScenario?.results && (
          <PanelSection title="Comfort KPIs">
            <ComfortKPIDisplay
              averageTemperature={currentScenario.results.averageTemperature}
              comfortScore={currentScenario.results.comfortScore}
              pmv={currentScenario.results.pmv}
            />
          </PanelSection>
        )}

        {/* Visualization Controls */}
        {activeHeatmapId && (
          <PanelSection title="Visualization">
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
              renderMode={renderMode}
              showVectors={showVectors}
              slicePosition={slicePosition}
              visualizationType={visualizationType}
              onColorSchemeChange={handleColorSchemeChange}
              onOpacityChange={handleOpacityChange}
              onRenderModeChange={handleRenderModeChange}
              onShowVectorsChange={setShowVectors}
              onSlicePositionChange={handleSlicePositionChange}
              onVisualizationTypeChange={handleVisualizationTypeChange}
            />
          </PanelSection>
        )}
      </div>

      {/* Footer - Export */}
      {currentScenario?.results && (
        <div className="border-border/50 border-t p-3">
          <ExportReportButton projectName="HVAC Analysis" />
        </div>
      )}
    </div>
  )
}
