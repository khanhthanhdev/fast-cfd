'use client'

import type { AnyNode, BaseNode, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import type { Object3D, Scene } from 'three'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type SelectionPath = {
  buildingId: BuildingNode['id'] | null
  levelId: LevelNode['id'] | null
  zoneId: ZoneNode['id'] | null
  selectedIds: BaseNode['id'][] // For items/assets (multi-select)
}

type Outliner = {
  selectedObjects: Object3D[]
  hoveredObjects: Object3D[]
}

type ViewerState = {
  selection: SelectionPath
  hoveredId: AnyNode['id'] | ZoneNode['id'] | null
  setHoveredId: (id: AnyNode['id'] | ZoneNode['id'] | null) => void

  cameraMode: 'perspective' | 'orthographic'
  setCameraMode: (mode: 'perspective' | 'orthographic') => void

  theme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark') => void

  levelMode: 'stacked' | 'exploded' | 'solo' | 'manual'
  setLevelMode: (mode: 'stacked' | 'exploded' | 'solo' | 'manual') => void

  wallMode: 'up' | 'cutaway' | 'down'
  setWallMode: (mode: 'up' | 'cutaway' | 'down') => void

  showScans: boolean
  setShowScans: (show: boolean) => void

  showGuides: boolean
  setShowGuides: (show: boolean) => void

  showGrid: boolean
  setShowGrid: (show: boolean) => void

  // HVAC visualization
  showHeatmap: boolean
  setShowHeatmap: (show: boolean) => void
  showHeatmapVectors: boolean
  setShowHeatmapVectors: (show: boolean) => void
  showGinotPointCloud: boolean
  setShowGinotPointCloud: (show: boolean) => void
  ginotPointMetric: 'speed' | 'pressure'
  setGinotPointMetric: (metric: 'speed' | 'pressure') => void
  ginotPointSize: number
  setGinotPointSize: (size: number) => void
  ginotPointOpacity: number
  setGinotPointOpacity: (opacity: number) => void
  showHeatParticles: boolean
  setShowHeatParticles: (show: boolean) => void
  particleDensity: number
  setParticleDensity: (density: number) => void
  particleSize: number
  setParticleSize: (size: number) => void
  showParticleTrails: boolean
  setShowParticleTrails: (show: boolean) => void
  particleTrailLength: number
  setParticleTrailLength: (length: number) => void
  particlePressureEnabled: boolean
  setParticlePressureEnabled: (enabled: boolean) => void
  particleBuoyancyEnabled: boolean
  setParticleBuoyancyEnabled: (enabled: boolean) => void

  // 3D Heatmap visualization (Phase 1: 3D CFD Support)
  heatmapRenderMode: '2d' | '3d-slice' | '3d-volume'
  setHeatmapRenderMode: (mode: '2d' | '3d-slice' | '3d-volume') => void
  heatmapSlicePosition: number
  setHeatmapSlicePosition: (position: number) => void

  projectId: string | null
  setProjectId: (id: string | null) => void
  projectPreferences: Record<
    string,
    { showScans?: boolean; showGuides?: boolean; showGrid?: boolean }
  >

  // Smart selection update
  setSelection: (updates: Partial<SelectionPath>) => void
  resetSelection: () => void

  outliner: Outliner // No setter as we will manipulate directly the arrays

  // Three.js scene reference (set from inside Canvas)
  threeScene: Scene | null
  setThreeScene: (scene: Scene | null) => void

  // Export functionality
  exportScene: ((format?: 'glb' | 'stl') => Promise<void>) | null
  setExportScene: (fn: ((format?: 'glb' | 'stl') => Promise<void>) | null) => void

  cameraDragging: boolean
  setCameraDragging: (dragging: boolean) => void
}

const useViewerStore = create<ViewerState>()(
  persist(
    (set) => ({
      selection: { buildingId: null, levelId: null, zoneId: null, selectedIds: [] },
      hoveredId: null,
      setHoveredId: (id) => set({ hoveredId: id }),

      cameraMode: 'perspective',
      setCameraMode: (mode) => set({ cameraMode: mode }),

      theme: 'light',
      setTheme: (theme) => set({ theme }),

      levelMode: 'stacked',
      setLevelMode: (mode) => set({ levelMode: mode }),

      wallMode: 'up',
      setWallMode: (mode) => set({ wallMode: mode }),

      showScans: true,
      setShowScans: (show) =>
        set((state) => {
          const projectPreferences = { ...(state.projectPreferences || {}) }
          if (state.projectId) {
            projectPreferences[state.projectId] = {
              ...(projectPreferences[state.projectId] || {}),
              showScans: show,
            }
          }
          return { showScans: show, projectPreferences }
        }),

      showGuides: true,
      setShowGuides: (show) =>
        set((state) => {
          const projectPreferences = { ...(state.projectPreferences || {}) }
          if (state.projectId) {
            projectPreferences[state.projectId] = {
              ...(projectPreferences[state.projectId] || {}),
              showGuides: show,
            }
          }
          return { showGuides: show, projectPreferences }
        }),

      showGrid: true,
      setShowGrid: (show) =>
        set((state) => {
          const projectPreferences = { ...(state.projectPreferences || {}) }
          if (state.projectId) {
            projectPreferences[state.projectId] = {
              ...(projectPreferences[state.projectId] || {}),
              showGrid: show,
            }
          }
          return { showGrid: show, projectPreferences }
        }),

      showHeatmap: true,
      setShowHeatmap: (show) => set({ showHeatmap: show }),
      showHeatmapVectors: false,
      setShowHeatmapVectors: (show) => set({ showHeatmapVectors: show }),
      showGinotPointCloud: true,
      setShowGinotPointCloud: (show) => set({ showGinotPointCloud: show }),
      ginotPointMetric: 'speed',
      setGinotPointMetric: (metric) => set({ ginotPointMetric: metric }),
      ginotPointSize: 0.075,
      setGinotPointSize: (size) => set({ ginotPointSize: size }),
      ginotPointOpacity: 0.8,
      setGinotPointOpacity: (opacity) => set({ ginotPointOpacity: opacity }),
      showHeatParticles: true,
      setShowHeatParticles: (show) => set({ showHeatParticles: show }),
      particleDensity: 1,
      setParticleDensity: (density) => set({ particleDensity: density }),
      particleSize: 0.034,
      setParticleSize: (size) => set({ particleSize: size }),
      showParticleTrails: false,
      setShowParticleTrails: (show) => set({ showParticleTrails: show }),
      particleTrailLength: 14,
      setParticleTrailLength: (length) => set({ particleTrailLength: length }),
      particlePressureEnabled: false,
      setParticlePressureEnabled: (enabled) => set({ particlePressureEnabled: enabled }),
      particleBuoyancyEnabled: false,
      setParticleBuoyancyEnabled: (enabled) => set({ particleBuoyancyEnabled: enabled }),

      heatmapRenderMode: '2d',
      setHeatmapRenderMode: (mode) => set({ heatmapRenderMode: mode }),
      heatmapSlicePosition: 0.5,
      setHeatmapSlicePosition: (position) => set({ heatmapSlicePosition: position }),

      projectId: null,
      setProjectId: (id) =>
        set((state) => {
          if (!id) return { projectId: id }
          const prefs = state.projectPreferences?.[id] || {}
          return {
            projectId: id,
            showScans: prefs.showScans ?? true,
            showGuides: prefs.showGuides ?? true,
            showGrid: prefs.showGrid ?? true,
          }
        }),
      projectPreferences: {},

      setSelection: (updates) =>
        set((state) => {
          const newSelection = { ...state.selection, ...updates }

          // Hierarchy Guard: If we change a high-level parent, reset the children unless explicitly provided
          if (updates.buildingId !== undefined) {
            if (updates.levelId === undefined) newSelection.levelId = null
            if (updates.zoneId === undefined) newSelection.zoneId = null
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }
          if (updates.levelId !== undefined) {
            if (updates.zoneId === undefined) newSelection.zoneId = null
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }
          if (updates.zoneId !== undefined) {
            if (updates.selectedIds === undefined) newSelection.selectedIds = []
          }

          return { selection: newSelection }
        }),

      resetSelection: () =>
        set({
          selection: {
            buildingId: null,
            levelId: null,
            zoneId: null,
            selectedIds: [],
          },
        }),

      outliner: { selectedObjects: [], hoveredObjects: [] },

      threeScene: null,
      setThreeScene: (scene) => set({ threeScene: scene }),

      exportScene: null,
      setExportScene: (fn) => set({ exportScene: fn }),

      cameraDragging: false,
      setCameraDragging: (dragging) => set({ cameraDragging: dragging }),
    }),
    {
      name: 'viewer-preferences',
      partialize: (state) => ({
        cameraMode: state.cameraMode,
        theme: state.theme,
        levelMode: state.levelMode,
        wallMode: state.wallMode,
        projectPreferences: state.projectPreferences,
      }),
    },
  ),
)

export default useViewerStore
export { useViewerStore }
