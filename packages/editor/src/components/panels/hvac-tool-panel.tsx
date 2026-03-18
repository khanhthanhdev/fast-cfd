'use client'

import useEditor from '../../store/use-editor'
import { HVACConfigPanel } from './hvac-config-panel'
import { ScenarioComparisonPanel } from './scenario-comparison-panel'
import { ComfortKPIDisplay, ExportReportButton } from '../ui/hvac'
import { VisualizationControls } from '../ui/hvac/visualization-controls'
import { PanelWrapper } from '../ui/panels/panel-wrapper'
import { PanelSection } from '../ui/controls/panel-section'
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
    currentScenario,
    visualizationType,
    colorScheme,
    opacity,
    showVectors,
    renderMode,
    slicePosition,
    has3DData,
    handleRunAnalysis,
    handleVisualizationTypeChange,
    handleColorSchemeChange,
    handleOpacityChange,
    setShowVectors,
    handleRenderModeChange,
    handleSlicePositionChange,
  } = useHVACAnalysis()

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

      {/* Comfort KPIs */}
      {currentScenario?.results && (
        <PanelSection title="Comfort KPIs">
          <ComfortKPIDisplay
            pmv={currentScenario.results.pmv}
            comfortScore={currentScenario.results.comfortScore}
            averageTemperature={currentScenario.results.averageTemperature}
          />
        </PanelSection>
      )}

      {/* Visualization Controls */}
      {activeHeatmapId && (
        <VisualizationControls
          visualizationType={visualizationType}
          colorScheme={colorScheme}
          opacity={opacity}
          showVectors={showVectors}
          onVisualizationTypeChange={handleVisualizationTypeChange}
          onColorSchemeChange={handleColorSchemeChange}
          onOpacityChange={handleOpacityChange}
          onShowVectorsChange={setShowVectors}
          renderMode={renderMode}
          slicePosition={slicePosition}
          onRenderModeChange={handleRenderModeChange}
          onSlicePositionChange={handleSlicePositionChange}
          has3DData={has3DData}
        />
      )}

      {/* Scenario Comparison */}
      <ScenarioComparisonPanel />

      {/* Export Report */}
      <div className="border-t border-border/50 px-3 py-3">
        <ExportReportButton projectName="HVAC Analysis" />
      </div>
    </PanelWrapper>
  )
}
