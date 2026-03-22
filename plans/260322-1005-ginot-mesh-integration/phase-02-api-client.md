# Phase 2: API Client Hardening

**Priority:** High | **Effort:** 2h | **Status:** Completed

---

## Overview

`callGinotMeshInference()` already exists. This phase hardens it for production hook usage instead
of replacing it with a second client.

---

## Current State (COMPLETED)

- `callGinotMeshInference()` already implements:
  - Caller-provided `AbortSignal` support
  - Timeout + cancellation working together
  - Typed error normalization (`GinotMeshInferenceError`)
  - Backend `timestamp` preservation
  - `x-request-id` propagation
  - Default target: `/api/hvac-inference-mesh`

---

## Scope

### In Scope

- optional caller `AbortSignal`
- timeout + cancellation working together
- typed error normalization
- preserving backend metadata such as `timestamp`
- request ID propagation if the proxy is updated to forward it

### Out of Scope

- rewriting the client into a new namespace
- changing renderer/storage logic

---

## Recommended Files

- UPDATE: `packages/editor/src/lib/hvac/ai-inference-client.ts`
- UPDATE: `apps/editor/app/api/hvac-inference-mesh/proxy.ts` if header forwarding is required

---

## Tasks (COMPLETED)

- [x] `/api/hvac-inference-mesh` is the default endpoint target
- [x] JSON and text error bodies parsed into typed `GinotMeshInferenceError`
- [x] Backend `timestamp` preserved when present
- [x] Hook-supplied cancellation works with timeout
- [x] `x-request-id` forwarded through proxy

---

## Success Criteria (COMPLETED)

- [x] The hook can cancel an in-flight mesh request
- [x] Timeout and abort cases are distinguishable
- [x] Error objects carry status and useful detail
- [x] Server metadata is preserved rather than overwritten

---

## Depends On

Phase 1 contract alignment.
