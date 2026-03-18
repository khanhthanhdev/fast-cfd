'use client'

import { useCallback } from 'react'
import { PanelSection } from '../controls/panel-section'
import { ToggleControl } from '../controls/toggle-control'
import { SliderControl } from '../controls/slider-control'

interface VisualizationControlsProps {
  visualizationType: 'temperature' | 'velocity' | 'pmv'
  colorScheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  opacity: number
  showVectors: boolean
  onVisualizationTypeChange: (type: 'temperature' | 'velocity' | 'pmv') => void
  onColorSchemeChange: (scheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm') => void
  onOpacityChange: (opacity: number) => void
  onShowVectorsChange: (show: boolean) => void
  // 3D visualization controls (Phase 1: 3D CFD Support)
  renderMode?: '2d' | '3d-slice' | '3d-volume'
  slicePosition?: number
  onRenderModeChange?: (mode: '2d' | '3d-slice' | '3d-volume') => void
  onSlicePositionChange?: (position: number) => void
  has3DData?: boolean
}

export const VisualizationControls = ({
  visualizationType,
  colorScheme,
  opacity,
  showVectors,
  onVisualizationTypeChange,
  onColorSchemeChange,
  onOpacityChange,
  onShowVectorsChange,
  renderMode = '2d',
  slicePosition = 0.5,
  onRenderModeChange,
  onSlicePositionChange,
  has3DData = false,
}: VisualizationControlsProps) => {
  const handleOpacityChange = useCallback(
    (value: number) => {
      onOpacityChange(Math.round(value * 100) / 100)
    },
    [onOpacityChange],
  )

  return (
    <PanelSection title="Visualization" defaultExpanded={true}>
      {/* Visualization Type Toggle */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">
          Display Mode
        </label>
        <div className="grid grid-cols-3 gap-1">
          {(['temperature', 'velocity', 'pmv'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onVisualizationTypeChange(type)}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                visualizationType === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2C2C2E] text-muted-foreground hover:bg-[#3C3C3E]'
              }`}
              type="button"
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Color Scheme Selector */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">
          Color Map
        </label>
        <div className="grid grid-cols-4 gap-1">
          {(['jet', 'viridis', 'plasma', 'coolwarm'] as const).map((scheme) => (
            <button
              key={scheme}
              onClick={() => onColorSchemeChange(scheme)}
              className={`px-2 py-1.5 rounded text-xs font-medium transition-colors capitalize ${
                colorScheme === scheme
                  ? 'bg-blue-600 text-white'
                  : 'bg-[#2C2C2E] text-muted-foreground hover:bg-[#3C3C3E]'
              }`}
              type="button"
            >
              {scheme}
            </button>
          ))}
        </div>
      </div>

      {/* 3D Render Mode Toggle (Phase 1: 3D CFD Support) */}
      {has3DData && onRenderModeChange && (
        <div className="mb-3">
          <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">
            3D Visualization Mode
          </label>
          <div className="grid grid-cols-3 gap-1">
            {(['2d', '3d-slice', '3d-volume'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => onRenderModeChange(mode)}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  renderMode === mode
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#2C2C2E] text-muted-foreground hover:bg-[#3C3C3E]'
                }`}
                type="button"
              >
                {mode === '2d' ? '2D Slice' : mode === '3d-slice' ? '3D Slice' : '3D Volume'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Slice Position Slider (for 3D-slice mode) */}
      {has3DData && renderMode === '3d-slice' && onSlicePositionChange && (
        <SliderControl
          label="Slice Height Position"
          value={slicePosition}
          onChange={onSlicePositionChange}
          min={0}
          max={1}
          step={0.05}
          precision={2}
        />
      )}

      {/* Opacity Slider */}
      <SliderControl
        label="Opacity"
        value={opacity}
        onChange={handleOpacityChange}
        min={0.1}
        max={1}
        step={0.05}
        precision={2}
      />

      {/* Velocity Vectors Toggle */}
      <ToggleControl
        label="Show Velocity Vectors"
        checked={showVectors}
        onChange={onShowVectorsChange}
      />
    </PanelSection>
  )
}
