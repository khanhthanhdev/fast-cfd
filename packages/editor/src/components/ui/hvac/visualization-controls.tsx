'use client'

import { useCallback } from 'react'
import { PanelSection } from '../controls/panel-section'
import { ToggleControl } from '../controls/toggle-control'
import { SliderControl } from '../controls/slider-control'

interface VisualizationControlsProps {
  visualizationType: 'speed' | 'pressure'
  colorScheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  opacity: number
  showParticles: boolean
  particleDensity: number
  particleSize: number
  showParticleTrails: boolean
  particleTrailLength: number
  particlePressureEnabled: boolean
  particleBuoyancyEnabled: boolean
  showVectors: boolean
  hasGinotPointCloud?: boolean
  showGinotPointCloud?: boolean
  ginotPointMetric?: 'speed' | 'pressure'
  ginotPointSize?: number
  ginotPointOpacity?: number
  onVisualizationTypeChange: (type: 'speed' | 'pressure') => void
  onColorSchemeChange: (scheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm') => void
  onOpacityChange: (opacity: number) => void
  onShowParticlesChange: (show: boolean) => void
  onParticleDensityChange: (density: number) => void
  onParticleSizeChange: (size: number) => void
  onShowParticleTrailsChange: (show: boolean) => void
  onParticleTrailLengthChange: (length: number) => void
  onParticlePressureChange: (enabled: boolean) => void
  onParticleBuoyancyChange: (enabled: boolean) => void
  onShowVectorsChange: (show: boolean) => void
  onGinotPointCloudVisibilityChange?: (show: boolean) => void
  onGinotPointMetricChange?: (metric: 'speed' | 'pressure') => void
  onGinotPointSizeChange?: (size: number) => void
  onGinotPointOpacityChange?: (opacity: number) => void
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
  showParticles,
  particleDensity,
  particleSize,
  showParticleTrails,
  particleTrailLength,
  particlePressureEnabled,
  particleBuoyancyEnabled,
  showVectors,
  hasGinotPointCloud = false,
  showGinotPointCloud = true,
  ginotPointMetric = 'speed',
  ginotPointSize = 0.075,
  ginotPointOpacity = 0.8,
  onVisualizationTypeChange,
  onColorSchemeChange,
  onOpacityChange,
  onShowParticlesChange,
  onParticleDensityChange,
  onParticleSizeChange,
  onShowParticleTrailsChange,
  onParticleTrailLengthChange,
  onParticlePressureChange,
  onParticleBuoyancyChange,
  onShowVectorsChange,
  onGinotPointCloudVisibilityChange,
  onGinotPointMetricChange,
  onGinotPointSizeChange,
  onGinotPointOpacityChange,
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

  const handleGinotOpacityChange = useCallback(
    (value: number) => {
      onGinotPointOpacityChange?.(Math.round(value * 100) / 100)
    },
    [onGinotPointOpacityChange],
  )

  const handleGinotSizeChange = useCallback(
    (value: number) => {
      onGinotPointSizeChange?.(Math.round(value * 1000) / 1000)
    },
    [onGinotPointSizeChange],
  )

  const handleParticleDensityChange = useCallback(
    (value: number) => {
      onParticleDensityChange(Math.round(value * 100) / 100)
    },
    [onParticleDensityChange],
  )

  const handleParticleSizeChange = useCallback(
    (value: number) => {
      onParticleSizeChange(Math.round(value * 1000) / 1000)
    },
    [onParticleSizeChange],
  )

  const handleParticleTrailLengthChange = useCallback(
    (value: number) => {
      onParticleTrailLengthChange(Math.round(value))
    },
    [onParticleTrailLengthChange],
  )

  return (
    <PanelSection title="Visualization" defaultExpanded={true}>
      {/* Visualization Type Toggle */}
      <div className="mb-3">
        <label className="text-[10px] font-medium text-muted-foreground mb-1.5 block">
          Airflow Metric
        </label>
        <div className="grid grid-cols-2 gap-1">
          {(['speed', 'pressure'] as const).map((type) => (
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

      <div className="mt-3 border-t border-border/50 pt-3">
        <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground">
          Particle Flow Overlay
        </label>

        <ToggleControl
          label="Show Heat Particles"
          checked={showParticles}
          onChange={onShowParticlesChange}
        />

        <SliderControl
          label="Particle Density"
          value={particleDensity}
          onChange={handleParticleDensityChange}
          min={0.35}
          max={1.6}
          step={0.05}
          precision={2}
        />

        <SliderControl
          label="Particle Size"
          value={particleSize}
          onChange={handleParticleSizeChange}
          min={0.015}
          max={0.08}
          step={0.0025}
          precision={3}
        />

        <ToggleControl
          label="Show Trails"
          checked={showParticleTrails}
          onChange={onShowParticleTrailsChange}
        />

        {showParticleTrails && (
          <SliderControl
            label="Trail Length"
            value={particleTrailLength}
            onChange={handleParticleTrailLengthChange}
            min={4}
            max={30}
            step={1}
            precision={0}
          />
        )}

        <ToggleControl
          label="Pressure Force"
          checked={particlePressureEnabled}
          onChange={onParticlePressureChange}
        />

        <ToggleControl
          label="Buoyancy Force"
          checked={particleBuoyancyEnabled}
          onChange={onParticleBuoyancyChange}
        />
      </div>

      <ToggleControl
        label="Show Velocity Vectors (Debug)"
        checked={showVectors}
        onChange={onShowVectorsChange}
      />

      {hasGinotPointCloud && (
        <div className="mt-3 border-t border-border/50 pt-3">
          <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground">
            GINOT Overlay
          </label>

          <ToggleControl
            label="Show Point Cloud"
            checked={showGinotPointCloud}
            onChange={(checked) => onGinotPointCloudVisibilityChange?.(checked)}
          />

          <div className="mb-3">
            <label className="mb-1.5 block text-[10px] font-medium text-muted-foreground">
              Point Metric
            </label>
            <div className="grid grid-cols-2 gap-1">
              {(['speed', 'pressure'] as const).map((metric) => (
                <button
                  key={metric}
                  onClick={() => onGinotPointMetricChange?.(metric)}
                  className={`rounded px-2 py-1.5 text-xs font-medium transition-colors capitalize ${
                    ginotPointMetric === metric
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#2C2C2E] text-muted-foreground hover:bg-[#3C3C3E]'
                  }`}
                  type="button"
                >
                  {metric}
                </button>
              ))}
            </div>
          </div>

          <SliderControl
            label="Point Size"
            value={ginotPointSize}
            onChange={handleGinotSizeChange}
            min={0.02}
            max={0.2}
            step={0.005}
            precision={3}
          />

          <SliderControl
            label="Point Opacity"
            value={ginotPointOpacity}
            onChange={handleGinotOpacityChange}
            min={0.1}
            max={1}
            step={0.05}
            precision={2}
          />
        </div>
      )}
    </PanelSection>
  )
}
