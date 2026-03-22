# Phase 3: STL Export Verification

**Priority:** Medium | **Effort:** 1h | **Status:** Completed

---

## Overview

The STL exporter already exists and returns an in-memory `Blob`. This phase verifies scope and
exclusion behavior instead of planning a rewrite.

---

## Current State (VERIFIED)

- `scene-stl-export.ts` already filters:
  - Excluded node types: zone, guide, scan, heatmap, particle-system
  - Excluded mesh names: collision-mesh, ceiling-grid, cutout
  - Glass meshes (by material name or transparency)
  - Hitbox/invisible meshes
  - Degenerate geometries
- Zone-scoped export supported
- Returns binary STL `Blob` for multipart upload

---

## Recommended Files

- VERIFY: `packages/editor/src/lib/hvac/scene-stl-export.ts`
- VERIFY: `packages/editor/src/lib/hvac/scene-stl-export-utils.ts`
- ADD/UPDATE TESTS: export-related test coverage if missing

---

## Tasks (COMPLETED)

- [x] Verified exported geometry matches selected level/zone scope
- [x] Confirmed glass, invisible, hitbox, helper meshes stay excluded
- [x] Confirmed payload is binary STL `Blob` suitable for multipart upload
- [x] No exporter rewrite needed

---

## Success Criteria (COMPLETED)

- [x] Export scope is documented and verified
- [x] No unnecessary exporter rewrite was introduced
- [x] Exclusion rules are implemented (glass, hitbox, helpers, degenerate)

---

## Depends On

Independent. Can run in parallel with Phase 2 after Phase 1 settles the contract.
