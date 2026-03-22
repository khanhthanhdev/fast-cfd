# HVAC System Architecture

## Overview

The HVAC system enables AI-powered CFD (Computational Fluid Dynamics) analysis for building design. Users place diffusers (supply/return air), configure boundary conditions, run simulations, and visualize temperature/velocity/comfort distributions.

**Two Inference Modes:**
1. **Legacy Surrogate Model** - 12-feature vector input, predicts 2D/3D temperature & velocity grids
2. **GINOT Neural Operator** - Geometry-aware neural operator, predicts point cloud airflow fields (velocity, pressure, speed)

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

**Legacy Mode (12-feature surrogate model):**
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
    pmv: data.pmv,
    comfortScore: data.comfortScore,
    temperatureGrid3D: data.temperatureGrid3D,
    velocityGrid3D: data.velocityGrid3D,
    velocityGrid3DDirection: data.velocityGrid3DDirection,
  }
}
```

**GINOT Mode (Neural Operator):**
```typescript
// packages/editor/src/lib/hvac/ai-inference-client.ts
export async function callGinotInference(
  request: GinotInferenceRequest,
): Promise<GinotInferenceResponse> {
  const response = await fetch('/api/hvac-inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      load: Array.from(request.load),
      pc: Array.from(request.pc),
      xyt: Array.from(request.xyt),
    }),
  })

  // Response contains positions, velocities, pressure, speed at query points
  return {
    positions: data.positions,
    velocities: data.velocities,
    pressure: data.pressure,
    speed: data.speed,
    bounds: data.bounds,
    metadata: data.metadata,
  }
}
```

---

## Backend Integration

### API Endpoint

All inference requests go to: `/api/hvac-inference` (configurable via `NEXT_PUBLIC_HVAC_INFERENCE_URL`)

### 1. Legacy Surrogate Model API

**Request (`AIInferenceRequest`):**
```typescript
{
  featureVector: number[]      // 12 features: [length, width, height, windowArea, wallRatio, supplyTemp, airflow, occupancy, outdoorTemp, diffuserX, diffuserY, diffuserZ]
  gridSize?: number            // Default: 20
  verticalLevels?: number      // Default: 10
}
```

**Response (`AIInferenceResponse`):**
```typescript
{
  temperatureGrid: number[][]           // 2D [gridSize][gridSize] temperature values (°C)
  velocityGrid: number[][]              // 2D [gridSize][gridSize] velocity magnitudes (m/s)
  averageTemperature: number            // Mean room temperature (°C)
  pmv: number                           // Predicted Mean Vote (thermal comfort, -3 to +3)
  comfortScore: number                  // 0-1 comfort metric
  inferenceId: string                   // Unique ID for tracking
  timestamp: number                     // Unix timestamp

  // 3D volumetric data (optional)
  temperatureGrid3D?: number[][][]      // [verticalLevels][gridSize][gridSize]
  velocityGrid3D?: number[][][]         // [verticalLevels][gridSize][gridSize]
  velocityGrid3DDirection?: {x,y,z}[][][]  // Velocity vectors at each point
  verticalLevels?: number
  heightOffsets?: number[]              // Normalized height for each level
}
```

### 2. GINOT Neural Operator API

**Request (`GinotInferenceRequest`):**
```typescript
{
  load: number[] | Float32Array    // 9-element normalized load vector
  pc: number[] | Float32Array      // 100K boundary points [N*3] flattened
  xyt: number[] | Float32Array     // Interior query points [M*3] flattened
  metadata?: {
    boundaryCount?: number
    interiorCount?: number
    center?: [number, number, number]
    scale?: number
  }
}
```

**Load Vector Layout (9 elements):**
| Index | Field | Description | Normalized |
|-------|-------|-------------|------------|
| 0-2 | `inlet_center` | Supply diffuser position [X, Y, Z] | Yes |
| 3-5 | `outlet_center` | Return diffuser position [X, Y, Z] | Yes |
| 6-8 | `inlet_velocity` | Air velocity vector [U, V, W] m/s | No |

**Response (`GinotInferenceResponse`):**
```typescript
{
  positions: number[][]      // Query point coordinates [N][3] (normalized)
  velocities: number[][]     // Velocity vectors [N][3] in m/s
  pressure: number[]         // Scalar pressure [N] in Pa
  speed: number[]            // Velocity magnitude [N] in m/s
  bounds: {
    min: number[]
    max: number[]
  }
  metadata: {
    inletCenter: number[]
    outletCenter: number[]
    inletVelocity: number[]
  }
  inferenceId: string
  timestamp: number
}
```

**Denormalization:**
```typescript
// Response positions are normalized; denormalize before visualization:
const denormalizedPositions = denormalizePoints(
  ginotResponse.positions,
  ginotInput.metadata.center,
  ginotInput.metadata.scale,
)
```

### Input/Output Summary

| Mode | Input | Output |
|------|-------|--------|
| **Legacy** | 12-element feature vector (room geometry + boundary conditions) | 2D/3D temperature & velocity grids, PMV, comfort score |
| **GINOT** | Boundary point cloud (100K points) + interior query points (50K) + load vector (9 params) | Point cloud with velocity, pressure, speed at each query point |

---

## Heat Map Visualization

### Rendering Pipeline

The heatmap renderer (`heatmap-3d-renderer.tsx`) processes HeatmapNode data and renders:
1. **Horizontal slices** - Temperature/velocity mapped to color via color scheme
2. **Vertical wall slices** - Side views of thermal distribution
3. **GINOT point cloud** - Scatter visualization for neural operator output
4. **Particle flow** - Animated particles following velocity field
5. **Velocity vectors** - Arrow overlays showing flow direction

### Heatmap Node Schema

```typescript
// packages/core/src/schema/nodes/heatmap.ts
HeatmapNode {
  id: string
  type: 'heatmap'
  levelId: string | null
  zoneId: string | null
  inferenceId: string
  inferenceTimestamp: number

  // Visualization settings
  visualizationType: 'temperature' | 'velocity' | 'pmv' | 'speed' | 'pressure'
  colorScheme: 'jet' | 'viridis' | 'plasma' | 'coolwarm'
  opacity: number  // 0-1

  // CFD data
  data: {
    gridSize: number
    temperatureGrid: number[][]
    velocityGrid: number[][]
    averageTemperature: number
    pmv: number
    comfortScore: number

    // 3D data
    verticalLevels: number
    temperatureGrid3D?: number[][][]
    velocityGrid3D?: number[][][]
    velocityGrid3DDirection?: {x,y,z}[][][]
    heightOffsets?: number[]

    // GINOT point cloud
    ginotPointCloud?: Array<{
      position: [number, number, number]
      velocity: [number, number, number]
      pressure: number
      speed: number
    }>
    speedField?: number[]
    pressureField?: number[]
  }
}
```

### Render Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `2d` | Single horizontal plane at fixed height (~1.2m) | Quick overview, default view |
| `3d-slice` | Single slice at user-controlled height | Inspect specific vertical levels |
| `3d-volume` | Multiple horizontal + vertical slices | Full 3D spatial understanding |

### LOD (Level of Detail) System

Based on camera distance to room center:
- **Near (<5m):** 25 vertical slices
- **Mid (5-15m):** 15 vertical slices
- **Far (>15m):** 10 vertical slices

### Color Schemes

| Scheme | Use Case |
|--------|----------|
| `jet` | Default temperature visualization (blue-cold, red-hot) |
| `viridis` | Perceptually uniform, colorblind-friendly |
| `plasma` | High-contrast alternative |
| `coolwarm` | Diverging data (deviation from mean) |

### GINOT Point Cloud Rendering

For GINOT mode, point-based visualization:
- **Metric:** Speed or Pressure
- **Point Size:** Configurable (default: 0.05)
- **Opacity:** Configurable (default: 0.8)

### Particle Flow Visualization

Optional particle system overlays the heatmap:
- Particles follow velocity field
- Color-coded by temperature
- Configurable density (400-5000 particles)
- Trail visualization for flow paths
- Buoyancy and pressure effects

### Heat Diffusion (Real-time)

When `heatDiffusionEnabled` is true:
- 3D temperature field diffuses in real-time via `useFrame` loop
- Configurable diffusion coefficient and iterations
- Ambient temperature as boundary condition

---

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
| HVAC Panel | `packages/editor/src/components/panels/hvac-tool-panel.tsx` |
| Diffuser Detector | `packages/editor/src/lib/hvac/diffuser-detector.ts` |
| Feature Vector Builder | `packages/editor/src/lib/hvac/feature-vector-builder.ts` |
| GINOT Input Builder | `packages/editor/src/lib/hvac/ginot-input-builder.ts` |
| AI Inference Client | `packages/editor/src/lib/hvac/ai-inference-client.ts` |
| Mock CFD Generator | `packages/editor/src/lib/hvac/mock-cfd-generator.ts` |
| Report Generator | `packages/editor/src/lib/hvac/report-generator.ts` |
| Room Selector Hook | `packages/editor/src/hooks/use-hvac-room-selection.ts` |
| HVAC Analysis Hook | `packages/editor/src/hooks/use-hvac-analysis.ts` |
| Heatmap Node Schema | `packages/core/src/schema/nodes/heatmap.ts` |
| Heatmap 3D Renderer | `packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx` |
| GINOT Point Cloud | `packages/viewer/src/components/renderers/heatmap/ginot-point-cloud.tsx` |
| Particle Flow Renderer | `packages/viewer/src/components/renderers/particles/particle-flow-renderer.tsx` |
| Placement Strategies | `packages/editor/src/components/tools/item/placement-strategies.ts` |
| Room Geometry Snapshot | `packages/editor/src/lib/hvac/room-geometry-snapshot.ts` |
| Point Sampler | `packages/editor/src/lib/hvac/point-sampler.ts` |
| Normalization Utils | `packages/editor/src/lib/hvac/normalization.ts` |

---

## Data Flow Summary

### Legacy Mode Flow
```
User places diffusers (supply/return)
       ↓
Auto-detect diffusers via tags (findAllDiffusers)
       ↓
Extract room geometry (length, width, height, window area)
       ↓
Build 12-feature vector
       ↓
POST /api/hvac-inference { features: [...], gridSize: 20 }
       ↓
Receive: temperatureGrid, velocityGrid, PMV, comfortScore
       ↓
Create HeatmapNode with 2D/3D grid data
       ↓
Render horizontal slices + particle flow
```

### GINOT Mode Flow
```
User places diffusers (supply/return)
       ↓
Sample boundary surface (100K points) → pc
Sample interior volume (50K points) → xyt
       ↓
Build load vector [inletCenter, outletCenter, inletVelocity]
       ↓
Normalize all geometry (center, scale)
       ↓
POST /api/hvac-inference { load, pc, xyt }
       ↓
Receive: positions, velocities, pressure, speed (point cloud)
       ↓
Denormalize positions to world coordinates
       ↓
Create HeatmapNode with ginotPointCloud
       ↓
Render point cloud with color-coded metric (speed/pressure)
```
