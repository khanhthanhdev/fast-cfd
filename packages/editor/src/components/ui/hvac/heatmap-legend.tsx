'use client'

import { useMemo } from 'react'
import { colorMaps } from '@pascal-app/viewer'

interface HeatmapLegendProps {
  min: number
  max: number
  unit: string
  colorScheme?: string
  label?: string
  note?: string
}

/**
 * Color legend for heatmap visualization
 * Shows gradient with value labels
 */
export const HeatmapLegend = ({
  min,
  max,
  unit,
  colorScheme = 'jet',
  label,
  note,
}: HeatmapLegendProps) => {
  const gradientStops = useMemo(() => {
    const mapFn = (colorMaps[colorScheme] ?? colorMaps.jet)!
    const stops = []

    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      const value = min + t * (max - min)
      const color = mapFn(value, min, max)
      stops.push({
        value: value.toFixed(1),
        color: `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`,
      })
    }

    return stops
  }, [min, max, colorScheme])

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800 shadow-lg">
      {label && (
        <div className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
          {label}
        </div>
      )}

      <div className="flex h-4 rounded overflow-hidden">
        {gradientStops.map((stop, i) => (
          <div
            key={i}
            className="flex-1"
            style={{
              backgroundColor: stop.color,
            }}
          />
        ))}
      </div>

      <div className="flex justify-between mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>

      {note && (
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {note}
        </p>
      )}
    </div>
  )
}
