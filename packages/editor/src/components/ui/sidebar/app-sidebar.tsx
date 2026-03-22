'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { CommandPalette } from './../../../components/ui/command-palette'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
  useSidebarStore,
} from './../../../components/ui/primitives/sidebar'
import { cn } from './../../../lib/utils'
import { IconRail, type PanelId } from './icon-rail'
import { SettingsPanel, type SettingsPanelProps } from './panels/settings-panel'
import { SitePanel, type SitePanelProps } from './panels/site-panel'
import { HVACPanel } from './panels/hvac-panel'

interface AppSidebarProps {
  appMenuButton?: ReactNode
  sidebarTop?: ReactNode
  settingsPanelProps?: SettingsPanelProps
  sitePanelProps?: SitePanelProps
}

export function AppSidebar({
  appMenuButton,
  sidebarTop,
  settingsPanelProps,
  sitePanelProps,
}: AppSidebarProps) {
  const [activePanel, setActivePanel] = useState<PanelId>('site')
  const { isMobile, open } = useSidebar()

  useEffect(() => {
    // Widen default sidebar (288px → 432px) for better project title visibility
    const store = useSidebarStore.getState()
    if (store.width <= 288) {
      store.setWidth(432)
    }
  }, [])

  const renderPanelContent = () => {
    switch (activePanel) {
      case 'site':
        return <SitePanel {...sitePanelProps} />
      case 'hvac':
        return <HVACPanel />
      case 'settings':
        return <SettingsPanel {...settingsPanelProps} />
      default:
        return null
    }
  }

  return (
    <>
      {isMobile && !open && (
        <div className="fixed top-4 left-4 z-30 md:hidden">
          <SidebarTrigger
            className="size-10 rounded-xl border border-border/50 bg-sidebar/90 shadow-lg backdrop-blur"
          />
        </div>
      )}
      <Sidebar className={cn('dark text-white')} collapsible="icon" variant="floating">
        <div className="flex h-full">
          {/* Icon Rail */}
          <IconRail
            activePanel={activePanel}
            appMenuButton={appMenuButton}
            onPanelChange={setActivePanel}
          />

          {/* Panel Content - hidden when collapsed */}
          {open && (
            <div className="flex flex-1 flex-col overflow-hidden">
              {sidebarTop && (
                <SidebarHeader className="relative flex-col items-start justify-center gap-1 border-border/50 border-b px-3 py-3">
                  {sidebarTop}
                </SidebarHeader>
              )}

              <SidebarContent className={cn('no-scrollbar flex flex-1 flex-col overflow-hidden')}>
                {renderPanelContent()}
              </SidebarContent>
            </div>
          )}
        </div>
      </Sidebar>
      <CommandPalette />
    </>
  )
}
