# Phase 1: ParticleSystemNode Schema

**Priority:** High
**Status:** Pending
**Effort:** 2-3 hours

## Context

**Related Files:**
- `packages/core/src/schema/nodes/heatmap.ts` - Reference for CFD data schema patterns
- `packages/core/src/schema/nodes/zone.ts` - Reference for node structure
- `packages/core/src/schema/base.ts` - BaseNode, objectId, nodeType utilities
- `packages/core/src/schema/types.ts` - Type definitions
- `packages/core/src/index.ts` - Schema exports

## Overview

Create new `ParticleSystemNode` schema in the core schema package to store particle system configuration and CFD field data.

## Requirements

### Functional
1. Define `ParticleSystemNode` with particle configuration (count, size, lifetime)
2. Define `ParticleEmitter` interface for supply diffusers
3. Define `ParticleAttractor` interface for return/exhaust diffusers
4. Define 3D field schemas: `VelocityField3D`, `TemperatureField3D`, `PressureField3D`
5. Export types for use in editor and viewer packages

### Non-functional
1. Follow existing schema patterns from HeatmapNode
2. Use Zod for validation
3. TypeScript types must be inferable via `z.infer`
4. Keep file under 200 lines (split if needed)

## Schema Design

### ParticleEmitter
```typescript
interface ParticleEmitter {
  id: string
  position: [number, number, number]
  direction: [number, number, number]
  velocity: number          // Emission velocity (m/s)
  temperature: number       // Supply air temperature (K)
  spreadAngle: number       // Cone angle in radians
  emissionRate: number      // Particles per second
}
```

### ParticleAttractor
```typescript
interface ParticleAttractor {
  id: string
  position: [number, number, number]
  strength: number          // Attraction force magnitude
  radius: number            // Capture radius (m)
}
```

### VelocityField3D
```typescript
interface VelocityField3D {
  gridResolution: [number, number, number]  // [nx, ny, nz]
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  data: number[]  // Float32Array serialized as number[], [vx, vy, vz] per cell
}
```

### TemperatureField3D
```typescript
interface TemperatureField3D {
  gridResolution: [number, number, number]
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  data: number[]  // Temperature per cell (K)
}
```

### ParticleSystemNode
```typescript
interface ParticleSystemNode {
  id: string  // objectId('particle-system')
  type: 'particle-system'
  levelId?: string | null
  zoneId?: string | null

  // Particle configuration
  particleCount: number       // 2000-5000
  particleSize: number        // 0.02-0.05
  particleLifetime: number    // Frames before respawn

  // Diffuser configuration
  emitters: ParticleEmitter[]
  attractors: ParticleAttractor[]

  // CFD field data
  velocityField?: VelocityField3D
  temperatureField?: TemperatureField3D
  pressureField?: PressureField3D

  // Visualization settings
  colorByTemperature: boolean
  colorScheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  showTrails: boolean
  trailLength: number

  // Metadata
  enabled: boolean
}
```

## Implementation Steps

1. **Create** `packages/core/src/schema/nodes/particle-system.ts`
   - Import Zod, base utilities
   - Define field schemas (VelocityField3D, TemperatureField3D, PressureField3D)
   - Define emitter/attractor schemas
   - Define ParticleSystemNode schema
   - Export types

2. **Update** `packages/core/src/schema/index.ts`
   - Export new schema and types

3. **Update** `packages/core/src/index.ts`
   - Re-export to make available to other packages

## Code to Create

```typescript
// packages/core/src/schema/nodes/particle-system.ts
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const ParticleEmitterSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  direction: z.tuple([z.number(), z.number(), z.number()]),
  velocity: z.number(),
  temperature: z.number(),
  spreadAngle: z.number(),
  emissionRate: z.number(),
})

export const ParticleAttractorSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number(), z.number()]),
  strength: z.number(),
  radius: z.number(),
})

export const VelocityField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const TemperatureField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const PressureField3DSchema = z.object({
  gridResolution: z.tuple([z.number(), z.number(), z.number()]),
  bounds: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  data: z.array(z.number()),
})

export const ParticleSystemNode = BaseNode.extend({
  id: objectId('particle-system'),
  type: nodeType('particle-system'),

  levelId: z.string().nullable().default(null),
  zoneId: z.string().nullable().default(null),

  particleCount: z.number().default(2000),
  particleSize: z.number().default(0.03),
  particleLifetime: z.number().default(300),

  emitters: z.array(ParticleEmitterSchema).default([]),
  attractors: z.array(ParticleAttractorSchema).default([]),

  velocityField: VelocityField3DSchema.optional(),
  temperatureField: TemperatureField3DSchema.optional(),
  pressureField: PressureField3DSchema.optional(),

  colorByTemperature: z.boolean().default(true),
  colorScheme: z.enum(['jet', 'viridis', 'plasma', 'coolwarm']).default('jet'),
  showTrails: z.boolean().default(false),
  trailLength: z.number().default(10),

  enabled: z.boolean().default(true),
})

export type ParticleSystemNode = z.infer<typeof ParticleSystemNode>
export type ParticleEmitter = z.infer<typeof ParticleEmitterSchema>
export type ParticleAttractor = z.infer<typeof ParticleAttractorSchema>
export type VelocityField3D = z.infer<typeof VelocityField3DSchema>
export type TemperatureField3D = z.infer<typeof TemperatureField3DSchema>
export type PressureField3D = z.infer<typeof PressureField3DSchema>
```

## Todo

- [ ] Create `packages/core/src/schema/nodes/particle-system.ts`
- [ ] Add exports to `packages/core/src/schema/index.ts`
- [ ] Re-export in `packages/core/src/index.ts`
- [ ] Run TypeScript compile to verify no errors

## Success Criteria

- [ ] Schema file created with all types
- [ ] TypeScript compiles without errors
- [ ] Types are importable from `@pascal-app/core`
- [ ] Schema follows Zod validation patterns

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| File exceeds 200 lines | Split field schemas into separate file |
| Type conflicts with existing schemas | Use distinct naming, check imports |
| Build errors | Run `bun run build` after changes |

## Next Steps

Phase 2: Build mock CFD data generator using this schema
