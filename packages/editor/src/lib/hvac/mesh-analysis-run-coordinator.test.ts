import { describe, expect, it } from 'bun:test'
import {
  MESH_ANALYSIS_SUPERSEDED_REASON,
  MeshAnalysisRunCoordinator,
} from './mesh-analysis-run-coordinator'

describe('MeshAnalysisRunCoordinator', () => {
  it('aborts the previous run when a newer run starts', () => {
    const coordinator = new MeshAnalysisRunCoordinator()
    const firstController = new AbortController()
    const secondController = new AbortController()

    const firstRunId = coordinator.start(firstController)
    const secondRunId = coordinator.start(secondController)

    expect(firstController.signal.aborted).toBe(true)
    expect(firstController.signal.reason).toBe(MESH_ANALYSIS_SUPERSEDED_REASON)
    expect(coordinator.isCurrent(firstRunId)).toBe(false)
    expect(coordinator.isCurrent(secondRunId)).toBe(true)
  })

  it('only finishes the active run', () => {
    const coordinator = new MeshAnalysisRunCoordinator()
    const firstRunId = coordinator.start(new AbortController())
    const secondRunId = coordinator.start(new AbortController())

    expect(coordinator.finish(firstRunId)).toBe(false)
    expect(coordinator.finish(secondRunId)).toBe(true)
    expect(coordinator.isCurrent(secondRunId)).toBe(false)
  })
})
