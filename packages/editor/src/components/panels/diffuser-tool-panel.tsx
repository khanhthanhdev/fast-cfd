'use client'

import { useCallback } from 'react'
import useEditor from '../../store/use-editor'
import { PanelWrapper } from '../ui/panels/panel-wrapper'
import { PanelSection } from '../ui/controls/panel-section'

/**
 * Diffuser Tool Side Panel - Allows selecting between Diffuser In and Diffuser Out
 */
export const DiffuserToolPanel = () => {
  const tool = useEditor((s) => s.tool)
  const selectedItem = useEditor((s) => s.selectedItem)
  const setSelectedItem = useEditor((s) => s.setSelectedItem)

  const handleSelectType = useCallback(
    (type: 'in' | 'out') => {
      setSelectedItem({
        id: type === 'in' ? 'diffuser-in' : 'diffuser-out',
        category: 'structure',
        tags: type === 'in'
          ? ['ceiling', 'hvac', 'supply', 'in', 'structure']
          : ['ceiling', 'wall', 'hvac', 'return', 'out', 'structure'],
        name: type === 'in' ? 'Diffuser In' : 'Diffuser Out',
        thumbnail: type === 'in' ? '/items/diffuser-in/thumbnail.svg' : '/items/diffuser-out/thumbnail.svg',
        src: type === 'in' ? '/items/diffuser-in/model.glb' : '/items/diffuser-out/model.glb',
        dimensions: [0.6, 0.15, 0.6],
        scale: [1, 1, 1],
        offset: [0, 0, 0],
        rotation: [0, 0, 0],
        attachTo: 'ceiling',
      })
    },
    [setSelectedItem],
  )

  if (tool !== 'diffuser') {
    return null
  }

  return (
    <PanelWrapper title="Diffuser" width={280}>
      <PanelSection title="Diffuser Type" defaultExpanded>
        <div className="grid grid-cols-2 gap-2 px-3 py-2">
          <button
            onClick={() => handleSelectType('in')}
            className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
              selectedItem?.id === 'diffuser-in'
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-border/50 bg-[#2C2C2E] hover:bg-[#3C3C3E]'
            }`}
            type="button"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="24" height="24" fill="#3b82f6" rx="3"/>
                <path d="M 16 10 L 16 22" stroke="#134d8b" strokeWidth="2"/>
                <path d="M 10 16 L 22 16" stroke="#134d8b" strokeWidth="2"/>
                <path d="M 13 13 L 16 16 L 19 19" stroke="#134d8b" strokeWidth="1.5"/>
                <path d="M 19 13 L 16 16 L 13 19" stroke="#134d8b" strokeWidth="1.5"/>
              </svg>
            </div>
            <span className="text-xs font-medium text-foreground">In</span>
            <span className="text-[10px] text-muted-foreground">Supply Air</span>
          </button>

          <button
            onClick={() => handleSelectType('out')}
            className={`flex flex-col items-center gap-2 rounded-lg border p-3 transition-colors ${
              selectedItem?.id === 'diffuser-out'
                ? 'border-orange-500 bg-orange-500/10'
                : 'border-border/50 bg-[#2C2C2E] hover:bg-[#3C3C3E]'
            }`}
            type="button"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="24" height="24" fill="#f97316" rx="3"/>
                <path d="M 16 10 L 16 22" stroke="#fdba74" strokeWidth="2"/>
                <path d="M 10 16 L 22 16" stroke="#fdba74" strokeWidth="2"/>
                <path d="M 12 12 L 16 16 L 20 20" stroke="#fdba74" strokeWidth="1.5"/>
                <path d="M 20 12 L 16 16 L 12 20" stroke="#fdba74" strokeWidth="1.5"/>
              </svg>
            </div>
            <span className="text-xs font-medium text-foreground">Out</span>
            <span className="text-[10px] text-muted-foreground">Return Air</span>
          </button>
        </div>
      </PanelSection>

      <PanelSection title="Info">
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Hover over ceiling or wall surfaces to place diffusers. The tool auto-detects surfaces for proper placement.
          </p>
        </div>
      </PanelSection>
    </PanelWrapper>
  )
}
