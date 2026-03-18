import { create } from 'zustand'
import type { DiffuserInfo } from '../lib/hvac/diffuser-detector'

export interface HVACBoundaryConditions {
  supplyAirTemp: number
  airflowRate: number
  diffuserPosition: [number, number, number]
  diffusers?: DiffuserInfo[]
  occupancy: number
  outdoorTemp: number
}

export interface HVACScenario {
  id: string
  name: string
  timestamp: number
  boundaryConditions: HVACBoundaryConditions
  results?: {
    temperatureGrid: number[][]
    velocityGrid: number[][]
    averageTemperature: number
    pmv: number
    comfortScore: number
  }
  heatmapNodeId?: string
  zoneId?: string
}

interface HVACScenariosState {
  scenarios: HVACScenario[]
  activeScenarioId: string | null
  selectedZoneId: string | null
  createScenario: (
    name: string,
    boundaryConditions: HVACBoundaryConditions,
  ) => void
  updateScenario: (id: string, results: HVACScenario['results']) => void
  setActiveScenario: (id: string | null) => void
  deleteScenario: (id: string) => void
  duplicateScenario: (id: string) => void
  clearScenarios: () => void
  setSelectedZone: (zoneId: string | null) => void
  updateScenarioZone: (scenarioId: string, zoneId: string) => void
}

export const useHVACScenarios = create<HVACScenariosState>((set, get) => ({
  scenarios: [],
  activeScenarioId: null,
  selectedZoneId: null,

  createScenario: (name, boundaryConditions) => {
    const newScenario: HVACScenario = {
      id: crypto.randomUUID(),
      name,
      timestamp: Date.now(),
      boundaryConditions,
    }
    set((state) => ({
      scenarios: [...state.scenarios, newScenario],
      activeScenarioId: newScenario.id,
    }))
  },

  updateScenario: (id, results) => {
    set((state) => ({
      scenarios: state.scenarios.map((s) =>
        s.id === id ? { ...s, results } : s,
      ),
    }))
  },

  setActiveScenario: (id) => set({ activeScenarioId: id }),

  deleteScenario: (id) => {
    set((state) => ({
      scenarios: state.scenarios.filter((s) => s.id !== id),
      activeScenarioId:
        state.activeScenarioId === id ? null : state.activeScenarioId,
    }))
  },

  duplicateScenario: (id) => {
    const scenario = get().scenarios.find((s) => s.id === id)
    if (!scenario) return

    const newScenario: HVACScenario = {
      ...scenario,
      id: crypto.randomUUID(),
      name: `${scenario.name} (Copy)`,
      timestamp: Date.now(),
    }

    set((state) => ({
      scenarios: [...state.scenarios, newScenario],
      activeScenarioId: newScenario.id,
    }))
  },

  clearScenarios: () => set({ scenarios: [], activeScenarioId: null }),

  setSelectedZone: (zoneId) => set({ selectedZoneId: zoneId }),

  updateScenarioZone: (scenarioId, zoneId) => {
    set((state) => ({
      scenarios: state.scenarios.map((s) =>
        s.id === scenarioId ? { ...s, zoneId } : s,
      ),
    }))
  },
}))
