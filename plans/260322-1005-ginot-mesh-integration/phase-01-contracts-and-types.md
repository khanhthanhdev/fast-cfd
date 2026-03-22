# Phase 1: Contract Alignment & Types

**Priority:** High | **Effort:** 1h | **Status:** Completed

---

## Overview

The mesh request/response types already exist, but the repo does not agree on the actual wire
contract yet. This phase resolves the contract first, then tightens typing around that decision.

---

## Current State (VERIFIED 2026-03-22)

- `packages/editor/src/lib/hvac/ai-inference-client.ts` uses `meshFile` (camelCase)
- `apps/editor/app/api/schema.md` documents `meshFile` (line 130)
- `apps/editor/app/api/hvac-inference-mesh/proxy.test.js` verifies `meshFile` (lines 21, 40)
- **Contract is already aligned across all files - no changes needed**

---

## Scope

### In Scope

- choose one canonical request shape
- update TypeScript types to match that shape
- keep the types in the existing HVAC module unless extraction becomes necessary later
- align docs and tests with the chosen contract

### Out of Scope

- creating a parallel `packages/editor/src/lib/ginot/*` module tree
- changing hook behavior
- persistence decisions

---

## Recommended Files

- UPDATE: `packages/editor/src/lib/hvac/ai-inference-client.ts`
- UPDATE: `packages/editor/src/lib/hvac/index.ts`
- UPDATE: `apps/editor/app/api/schema.md`
- UPDATE: `apps/editor/app/api/hvac-inference-mesh/proxy.test.js`

---

## Tasks (COMPLETED)

- [x] Chose canonical wire format: `meshFile` + JSON `options`
- [x] Updated TypeScript types to match that shape (already matched)
- [x] Kept types in existing HVAC module
- [x] Docs and tests already aligned with `meshFile` contract

---

## Success Criteria (COMPLETED)

- [x] Docs, tests, and types all describe the same multipart contract (`meshFile`)
- [x] Mesh request/response types live in one obvious location (`ai-inference-client.ts`)
- [x] No new duplicate mesh-contract module was introduced

---

## Depends On

Nothing. This phase should complete before the client and hook are changed.
