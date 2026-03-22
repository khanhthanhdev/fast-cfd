# Phase 6: Error Handling & UX

**Priority:** Medium | **Effort:** 1h | **Status:** Completed

---

## Overview

This phase turns raw client and backend failures into user-facing messages with useful recovery
guidance.

---

## Current State (COMPLETED)

- `mesh-inference-errors.ts` already implements:
  - Typed errors: `validation`, `request`, `backend`, `timeout`, `aborted`, `network`
  - `formatGinotMeshInferenceError()` for user-facing messages
  - Distinct messages for 400, 500/502, 504/timeout, network, cancel cases
  - Request ID exposure in error messages
  - Actionable retry guidance

---

## Recommended Files

- CREATE or UPDATE: HVAC-local error formatter near `ai-inference-client.ts`
- UPDATE: `packages/editor/src/hooks/use-hvac-analysis.ts`

---

## Tasks (COMPLETED)

- [x] Validation failures formatted separately from backend failures
- [x] Distinguishes 400, 500/502, timeout/504, network, and cancel cases
- [x] Includes retry guidance
- [x] Request IDs exposed in error messages

---

## Success Criteria (COMPLETED)

- [x] Users see actionable recovery guidance
- [x] Cancelled requests do not show as generic failures
- [x] Error formatting logic is shared

---

## Depends On

Phase 2 client hardening.
