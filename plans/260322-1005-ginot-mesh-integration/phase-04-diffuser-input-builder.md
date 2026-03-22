# Phase 4: Diffuser Input Hardening

**Priority:** High | **Effort:** 2h | **Status:** Completed

---

## Overview

The diffuser detector and builder already exist. This phase tightens validation and makes the
mapping rules explicit.

---

## Current State (COMPLETED)

- `diffuser-detector.ts` already derives direction and default airflow rates
- `diffuser-input-builder.ts` already converts `DiffuserInfo[]` into mesh input
- Validation includes:
  - Unique IDs
  - Finite `center`
  - At least one supply diffuser
  - At least one return/exhaust diffuser
  - At least one supply with usable direction or airflow
- Exhaust diffusers mapped to `return` for backend compatibility

---

## Recommended Files

- UPDATE: `packages/editor/src/lib/hvac/diffuser-input-builder.ts`
- VERIFY: `packages/editor/src/lib/hvac/diffuser-detector.ts`

---

## Tasks (COMPLETED)

- [x] `DiffuserInfo.position` is in scene/world space
- [x] Validates: unique IDs, finite center, supply + return/exhaust requirements
- [x] At least one supply with usable direction or airflow required
- [x] `return` / `exhaust` backend mapping is explicit
- [x] Valid diffusers not silently dropped

---

## Success Criteria (COMPLETED)

- [x] Invalid diffuser sets fail before the API call
- [x] Validation errors are actionable
- [x] Builder output matches the canonical contract

---

## Depends On

Phase 1 contract alignment.
