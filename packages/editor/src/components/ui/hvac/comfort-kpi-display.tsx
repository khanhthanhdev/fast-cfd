'use client'

import { useMemo } from 'react'
import { getPMVLabel } from '../../../lib/hvac/utils'

interface ComfortKPIDisplayProps {
  pmv: number
  comfortScore: number
  averageTemperature: number
}

/**
 * Display comfort KPIs from HVAC analysis
 * PMV interpretation based on ISO 7730
 */
export const ComfortKPIDisplay = ({
  pmv,
  comfortScore,
  averageTemperature,
}: ComfortKPIDisplayProps) => {
  const pmvLabel = getPMVLabel(pmv)

  const pmvColor = useMemo(() => {
    if (pmv < -1.5) return 'text-blue-400'
    if (pmv < -0.5) return 'text-sky-400'
    if (pmv < 0.5) return 'text-green-400'
    if (pmv < 1.5) return 'text-amber-400'
    return 'text-red-400'
  }, [pmv])

  return (
    <div className="grid grid-cols-3 gap-1.5">
      <div className="rounded-lg bg-[#2C2C2E] p-2.5 text-center">
        <div className="text-[10px] font-medium text-muted-foreground mb-1">PMV</div>
        <div className={`text-lg font-bold tabular-nums ${pmvColor}`}>
          {pmv.toFixed(2)}
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {pmvLabel}
        </div>
      </div>

      <div className="rounded-lg bg-[#2C2C2E] p-2.5 text-center">
        <div className="text-[10px] font-medium text-muted-foreground mb-1">Comfort</div>
        <div
          className={`text-lg font-bold tabular-nums ${
            comfortScore > 0.8
              ? 'text-green-400'
              : comfortScore > 0.6
                ? 'text-amber-400'
                : 'text-red-400'
          }`}
        >
          {(comfortScore * 100).toFixed(0)}%
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {comfortScore > 0.8 ? 'Good' : 'Needs work'}
        </div>
      </div>

      <div className="rounded-lg bg-[#2C2C2E] p-2.5 text-center">
        <div className="text-[10px] font-medium text-muted-foreground mb-1">Avg Temp</div>
        <div className="text-lg font-bold tabular-nums text-foreground">
          {averageTemperature.toFixed(1)}°
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">°C</div>
      </div>
    </div>
  )
}
