# Phase 5: Hook Stabilization

**Priority:** High | **Effort:** 3h | **Status:** Completed

---

## Overview

`use-hvac-analysis.ts` already performs mesh export, diffuser lookup, the mesh request, and
heatmap updates. This phase keeps that flow and hardens its lifecycle behavior.

---

## Current State (COMPLETED)

- `use-hvac-analysis.ts` already implements:
  - Per-run `AbortController`
  - `MeshAnalysisRunCoordinator` for stale-result protection
  - Only latest completed request mutates scene state
  - Failures routed through `formatGinotMeshInferenceError`
  - World-space storage for `ginotPointCloud`, `speedField`, `pressureField`
  - `standard` as default quality

---

## Recommended Files

- UPDATE: `packages/editor/src/hooks/use-hvac-analysis.ts`

---

## Tasks (COMPLETED)

- [x] Kept existing mesh flow in place
- [x] Added per-run `AbortController`
- [x] Only latest run updates the heatmap node
- [x] Failures routed through shared error formatter
- [x] `standard` is default quality
- [x] World-space storage shape preserved

---

## Success Criteria (COMPLETED)

- [x] Starting a new run cancels or supersedes the old one safely
- [x] Only the latest run updates the heatmap node
- [x] Hook logic stays orchestration-focused rather than owning parsing details

---

## Depends On

- Phase 2 client hardening
- Phase 4 diffuser hardening
