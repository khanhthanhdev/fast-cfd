'use client'

import { useCallback } from 'react'
import type { HVACBoundaryConditions } from '../../store/use-hvac-scenarios'
import { PanelSection } from '../ui/controls/panel-section'
import { SliderControl } from '../ui/controls/slider-control'
import { RoomSelector, type SpaceOption } from '../ui/hvac/room-selector'

interface HVACConfigPanelProps {
  conditions: HVACBoundaryConditions
  onChange: (conditions: HVACBoundaryConditions) => void
  onRunSimulation: () => void
  isLoading: boolean
  spaces: SpaceOption[]
  selectedSpaceId: string | null
  onSelectSpace: (spaceId: string | null) => void
  onCreateZone: (spaceId: string) => void
  isCreatingZone: boolean
}

const formatPosition = (pos: [number, number, number]) => {
  return `[${pos[0].toFixed(2)}, ${pos[1].toFixed(2)}, ${pos[2].toFixed(2)}]`
}

export const HVACConfigPanel = ({
  conditions,
  onChange,
  onRunSimulation,
  isLoading,
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onCreateZone,
  isCreatingZone,
}: HVACConfigPanelProps) => {
  const updateField = useCallback(
    <K extends keyof HVACBoundaryConditions>(
      field: K,
      value: HVACBoundaryConditions[K],
    ) => {
      onChange({ ...conditions, [field]: value })
    },
    [conditions, onChange],
  )

  return (
    <>
      {/* Room Selection */}
      <PanelSection title="Room Selection" defaultExpanded={true}>
        <RoomSelector
          spaces={spaces}
          selectedSpaceId={selectedSpaceId}
          onSelectSpace={onSelectSpace}
          onCreateZone={onCreateZone}
          isCreating={isCreatingZone}
        />
      </PanelSection>

      <PanelSection title="Boundary Conditions">
        <SliderControl
          label="Supply Temp"
          value={conditions.supplyAirTemp}
          onChange={(v) => updateField('supplyAirTemp', v)}
          min={10}
          max={35}
          step={0.5}
          precision={1}
          unit="°C"
        />
        <SliderControl
          label="Airflow"
          value={conditions.airflowRate}
          onChange={(v) => updateField('airflowRate', v)}
          min={50}
          max={500}
          step={10}
          precision={0}
          unit="m³/h"
        />
        <SliderControl
          label="Occupancy"
          value={conditions.occupancy}
          onChange={(v) => updateField('occupancy', Math.round(v))}
          min={0}
          max={50}
          step={1}
          precision={0}
        />
        <SliderControl
          label="Outdoor"
          value={conditions.outdoorTemp}
          onChange={(v) => updateField('outdoorTemp', v)}
          min={-10}
          max={50}
          step={0.5}
          precision={1}
          unit="°C"
        />
      </PanelSection>

      <PanelSection title="Diffuser Position">
        <div className="grid grid-cols-3 gap-1.5">
          {(['X', 'Y', 'Z'] as const).map((axis, i) => (
            <div key={axis} className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-muted-foreground text-center">{axis}</span>
              <input
                type="number"
                value={conditions.diffuserPosition[i]}
                onChange={(e) => {
                  const pos = [...conditions.diffuserPosition] as [number, number, number]
                  pos[i] = parseFloat(e.target.value) || 0
                  updateField('diffuserPosition', pos)
                }}
                step={0.1}
                className="w-full rounded-md border border-border/50 bg-[#2C2C2E] px-2 py-1.5 text-center font-mono text-xs text-foreground outline-none focus:border-primary/50"
              />
            </div>
          ))}
        </div>

        {/* Detected diffusers list */}
        {conditions.diffusers && conditions.diffusers.length > 0 && (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground">
                Detected Diffusers ({conditions.diffusers.length})
              </span>
              <span className="text-[10px] text-blue-400">
                Using aggregated position
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {conditions.diffusers.map((diffuser) => (
                <div
                  key={diffuser.id}
                  className="flex items-center justify-between rounded bg-[#2C2C2E] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        diffuser.type === 'supply'
                          ? 'bg-blue-500'
                          : diffuser.type === 'return'
                            ? 'bg-orange-500'
                            : 'bg-gray-500'
                      }`}
                    />
                    <span className="text-xs text-foreground">{diffuser.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {formatPosition(diffuser.position)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Warning if no diffusers detected */}
        {(!conditions.diffusers || conditions.diffusers.length === 0) && (
          <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 p-2">
            <p className="text-[10px] text-yellow-400">
              No diffusers detected. Place HVAC diffusers from the catalog or manually set position.
            </p>
          </div>
        )}
      </PanelSection>

      <div className="px-3 py-2">
        <button
          onClick={onRunSimulation}
          disabled={isLoading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed"
          type="button"
        >
          {isLoading ? (
            <>
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Running Simulation…
            </>
          ) : (
            'Run AI Simulation'
          )}
        </button>
      </div>
    </>
  )
}
