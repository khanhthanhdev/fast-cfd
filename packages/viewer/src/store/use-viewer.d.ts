import type { AnyNode, BaseNode, BuildingNode, LevelNode, ZoneNode } from '@pascal-app/core'
import type { Object3D, Scene } from 'three'
type SelectionPath = {
  buildingId: BuildingNode['id'] | null
  levelId: LevelNode['id'] | null
  zoneId: ZoneNode['id'] | null
  selectedIds: BaseNode['id'][]
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
  setSelection: (updates: Partial<SelectionPath>) => void
  resetSelection: () => void
  outliner: Outliner
  threeScene: Scene | null
  setThreeScene: (scene: Scene | null) => void
  exportScene: ((format?: 'glb' | 'stl') => Promise<void>) | null
  setExportScene: (fn: ((format?: 'glb' | 'stl') => Promise<void>) | null) => void
  cameraDragging: boolean
  setCameraDragging: (dragging: boolean) => void
}
declare const useViewer: import('zustand').UseBoundStore<import('zustand').StoreApi<ViewerState>>
export default useViewer
export { useViewerStore }
declare const useViewerStore: import('zustand').UseBoundStore<import('zustand').StoreApi<ViewerState>>
