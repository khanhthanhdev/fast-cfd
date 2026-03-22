export const MESH_ANALYSIS_SUPERSEDED_REASON = 'mesh-analysis-superseded'

type ActiveMeshAnalysisRun = {
  controller: AbortController
  runId: number
}

export class MeshAnalysisRunCoordinator {
  private activeRun: ActiveMeshAnalysisRun | null = null
  private nextRunId = 0

  start(controller: AbortController): number {
    this.activeRun?.controller.abort(MESH_ANALYSIS_SUPERSEDED_REASON)

    const runId = ++this.nextRunId
    this.activeRun = {
      controller,
      runId,
    }

    return runId
  }

  isCurrent(runId: number): boolean {
    return this.activeRun?.runId === runId
  }

  finish(runId: number): boolean {
    if (!this.isCurrent(runId)) {
      return false
    }

    this.activeRun = null
    return true
  }

  abortCurrent(reason = MESH_ANALYSIS_SUPERSEDED_REASON): void {
    if (!this.activeRun) {
      return
    }

    this.activeRun.controller.abort(reason)
    this.activeRun = null
  }
}
