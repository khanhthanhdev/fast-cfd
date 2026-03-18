# HVAC System Architecture

## Overview

The HVAC system enables AI-powered CFD (Computational Fluid Dynamics) analysis for building design. Users place diffusers (supply/return air), configure boundary conditions, run simulations, and visualize temperature/velocity/comfort distributions.

---

## Diffuser System

### Diffuser Types

| Type | Asset ID | Tags | Attachment | Purpose |
|------|----------|------|------------|---------|
| **Diffuser In** | `diffuser-in` | `hvac`, `supply`, `in`, `ceiling` | Ceiling | Supply air intake |
| **Diffuser Out** | `diffuser-out` | `hvac`, `return`, `out`, `ceiling`, `wall` | Ceiling/Wall | Return/exhaust air outlet |

### Asset Definition

```typescript
// packages/editor/src/lib/hvac/diffuser-detector.ts
const DIFFUSER_ASSETS = {
  'diffuser-in': {
    id: 'diffuser-in',
    tags: ['ceiling', 'hvac', 'supply', 'in', 'structure'],
    name: 'Diffuser In',
    src: '/items/diffuser-in/model.glb',
    dimensions: [0.6, 0.15, 0.6],  // width, height, depth (meters)
    attachTo: 'ceiling',
  },
  'diffuser-out': {
    id: 'diffuser-out',
    tags: ['ceiling', 'wall', 'hvac', 'return', 'out', 'structure'],
    name: 'Diffuser Out',
    src: '/items/diffuser-out/model.glb',
    dimensions: [0.6, 0.15, 0.6],
    attachTo: 'ceiling',
  },
}
```

---

## Diffuser Placement Workflow

### Step 1: Select Diffuser Type

User activates the **Diffuser Tool** from the toolbar and selects:
- **In** (Supply Air) - Blue icon
- **Out** (Return Air) - Orange icon

### Step 2: Surface Detection (Auto-Detect)

The `usePlacementCoordinator` hook handles surface detection:

```typescript
// packages/editor/src/components/tools/hvac/diffuser-tool.tsx
const cursor = usePlacementCoordinator({
  asset,
  draftNode,
  initDraft: (gridPosition) => {
    // Auto-detects ceiling/wall surfaces
    if (!asset.attachTo) {
      draftNode.create(gridPosition, asset)
    }
  },
  onCommitted: () => {
    sfxEmitter.emit('sfx:item-place')
    return true
  },
})
```

### Step 3: Placement Strategies

#### Ceiling Placement (`ceilingStrategy`)

```typescript
// packages/editor/src/components/tools/item/placement-strategies.ts
enter(event: CeilingEvent) {
  if (ctx.asset.attachTo !== 'ceiling') return null

  // Snap to grid on ceiling surface
  const x = snapToGrid(event.position[0], dimX)
  const z = snapToGrid(event.position[2], dimZ)

  return {
    stateUpdate: { surface: 'ceiling', ceilingId: event.node.id },
    nodeUpdate: {
      position: [x, -itemHeight, z],  // Hang below ceiling
      parentId: event.node.id,
    },
  }
}
```

**Behavior:**
- Hover over ceiling → draft appears snapped to ceiling grid
- Position: `[x, -itemHeight, z]` (hangs below ceiling)
- Click → commits placement, item becomes child of ceiling node

#### Wall Placement (`wallStrategy`)

```typescript
enter(event: WallEvent) {
  if (attachTo !== 'wall' && attachTo !== 'wall-side') return null

  // Calculate side (front/back) from normal
  const side = getSideFromNormal(event.normal)
  const itemRotation = calculateItemRotation(event.normal)

  // Auto-adjust Y to fit within wall bounds
  const validation = validators.canPlaceOnWall(...)
  const adjustedY = validation.adjustedY ?? y

  return {
    stateUpdate: { surface: 'wall', wallId: event.node.id },
    nodeUpdate: {
      position: [x, adjustedY, z],
      parentId: event.node.id,
      side,
      rotation: [0, itemRotation, 0],
    },
  }
}
```

**Behavior:**
- Hover over wall → draft snaps to wall surface
- Auto-adjusts height to fit within wall bounds
- Calculates rotation based on wall normal
- Click → commits placement, item becomes child of wall node

### Step 4: Validation

```typescript
// Spatial validators ensure:
// - Item fits within ceiling/wall bounds
// - No collision with other items
// - Proper clearances maintained

validators.canPlaceOnCeiling(ceilingId, position, dimensions, rotation, excludeIds)
validators.canPlaceOnWall(levelId, wallId, x, y, dimensions, attachType, side, excludeIds)
```

---

## Diffuser Detection System

### Detection by Tags

```typescript
// packages/editor/src/lib/hvac/diffuser-detector.ts
export function isHVACDiffuser(item: ItemNode): boolean {
  const tags = item.asset.tags || []
  return tags.includes('hvac') && (
    tags.includes('supply') ||
    tags.includes('return') ||
    tags.includes('in') ||
    tags.includes('out')
  )
}

export function getDiffuserType(item: ItemNode): DiffuserType {
  const tags = item.asset.tags || []
  if (tags.includes('return') || tags.includes('out')) return 'return'
  if (tags.includes('exhaust')) return 'exhaust'
  return 'supply'
}
```

### Find All Diffusers

```typescript
export function findAllDiffusers(allNodes: Record<string, any>): DiffuserInfo[] {
  const diffusers: DiffuserInfo[] = []

  for (const [id, node] of Object.entries(allNodes)) {
    if (node.type !== 'item') continue

    const item = node as ItemNode
    if (!isHVACDiffuser(item)) continue

    diffusers.push({
      id: item.id,
      type: getDiffuserType(item),
      position: item.position,
      itemId: item.asset.id,
      name: item.asset.name,
    })
  }

  return diffusers
}
```

### Zone-Filtered Detection

```typescript
export function findDiffusersInZone(
  zoneId: string,
  allNodes: Record<string, any>,
  zonePolygon?: [number, number][],
): DiffuserInfo[] {
  const allDiffusers = findAllDiffusers(allNodes)

  if (!zonePolygon) return allDiffusers

  // Filter by point-in-polygon test
  return allDiffusers.filter((diffuser) => {
    const [x, _, z] = diffuser.position
    return isPointInPolygon([x, z], zonePolygon)
  })
}
```

### Auto-Detection in HVAC Panel

```typescript
// packages/editor/src/components/panels/hvac-tool-panel.tsx
useEffect(() => {
  const allDiffusers = findAllDiffusers(nodes)

  if (allDiffusers.length > 0) {
    let diffusers = allDiffusers
    if (zoneNode?.polygon) {
      diffusers = findDiffusersInZone(zoneNode.id, nodes, zoneNode.polygon)
    }

    // Use aggregated position for AI model
    const aggregatedPosition = getAggregatedDiffuserPosition(diffusers)

    setBoundaryConditions((prev) => ({
      ...prev,
      diffuserPosition: aggregatedPosition,
      diffusers,
    }))
  }
}, [nodes, selectedZoneId])
```

---

## HVAC Analysis Pipeline

### Step 1: Room Selection

User selects or creates a zone (room) for analysis via `useHVACRoomSelection`:

```typescript
const {
  spaces,           // Detected spaces from auto-detection
  selectedSpaceId,
  isCreating,
  handleSelectSpace,
  handleCreateZone,
} = useHVACRoomSelection()
```

### Step 2: Boundary Conditions Configuration

User configures HVAC parameters:

```typescript
interface HVACBoundaryConditions {
  supplyAirTemp: number      // °C (default: 20)
  airflowRate: number        // m³/h (default: 100)
  diffuserPosition: [number, number, number]  // Auto-detected
  diffusers: DiffuserInfo[]  // All detected diffusers
  occupancy: number          // people (default: 2)
  outdoorTemp: number        // °C (default: 25)
}
```

### Step 3: Feature Vector Building

```typescript
// packages/editor/src/lib/hvac/feature-vector-builder.ts
export function buildFeatureVector(
  geometry: RoomGeometry,
  boundary: HVACBoundaryConditions,
): number[] {
  return [
    geometry.length,           // Room length (m)
    geometry.width,            // Room width (m)
    geometry.height,           // Room height (m)
    geometry.windowArea,       // Window area (m²)
    geometry.wallExposureRatio,// Window/wall ratio
    boundary.supplyAirTemp,    // °C
    boundary.airflowRate,      // m³/h
    boundary.occupancy,        // people
    boundary.outdoorTemp,      // °C
    boundary.diffuserPosition[0], // x
    boundary.diffuserPosition[1], // y
    boundary.diffuserPosition[2], // z
  ]
}
```

### Step 4: AI Inference

```typescript
// packages/editor/src/lib/hvac/ai-inference-client.ts
export async function callAIInference(
  request: AIInferenceRequest,
): Promise<AIInferenceResponse> {
  const response = await fetch('/api/hvac-inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      features: request.featureVector,
      gridSize: 20,
      verticalLevels: 10,
    }),
  })

  return {
    temperatureGrid: data.temperatureGrid,
    velocityGrid: data.velocityGrid,
    averageTemperature: data.averageTemperature,
    pmv: data.pmv,              // Predicted Mean Vote
    comfortScore: data.comfortScore,
    // 3D data (optional)
    temperatureGrid3D: data.temperatureGrid3D,
    velocityGrid3D: data.velocityGrid3D,
    velocityGrid3DDirection: data.velocityGrid3DDirection,
  }
}
```

### Step 5: Heatmap Creation

```typescript
// packages/editor/src/components/panels/hvac-tool-panel.tsx
const heatmapNode = HeatmapNode.parse({
  data: {
    gridSize: 20,
    temperatureGrid: response.temperatureGrid,
    velocityGrid: response.velocityGrid,
    temperatureGrid3D: response.temperatureGrid3D,
    velocityGrid3D: response.velocityGrid3D,
    velocityGrid3DDirection: response.velocityGrid3DDirection,
    verticalLevels: 10,
    averageTemperature: response.averageTemperature,
    pmv: response.pmv,
    comfortScore: response.comfortScore,
  },
  levelId: levelNode.id,
  zoneId: zoneNode.id,
  inferenceId: response.inferenceId,
  visualizationType: 'temperature',
  colorScheme: 'jet',
  opacity: 0.7,
})

createNode(heatmapNode, levelNode.id)
```

---

## Heatmap Node Schema

```typescript
// packages/core/src/schema/nodes/heatmap.ts
export const HeatmapNode = BaseNode.extend({
  id: objectId('heatmap'),
  type: nodeType('heatmap'),

  levelId: z.string().nullable(),
  zoneId: z.string().nullable(),

  inferenceId: z.string().optional(),
  inferenceTimestamp: z.number().optional(),

  // Visualization settings
  visualizationType: z.enum(['temperature', 'velocity', 'pmv']).default('temperature'),
  colorScheme: z.enum(['jet', 'viridis', 'plasma', 'coolwarm']).default('jet'),
  opacity: z.number().min(0).max(1).default(0.7),

  // CFD data
  data: HeatmapDataSchema,
})

export const HeatmapDataSchema = z.object({
  gridSize: z.number().default(20),

  // 2D grids
  temperatureGrid: z.array(z.array(z.number())),
  velocityGrid: z.array(z.array(z.number())),
  velocityDirection: z.array(z.array(z.object({ x: number, y: number, z: number }))).optional(),

  // KPIs
  averageTemperature: z.number(),
  pmv: z.number(),
  comfortScore: z.number(),

  // 3D volumetric data
  verticalLevels: z.number().default(10),
  heightOffsets: z.array(z.number()).optional(),
  temperatureGrid3D: z.array(z.array(z.array(z.number()))).optional(),
  velocityGrid3D: z.array(z.array(z.array(z.number()))).optional(),
  velocityGrid3DDirection: z.array(z.array(z.array(
    z.object({ x: number, y: number, z: number })
  ))).optional(),
})
```

---

## Mock CFD Generation (Fallback)

When AI inference is unavailable, mock CFD data is generated:

```typescript
// packages/editor/src/lib/hvac/mock-cfd-generator.ts
export function generateMockCFDData(
  supplyDiffusers: DiffuserInfo[],
  returnDiffusers: DiffuserInfo[],
  options: MockCFDOptions,
): ParticleSystemData {
  return {
    emitters: createEmittersFromDiffusers(supplyDiffusers, options.supplyTemperature),
    attractors: createAttractorsFromDiffusers(returnDiffusers),
    velocityField: generateMockVelocityField(emitters, attractors, options),
    temperatureField: generateMockTemperatureField(emitters, options.ambientTemperature, options),
    pressureField: generateMockPressureField(emitters, attractors, options),
  }
}
```

### Velocity Field Calculation

```typescript
function calculateVelocityAt(point, emitters, attractors, bounds): Vector3 {
  // Add supply jet velocities (Gaussian profile)
  for (const emitter of emitters) {
    const vel = calculateSupplyJetVelocity(point, emitter)
    vx += vel.x; vy += vel.y; vz += vel.z
  }

  // Add return flow velocities (radial inflow)
  for (const attractor of attractors) {
    const vel = calculateReturnFlowVelocity(point, attractor)
    vx += vel.x; vy += vel.y; vz += vel.z
  }

  // Apply buoyancy and wall damping
  vy += 0.01  // Upward buoyancy
  return { x: vx * damping, y: vy * damping, z: vz * damping }
}
```

---

## Report Generation

```typescript
// packages/editor/src/lib/hvac/report-generator.ts
export async function generatePDFReport(data: ReportData): Promise<void> {
  const reportWindow = window.open('', '_blank')
  reportWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head><title>HVAC Analysis Report</title></head>
      <body>
        <h1>HVAC Analysis Report</h1>
        <h2>Room Geometry</h2>
        <table>...</table>
        <h2>Scenario Results</h2>
        ${data.scenarios.map(scenario => `
          <div class="scenario">
            <h3>${scenario.name}</h3>
            <div class="kpi-grid">
              <div class="kpi-card">
                <div class="kpi-value">${scenario.results.pmv.toFixed(2)}</div>
                <div class="kpi-label">PMV</div>
              </div>
              <div class="kpi-card">
                <div class="kpi-value">${(scenario.results.comfortScore * 100).toFixed(0)}%</div>
                <div class="kpi-label">Comfort Score</div>
              </div>
            </div>
          </div>
        `).join('')}
      </body>
    </html>
  `)
  reportWindow.print()
}
```

---

## File Locations

| Component | Path |
|-----------|------|
| Diffuser Tool | `packages/editor/src/components/tools/hvac/diffuser-tool.tsx` |
| Diffuser Panel | `packages/editor/src/components/panels/diffuser-tool-panel.tsx` |
| HVAC Tool Panel | `packages/editor/src/components/panels/hvac-tool-panel.tsx` |
| Diffuser Detector | `packages/editor/src/lib/hvac/diffuser-detector.ts` |
| Feature Vector Builder | `packages/editor/src/lib/hvac/feature-vector-builder.ts` |
| AI Inference Client | `packages/editor/src/lib/hvac/ai-inference-client.ts` |
| Mock CFD Generator | `packages/editor/src/lib/hvac/mock-cfd-generator.ts` |
| Report Generator | `packages/editor/src/lib/hvac/report-generator.ts` |
| Heatmap Node Schema | `packages/core/src/schema/nodes/heatmap.ts` |
| Placement Strategies | `packages/editor/src/components/tools/item/placement-strategies.ts` |

---

## Data Flow Summary

```
User selects Diffuser Tool
       ↓
Choose In/Out type
       ↓
Hover over ceiling/wall → Surface detection
       ↓
Click → Place diffuser item
       ↓
[Diffuser stored as ItemNode with hvac tags]
       ↓
User opens HVAC panel
       ↓
Auto-detect diffusers (findAllDiffusers)
       ↓
Configure boundary conditions
       ↓
Run Analysis → callAIInference()
       ↓
Receive temperature/velocity/PMV grids
       ↓
Create HeatmapNode
       ↓
Visualize in 3D scene
       ↓
Export Report (PDF)
```
