'use client'

import { ChevronRight, Circle, Check } from 'lucide-react'
import { useMemo } from 'react'
import { calculatePolygonArea } from '../../../lib/hvac/utils'
import { cn } from '../../../lib/utils'

export interface SpaceOption {
  id: string
  name: string
  area: number
  isExistingZone: boolean
  polygon: Array<[number, number]>
  zoneId?: string
}

interface RoomSelectorProps {
  spaces: SpaceOption[]
  selectedSpaceId: string | null
  onSelectSpace: (spaceId: string | null) => void
  onCreateZone: (spaceId: string) => void
  isCreating?: boolean
}

export function RoomSelector({
  spaces,
  selectedSpaceId,
  onSelectSpace,
  onCreateZone,
  isCreating = false,
}: RoomSelectorProps) {
  const spaceOptions = useMemo(() => {
    return spaces.map((space) => ({
      ...space,
      area: calculatePolygonArea(space.polygon),
    }))
  }, [spaces])

  if (spaceOptions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <Circle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No enclosed spaces detected
        </p>
        <p className="text-xs text-muted-foreground/70">
          Draw walls to form a closed room
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 p-1.5">
      <div className="px-1.5 pb-2">
        <p className="text-xs font-medium text-muted-foreground">
          Select a room for HVAC simulation
        </p>
      </div>

      {spaceOptions.map((space) => (
        <button
          key={space.id}
          onClick={() => onSelectSpace(space.id === selectedSpaceId ? null : space.id)}
          className={cn(
            'group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
            selectedSpaceId === space.id
              ? 'bg-primary/10 hover:bg-primary/15'
              : 'hover:bg-accent/50',
          )}
          type="button"
        >
          {/* Icon */}
          <div
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-md',
              selectedSpaceId === space.id
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground group-hover:text-foreground',
            )}
          >
            {space.isExistingZone ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Circle className="h-3.5 w-3.5" />
            )}
          </div>

          {/* Info */}
          <div className="flex flex-1 flex-col">
            <span
              className={cn(
                'font-medium text-sm',
                selectedSpaceId === space.id
                  ? 'text-primary'
                  : 'text-foreground',
              )}
            >
              {space.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {space.area.toFixed(1)} m²
              {space.isExistingZone && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-primary">
                  <Check className="h-2.5 w-2.5" />
                  Zone created
                </span>
              )}
            </span>
          </div>

          {/* Chevron */}
          <ChevronRight
            className={cn(
              'h-4 w-4 transition-transform',
              selectedSpaceId === space.id ? 'rotate-90 text-primary' : 'text-muted-foreground',
            )}
          />
        </button>
      ))}

      {/* Create Zone Button */}
      {selectedSpaceId && (
        <div className="mt-2 flex gap-2 px-1.5 pt-2 border-t border-border/50">
          <button
            onClick={() => onCreateZone(selectedSpaceId)}
            disabled={isCreating}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 font-medium text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
          >
            {isCreating ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </>
            ) : (
              'Create Zone from Space'
            )}
          </button>
        </div>
      )}
    </div>
  )
}
