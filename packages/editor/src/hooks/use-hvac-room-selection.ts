'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useScene, type Space, type AnyNodeId } from '@pascal-app/core'
import { ZoneNode, createZoneFromSpace } from '@pascal-app/core'
import { useHVACScenarios } from '../store/use-hvac-scenarios'
import useEditor from '../store/use-editor'
import type { SpaceOption } from '../components/ui/hvac/room-selector'
import {
  calculatePolygonArea,
  polygonCentroidsMatch,
  polygonsEqual,
} from '../lib/hvac/utils'

interface UseHVACRoomSelectionResult {
  spaces: SpaceOption[]
  selectedSpaceId: string | null
  isCreating: boolean
  handleSelectSpace: (spaceId: string | null) => void
  handleCreateZone: (spaceId: string) => Promise<void>
}

/**
 * Find the zone ID that matches a space polygon by centroid proximity
 */
function findMatchingZoneId(
  spacePolygon: Array<[number, number]>,
  zones: Array<{ polygon: Array<[number, number]>; id: string }>,
): string | undefined {
  return zones.find((zone) => polygonCentroidsMatch(spacePolygon, zone.polygon))?.id
}

/**
 * Hook for managing HVAC room selection
 * - Provides detected spaces for current level
 * - Handles zone creation from space selection
 * - Auto-updates zones when walls change
 */
export function useHVACRoomSelection(): UseHVACRoomSelectionResult {
  const nodes = useScene((state) => state.nodes)
  const updateNode = useScene((state) => state.updateNode)
  const spaces = useEditor((state) => state.spaces)
  const selectedZoneId = useHVACScenarios((state) => state.selectedZoneId)
  const setSelectedZone = useHVACScenarios((state) => state.setSelectedZone)
  const updateScenarioZone = useHVACScenarios((state) => state.updateScenarioZone)
  const activeScenarioId = useHVACScenarios((state) => state.activeScenarioId)

  const [isCreating, setIsCreating] = useState(false)
  const [localSelectedSpaceId, setLocalSelectedSpaceId] = useState<string | null>(null)

  // Convert spaces to SpaceOption format with zone detection
  const spaceOptions = useMemo<SpaceOption[]>(() => {
    const spaceArray = Object.values(spaces) as Space[]

    // Collect all existing zones grouped by level
    const zonesByLevel = new Map<string, Array<{ polygon: Array<[number, number]>; id: string }>>()

    for (const node of Object.values(nodes)) {
      if (node?.type === 'zone') {
        const levelId = node.parentId
        if (!levelId) continue

        if (!zonesByLevel.has(levelId)) {
          zonesByLevel.set(levelId, [])
        }
        zonesByLevel.get(levelId)!.push({
          polygon: (node as { polygon: Array<[number, number]> }).polygon,
          id: node.id,
        })
      }
    }

    return spaceArray.map((space, index) => {
      const levelZones = zonesByLevel.get(space.levelId) || []
      const matchingZoneId = findMatchingZoneId(space.polygon, levelZones)

      return {
        id: space.id,
        name: `Space ${index + 1}`,
        area: calculatePolygonArea(space.polygon),
        isExistingZone: !!matchingZoneId,
        polygon: space.polygon,
        zoneId: matchingZoneId,
      }
    })
  }, [spaces, nodes])

  // Find selected space from selected zone or local selection
  const selectedSpaceId = useMemo(() => {
    if (selectedZoneId) {
      const zoneNode = nodes[selectedZoneId as AnyNodeId]
      if (zoneNode && zoneNode.type === 'zone') {
        const zonePolygon = (zoneNode as { polygon: Array<[number, number]> }).polygon
        const matchingSpace = spaceOptions.find((space) =>
          polygonCentroidsMatch(space.polygon, zonePolygon),
        )
        if (matchingSpace) return matchingSpace.id
      }
    }

    return localSelectedSpaceId
  }, [selectedZoneId, nodes, spaceOptions, localSelectedSpaceId])

  const handleSelectSpace = useCallback((spaceId: string | null) => {
    if (!spaceId) {
      setSelectedZone(null)
      setLocalSelectedSpaceId(null)
      return
    }

    const space = spaces[spaceId] as Space | undefined
    if (!space) return

    const spaceOption = spaceOptions.find((s) => s.id === spaceId)
    if (spaceOption?.zoneId) {
      setSelectedZone(spaceOption.zoneId)
      setLocalSelectedSpaceId(null)
      if (activeScenarioId) {
        updateScenarioZone(activeScenarioId, spaceOption.zoneId)
      }
    } else {
      setSelectedZone(null)
      setLocalSelectedSpaceId(spaceId)
    }
  }, [spaces, spaceOptions, setSelectedZone, activeScenarioId, updateScenarioZone])

  const handleCreateZone = useCallback(async (spaceId: string) => {
    setIsCreating(true)

    try {
      const space = spaces[spaceId] as Space | undefined
      if (!space) throw new Error('Space not found')

      const zoneData = createZoneFromSpace(space, `Space ${spaceId.split('-')[1] || 'Room'}`)

      const zoneNode = ZoneNode.parse({
        ...zoneData,
        parentId: space.levelId,
      })

      useScene.getState().createNode(zoneNode, space.levelId as any)

      updateNode(zoneNode.id, {
        polygon: space.polygon,
      })

      setSelectedZone(zoneNode.id)
      setLocalSelectedSpaceId(null)

      if (activeScenarioId) {
        updateScenarioZone(activeScenarioId, zoneNode.id)
      }

      useScene.getState().dirtyNodes.add(zoneNode.id)
    } catch (error) {
      console.error('Failed to create zone:', error)
      throw error
    } finally {
      setIsCreating(false)
    }
  }, [spaces, updateNode, setSelectedZone, activeScenarioId, updateScenarioZone])

  // Auto-update zone polygon when space changes (wall modifications)
  useEffect(() => {
    for (const space of Object.values(spaces) as Space[]) {
      const spaceOption = spaceOptions.find((s) => s.id === space.id)
      if (!spaceOption?.zoneId) continue

      const zoneNode = nodes[spaceOption.zoneId as AnyNodeId]
      if (!zoneNode || zoneNode.type !== 'zone') continue

      const currentPolygon = (zoneNode as { polygon: Array<[number, number]> }).polygon
      if (!currentPolygon) continue

      if (!polygonsEqual(currentPolygon, space.polygon)) {
        updateNode(spaceOption.zoneId as AnyNodeId, {
          polygon: space.polygon,
        })
      }
    }
  }, [spaces, spaceOptions, nodes, updateNode])

  return {
    spaces: spaceOptions,
    selectedSpaceId,
    isCreating,
    handleSelectSpace,
    handleCreateZone,
  }
}
