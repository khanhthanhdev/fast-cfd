# HVAC Particle Visualization System - Brainstorm Report

## Problem Statement

Create a hybrid particle visualization system for HVAC diffuser flow analysis that combines:
- Static grid-based heatmap (temperature/velocity distribution)
- Dynamic moving particles showing airflow patterns
- Color-coded by temperature
- Supply/return diffuser interaction with full pressure field effects

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Visualization Style | Hybrid (heatmap + particles) |
| Physics Source | Server-computed CFD (mock data for now) |
| Particle Density | High (2-5k, GPU-rendered) |
| Diffuser Interaction | Full (supply emits, return absorbs, pressure fields) |
| Performance Target | 60fps interactive |

## Evaluated Approaches

### Option 1: Pure Particle System (Like datacenter-planner)
**Description:** Lagrangian particles with physics simulation

**Pros:**
- Clear flow visualization
- Intuitive understanding of airflow paths
- Visually engaging

**Cons:**
- Doesn't show full room temperature distribution
- Hard to read exact temperature values
- Physics simulation can be expensive

### Option 2: Grid Heatmap Only (Current Implementation)
**Description:** Eulerian grid-based temperature/velocity visualization

**Pros:**
- Accurate CFD data representation
- Easy to read temperature values
- Efficient rendering

**Cons:**
- Static, no sense of flow direction
- Less intuitive for non-technical users
- Doesn't show particle trajectories

### Option 3: Hybrid Approach (Recommended)
**Description:** Grid heatmap background + GPU particle overlay

**Pros:**
- Best of both worlds: distribution + flow
- Particles can use pre-computed velocity field
- Heatmap provides context, particles show dynamics
- Server offloads heavy CFD computation

**Cons:**
- More complex architecture
- Need to sync two visualization systems
- Higher GPU memory usage

## Final Recommended Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Server (Future CFD)          │  Frontend (Visualization)   │
├───────────────────────────────┼─────────────────────────────┤
│  - CFD simulation             │  - ParticleSystemNode       │
│  - Temperature grid 3D        │  - GPU particle rendering   │
│  - Velocity grid 3D           │  - Hybrid renderer          │
│  - Pressure field             │  - HeatmapRenderer (reuse)  │
│  - Diffuser boundary conds    │  - ParticleFlowRenderer     │
└───────────────────────────────┴─────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Mock Data API  │
                    │  (Development)  │
                    └─────────────────┘
```

### New Schema Design

```typescript
interface ParticleSystemNode {
  id: string
  type: 'particle-system'
  levelId?: string
  zoneId?: string

  // Particle system configuration
  particleCount: number        // 2000-5000
  particleSize: number         // 0.02-0.05
  particleLifetime: number     // frames before respawn

  // Diffuser configuration
  emitters: ParticleEmitter[]  // Supply diffusers
  attractors: ParticleAttractor[] // Return/exhaust diffusers

  // Flow field data (from CFD server)
  velocityField?: VelocityField3D
  temperatureField?: TemperatureField3D
  pressureField?: PressureField3D

  // Visualization settings
  colorByTemperature: boolean
  colorScheme: string
  showTrails: boolean
  trailLength: number
}

interface ParticleEmitter {
  id: string
  position: [number, number, number]
  direction: [number, number, number]
  velocity: number
  temperature: number
  spreadAngle: number  // Cone angle in radians
  emissionRate: number // Particles per second
}

interface ParticleAttractor {
  id: string
  position: [number, number, number]
  strength: number     // Attraction force
  radius: number       // Capture radius
}

interface VelocityField3D {
  gridResolution: [number, number, number]
  bounds: { min: Vector3, max: Vector3 }
  data: Float32Array  // [vx, vy, vz] per cell
}
```

### GPU Particle System Design

**Compute Shader Pipeline:**
```glsl
// 1. Emission: Spawn new particles at emitter positions
// 2. Advection: Advect particles through velocity field
// 3. Forces: Apply buoyancy, pressure gradient, attraction
// 4. Integration: Update positions (RK4 or Verlet)
// 5. Collision: Handle wall/floor boundaries
// 6. Temperature: Sample temperature field for color
```

**Key Optimization Strategies:**
1. **GPU Physics:** Use compute shaders for all particle physics
2. **Texture Sampling:** Store velocity/temp fields as 3D textures
3. **Instanced Rendering:** Draw particles with GPU instancing
4. **Double Buffering:** Ping-pong buffers for position/velocity
5. **Frustum Culling:** Only render visible particles

### Mock Data Generator (Development)

```typescript
function generateMockCFDData(room: RoomNode): ParticleSystemData {
  return {
    emitters: [
      {
        id: 'supply-1',
        position: [2, 2.5, 2],
        direction: [0, -1, 0],
        velocity: 0.5,
        temperature: 293, // 20°C supply air
        spreadAngle: Math.PI / 6,
        emissionRate: 100
      }
    ],
    attractors: [
      {
        id: 'return-1',
        position: [2, 0.5, 8],
        strength: 0.1,
        radius: 1.0
      }
    ],
    // Simplified velocity field for mock data
    velocityField: generateMockVelocityField(room),
    temperatureField: generateMockTemperatureField(room)
  }
}
```

### Implementation Phases

| Phase | Deliverable | Priority |
|-------|-------------|----------|
| 1 | ParticleSystemNode schema | High |
| 2 | Mock CFD data generator | High |
| 3 | GPU particle renderer (basic) | High |
| 4 | Velocity field advection | High |
| 5 | Temperature-based coloring | Medium |
| 6 | Diffuser emitters/attractors | Medium |
| 7 | Pressure field integration | Low |
| 8 | Trail rendering | Low |

### Key Technical Decisions

1. **Three.js Points vs GPU Particles:** Use Three.js `Points` with custom shader material for MVP, migrate to compute shaders later

2. **Velocity Field Interpolation:** Trilinear interpolation for smooth particle motion between grid cells

3. **Temperature Coloring:** Reuse existing `colorMaps` from heatmap system (jet, cool-warm, etc.)

4. **Particle Lifetime:** 2-5 seconds typical, respawn at emitters when expired or captured

5. **Wall Collisions:** Simple bounding box + polygon containment check for zone walls

### Success Metrics

- [ ] 60fps with 2000+ particles on mid-range GPU
- [ ] Visible flow patterns from supply to return diffusers
- [ ] Color gradient shows temperature change along particle paths
- [ ] Multiple diffusers create realistic interaction patterns
- [ ] Hybrid view provides better understanding than heatmap alone

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPU performance too slow | High | Start with 500 particles, scale up |
| Velocity field interpolation expensive | Medium | Use 3D texture sampling in shader |
| Mock data doesn't match real CFD | Medium | Design schema for extensibility |
| Visual clutter with many particles | Low | Add opacity controls, density settings |

## Next Steps

1. **Create ParticleSystemNode schema** in `packages/core/src/schema/nodes/particle-system.ts`
2. **Build mock CFD data generator** in `packages/editor/src/lib/hvac/mock-cfd-generator.ts`
3. **Implement GPU particle renderer** in `packages/viewer/src/components/renderers/particles/`
4. **Integrate with existing heatmap** in `packages/viewer/src/components/renderers/heatmap/`

---

**Report ID:** hvac-particle-viz-brainstorm-260318-0954-hybrid-particle-system
**Created:** 2026-03-18
**Status:** Ready for implementation planning
