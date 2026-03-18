'use client'

import { useEffect, useMemo } from 'react'
import type { AssetInput } from '@pascal-app/core'
import { sfxEmitter } from '../../../lib/sfx-bus'
import useEditor from '../../../store/use-editor'
import { useDraftNode } from '../item/use-draft-node'
import { usePlacementCoordinator } from '../item/use-placement-coordinator'

const DIFFUSER_ASSETS: Record<string, AssetInput> = {
  'diffuser-in': {
    id: 'diffuser-in',
    category: 'structure',
    tags: ['ceiling', 'hvac', 'supply', 'in', 'structure'],
    name: 'Diffuser In',
    thumbnail: '/items/diffuser-in/thumbnail.svg',
    src: '/items/diffuser-in/model.glb',
    dimensions: [0.6, 0.15, 0.6],
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    attachTo: 'ceiling',
  },
  'diffuser-out': {
    id: 'diffuser-out',
    category: 'structure',
    tags: ['ceiling', 'wall', 'hvac', 'return', 'out', 'structure'],
    name: 'Diffuser Out',
    thumbnail: '/items/diffuser-out/thumbnail.svg',
    src: '/items/diffuser-out/model.glb',
    dimensions: [0.6, 0.15, 0.6],
    scale: [1, 1, 1],
    offset: [0, 0, 0],
    rotation: [0, 0, 0],
    attachTo: 'ceiling',
  },
}

/**
 * Diffuser placement tool - allows users to place HVAC diffusers (In/Out)
 * by clicking on surfaces. Auto-detects ceiling and wall surfaces for placement.
 * Uses the placement coordinator system for surface detection.
 */
export const DiffuserTool = () => {
  const selectedItem = useEditor((state) => state.selectedItem)
  const setSelectedItem = useEditor((state) => state.setSelectedItem)
  const draftNode = useDraftNode()

  // Get the current asset based on selected item, default to 'diffuser-in'
  const asset = useMemo(() => {
    const assetId = selectedItem?.id && DIFFUSER_ASSETS[selectedItem.id]
      ? selectedItem.id
      : 'diffuser-in'
    return DIFFUSER_ASSETS[assetId]!
  }, [selectedItem])

  // Ensure we have a diffuser item selected
  useEffect(() => {
    if (!selectedItem || !DIFFUSER_ASSETS[selectedItem.id]) {
      setSelectedItem(DIFFUSER_ASSETS['diffuser-in']!)
    }
  }, [selectedItem, setSelectedItem])

  const cursor = usePlacementCoordinator({
    asset,
    draftNode,
    initDraft: (gridPosition) => {
      // For ceiling/wall attached items, the placement coordinator handles
      // draft creation when entering the surface
      if (!asset.attachTo) {
        draftNode.create(gridPosition, asset)
      }
    },
    onCommitted: () => {
      sfxEmitter.emit('sfx:item-place')
      return true
    },
    onCancel: () => {
      draftNode.destroy()
    },
  })

  return <>{cursor}</>
}
