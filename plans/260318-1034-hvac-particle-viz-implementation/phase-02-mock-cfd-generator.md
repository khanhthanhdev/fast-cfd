# Phase 2: Mock CFD Data Generator

**Priority:** High
**Status:** Pending
**Effort:** 3-4 hours

## Context

**Related Files:**
- `packages/editor/src/lib/hvac/diffuser-detector.ts` - Diffuser detection utilities
- `packages/editor/src/store/use-hvac-scenarios.ts` - HVAC scenario state
- `packages/core/src/schema/nodes/particle-system.ts` - New schema from Phase 1
- `packages/editor/src/lib/hvac/` - HVAC utilities directory

## Overview

Create mock CFD data generator to simulate velocity and temperature fields for development before real CFD backend is available.

## Requirements

### Functional
1. Generate mock velocity field based on room geometry and diffuser positions
2. Generate mock temperature field with supply/return gradients
3. Create particle emitters from supply diffusers
4. Create particle attractors from return/exhaust diffusers
5. Support both 2D and 3D field generation

### Non-functional
1. Pure functions for easy testing
2. Deterministic output for same inputs
3. Performance: <100ms generation time for typical rooms

## Mock Data Design

### Velocity Field Simulation

Simplified physics model:
- **Supply jet:** Gaussian velocity profile emanating from diffuser
- **Return flow:** Radial inflow toward attractor
- **Decay:** Velocity decreases with distance from source
- **Buoyancy:** Warm air rises, cool air sinks

```typescript
function calculateVelocityAt(
  point: Vector3,
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  bounds: Bounds3D
): Vector3
```

### Temperature Field Simulation

Simplified thermal model:
- **Supply plume:** Cool air spreading from diffuser
- **Heat sources:** Equipment, occupants (optional)
- **Mixing:** Linear interpolation between supply and ambient
- **Stratification:** Temperature gradient with height

```typescript
function calculateTemperatureAt(
  point: Vector3,
  emitters: ParticleEmitter[],
  ambientTemp: number,
  bounds: Bounds3D
): number
```

## Implementation Steps

1. **Create** `packages/editor/src/lib/hvac/mock-cfd-generator.ts`
   - `generateMockVelocityField()` - Create velocity grid from emitters/attractors
   - `generateMockTemperatureField()` - Create temperature grid
   - `generateMockPressureField()` - Optional pressure field
   - `createEmittersFromDiffusers()` - Convert diffuser data to emitters
   - `createAttractorsFromDiffusers()` - Convert diffuser data to attractors
   - `generateParticleSystemData()` - Main entry point, returns complete ParticleSystemNode data

2. **Create** `packages/editor/src/lib/hvac/cfd-types.ts` (if needed)
   - Helper types not in core schema
   - Vector3, Bounds3D utilities

3. **Test** mock generator with sample room data

## Code Structure

```typescript
// packages/editor/src/lib/hvac/mock-cfd-generator.ts

import type {
  ParticleEmitter,
  ParticleAttractor,
  VelocityField3D,
  TemperatureField3D,
} from '@pascal-app/core'
import type { DiffuserInfo } from './diffuser-detector'

interface MockCFDOptions {
  roomBounds: { min: Vector3; max: Vector3 }
  ambientTemperature: number  // Kelvin
  supplyTemperature: number   // Kelvin (typically 293K = 20°C)
  gridResolution: [number, number, number]
}

interface ParticleSystemData {
  emitters: ParticleEmitter[]
  attractors: ParticleAttractor[]
  velocityField: VelocityField3D
  temperatureField: TemperatureField3D
}

/**
 * Generate complete mock CFD data for a room
 */
export function generateMockCFDData(
  supplyDiffusers: DiffuserInfo[],
  returnDiffusers: DiffuserInfo[],
  options: MockCFDOptions
): ParticleSystemData

/**
 * Generate 3D velocity field from emitters and attractors
 */
export function generateMockVelocityField(
  emitters: ParticleEmitter[],
  attractors: ParticleAttractor[],
  options: MockCFDOptions
): VelocityField3D

/**
 * Generate 3D temperature field
 */
export function generateMockTemperatureField(
  emitters: ParticleEmitter[],
  ambientTemp: number,
  options: MockCFDOptions
): TemperatureField3D

/**
 * Create emitters from supply diffuser data
 */
export function createEmittersFromDiffusers(
  diffusers: DiffuserInfo[],
  supplyTemp: number
): ParticleEmitter[]

/**
 * Create attractors from return/exhaust diffuser data
 */
export function createAttractorsFromDiffusers(
  diffusers: DiffuserInfo[]
): ParticleAttractor[]
```

## Mock Physics Formulas

### Supply Jet Velocity
```
v(x) = v₀ * exp(-x² / 2σ²) * direction
where:
  v₀ = emission velocity
  σ = spread parameter
  x = distance from emitter centerline
```

### Return Attractor Velocity
```
v(x) = -strength / |x|² * normalize(x - attractorPos)
where:
  strength = attraction magnitude
  x = point position
```

### Temperature Decay
```
T(x) = T_supply + (T_ambient - T_supply) * (1 - exp(-x / decayLength))
where:
  decayLength = characteristic mixing length
```

## Todo

- [ ] Create helper types in `cfd-types.ts`
- [ ] Implement `createEmittersFromDiffusers()`
- [ ] Implement `createAttractorsFromDiffusers()`
- [ ] Implement `generateMockVelocityField()`
- [ ] Implement `generateMockTemperatureField()`
- [ ] Implement `generateMockCFDData()` main function
- [ ] Test with sample diffuser configurations
- [ ] Run TypeScript compile

## Success Criteria

- [ ] Generator creates valid ParticleSystemNode data
- [ ] Velocity field shows flow from supply to return
- [ ] Temperature field shows cooling from supply diffusers
- [ ] TypeScript compiles without errors
- [ ] Generation completes in <100ms for 20×20×10 grid

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Mock physics too unrealistic | Use simplified but plausible formulas |
| Performance too slow | Start with coarse grid, optimize if needed |
| Doesn't match future CFD | Design for easy data format migration |

## Next Steps

Phase 3: GPU particle renderer to visualize the generated mock data
