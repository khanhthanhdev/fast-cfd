import { useHVACScenarios } from '../../store/use-hvac-scenarios'
import { PanelSection } from '../ui/controls/panel-section'

export const ScenarioComparisonPanel = () => {
  const {
    scenarios,
    activeScenarioId,
    setActiveScenario,
    duplicateScenario,
    deleteScenario,
  } = useHVACScenarios()

  return (
    <PanelSection title="Scenarios" defaultExpanded={scenarios.length > 0}>
      <div className="space-y-1.5">
        {scenarios.map((scenario) => (
          <div
            key={scenario.id}
            className={`flex items-center justify-between rounded-lg px-2.5 py-2 cursor-pointer transition-colors ${
              activeScenarioId === scenario.id
                ? 'bg-primary/10 ring-1 ring-primary/30'
                : 'bg-[#2C2C2E] hover:bg-[#3e3e3e]'
            }`}
            onClick={() => setActiveScenario(scenario.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs text-foreground truncate">
                {scenario.name}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {scenario.results ? (
                  <span>
                    PMV: {scenario.results.pmv.toFixed(2)} · Comfort:{' '}
                    {(scenario.results.comfortScore * 100).toFixed(0)}%
                  </span>
                ) : (
                  'Not simulated'
                )}
              </div>
            </div>

            <div className="flex gap-1 ml-2">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  duplicateScenario(scenario.id)
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#4e4e4e] hover:text-foreground"
                title="Duplicate"
                type="button"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteScenario(scenario.id)
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-400"
                title="Delete"
                type="button"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {scenarios.length === 0 && (
          <div className="text-center text-muted-foreground py-3 text-xs">
            No scenarios yet. Run a simulation to create one.
          </div>
        )}
      </div>
    </PanelSection>
  )
}
