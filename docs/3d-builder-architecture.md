# 3D Builder Architecture

## Overview

The 3D builder is a React Three Fiber-based building editor that uses a **data-driven architecture** where node schemas define the scene, systems generate geometry, and renderers display 3D objects.

## Core Architecture

### Separation of Concerns

| Package | Responsibility |
|---------|---------------|
| **@pascal-app/core** | Node schemas, scene state (Zustand), systems (geometry generation), spatial queries, event bus |
| **@pascal-app/viewer** | 3D rendering via React Three Fiber, camera controls, post-processing |
| **apps/editor** | UI components, tools, custom behaviors, editor-specific systems |

---

## Node Model (Data Layer)

### Base Node Structure

All elements extend `BaseNode`:

```typescript
BaseNode {
  id: string              // Auto-generated with type prefix (e.g., "wall_abc123")
  type: string            // Discriminator for type-safe handling
  parentId: string | null // Parent node reference
  visible: boolean
  camera?: Camera         // Optional saved camera position
  metadata?: JSON         // Arbitrary metadata
}
```

### Node Hierarchy

```
Site
└── Building
    └── Level
        ├── Wall → Item (doors, windows)
        ├── Slab
        ├── Ceiling → Item (lights)
        ├── Roof
        ├── Zone
        ├── Scan (3D reference)
        └── Guide (2D reference)
```

### Node Types

| Node Type | Schema File | Description |
|-----------|-------------|-------------|
| `WallNode` | `packages/core/src/schema/nodes/wall.ts` | Wall with start/end points, thickness, height, frontSide/backSide classification |
| `CeilingNode` | `packages/core/src/schema/nodes/ceiling.ts` | Ceiling with polygon boundary, holes array, height |
| `SlabNode` | `packages/core/src/schema/nodes/slab.ts` | Floor slab with polygon, holes, elevation |
| `LevelNode` | `packages/core/src/schema/nodes/level.ts` | Level container with child nodes, level number |
| `BuildingNode` | `packages/core/src/schema/nodes/building.ts` | Building container |
| `SiteNode` | `packages/core/src/schema/nodes/site.ts` | Root site container |
| `ZoneNode` | `packages/core/src/schema/nodes/zone.ts` | Spatial zone for HVAC/areas |
| `ItemNode` | `packages/core/src/schema/nodes/item.ts` | Furniture, fixtures, equipment |

### Wall Node Details

```typescript
WallNode {
  ...BaseNode,
  children: ItemId[],      // Doors, windows embedded in wall
  thickness: number,       // Wall thickness in meters
  height: number,          // Wall height in meters
  start: [x, z],           // Start point in level coordinates
  end: [x, z],             // End point in level coordinates
  frontSide: 'interior' | 'exterior' | 'unknown',
  backSide: 'interior' | 'exterior' | 'unknown',
}
```

### Ceiling Node Details

```typescript
CeilingNode {
  ...BaseNode,
  children: ItemId[],      // Lights, diffusers
  polygon: [x, z][],       // Boundary coordinates
  holes: [x, z][][],       // Hole polygons (e.g., for columns)
  height: number,          // Ceiling height in meters
}
```

---

## Scene State Management

### Zustand Store (`useScene`)

Located: `packages/core/src/store/use-scene.ts`

```typescript
SceneState {
  nodes: Record<AnyNodeId, AnyNode>,  // Flat dictionary of all nodes
  rootNodeIds: string[],               // Top-level node IDs
  dirtyNodes: Set<AnyNodeId>,          // Nodes pending geometry updates
  collections: Record<CollectionId, Collection>,

  // CRUD Actions
  createNode(node, parentId),
  updateNode(id, data),
  deleteNode(id),
  markDirty(id),
  clearDirty(id),
}
```

### Middleware

- **Persist**: Saves to IndexedDB (excludes transient nodes)
- **Temporal (Zundo)**: Undo/redo with 50-step history

### Dirty Node Pattern

When a node changes, it's marked **dirty**. Systems process dirty nodes each frame:

```typescript
// WallSystem example
useFrame(() => {
  dirtyNodes.forEach((id) => {
    const node = nodes[id]
    if (node?.type !== 'wall') return

    const mesh = sceneRegistry.nodes.get(id)
    if (mesh) {
      updateWallGeometry(id, miterData)
      clearDirty(id)  // Remove from dirty set
    }
  })
})
```

---

## Scene Registry (3D Object Lookup)

Located: `packages/core/src/hooks/scene-registry/scene-registry.ts`

The registry provides fast lookup from node IDs to Three.js objects:

```typescript
sceneRegistry = {
  nodes: Map<id, Object3D>,    // Master lookup: ID → 3D object
  byType: {
    wall: Set<id>,
    ceiling: Set<id>,
    slab: Set<id>,
    // ...
  }
}
```

### Registration Pattern

Renderers register their refs using the `useRegistry` hook:

```tsx
const WallRenderer = ({ node }) => {
  const ref = useRef<Mesh>(null!)
  useRegistry(node.id, 'wall', ref)  // Registers on mount

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0, 0, 0]} />  {/* Placeholder, replaced by WallSystem */}
      <meshStandardMaterial />
    </mesh>
  )
}
```

---

## Node Renderers

Located: `packages/viewer/src/components/renderers/`

Renderers create Three.js placeholder objects for each node type:

```
SceneRenderer
└── NodeRenderer (dispatches by type)
    ├── SiteRenderer
    ├── BuildingRenderer
    ├── LevelRenderer
    ├── WallRenderer
    ├── SlabRenderer
    ├── CeilingRenderer
    ├── ZoneRenderer
    ├── ItemRenderer
    ├── DoorRenderer
    ├── WindowRenderer
    ├── RoofRenderer
    ├── ScanRenderer
    ├── GuideRenderer
    └── Heatmap3DRenderer
```

### Renderer Pattern

1. Create a placeholder mesh/group with `useRef`
2. Register with `useRegistry(node.id, type, ref)`
3. Render children nodes recursively
4. Systems update the geometry via registry lookup

---

## Systems (Geometry Generation)

Located: `packages/core/src/systems/`

Systems are React components that run in `useFrame` to update geometry for dirty nodes.

### Core Systems

| System | File | Responsibility |
|--------|------|---------------|
| `WallSystem` | `wall-system.tsx` | Generates wall geometry with mitering and CSG cutouts |
| `SlabSystem` | `slab-system.tsx` | Generates floor slab geometry from polygons |
| `CeilingSystem` | `ceiling-system.tsx` | Generates ceiling geometry from polygons |
| `ItemSystem` | `item-system.tsx` | Positions items on walls, ceilings, floors |
| `RoofSystem` | `roof-system.tsx` | Generates roof geometry |

### Wall System

**Key Features:**
- **Mitering**: Calculates corner joints between adjacent walls
- **CSG Subtraction**: Cuts out doors/windows using `three-bvh-csg`
- **Slab Elevation**: Adjusts wall height based on slab elevation

**Geometry Generation:**
1. Calculate mitered corners at junctions
2. Build polygon in world coordinates
3. Transform to wall-local coordinates
4. Create `ExtrudeGeometry` along Z-axis
5. Rotate to align with Y-axis (height)
6. Subtract cutouts using CSG

```typescript
// Wall cutout collection (doors/windows)
function collectCutoutBrushes(wallNode, childrenNodes, wallThickness): Brush[] {
  for (const child of childrenNodes) {
    const cutoutMesh = childMesh.getObjectByName('cutout')
    // Calculate bounding box, create box brush extending through wall
    brushes.push(brush)
  }
  return brushes
}
```

### Slab System

**Key Features:**
- **Polygon Extrusion**: Creates 3D slab from 2D polygon
- **Hole Support**: Cuts out openings (e.g., for columns, stairwells)
- **Outset**: Expands polygon slightly to extend under walls

```typescript
function generateSlabGeometry(slabNode): THREE.BufferGeometry {
  const polygon = outsetPolygon(slabNode.polygon, SLAB_OUTSET)

  // Create shape from polygon
  const shape = new THREE.Shape()
  shape.moveTo(firstPt[0], -firstPt[1])
  // ... add remaining points

  // Add holes
  for (const holePolygon of slabNode.holes) {
    const holePath = new THREE.Path()
    // ... create hole path
    shape.holes.push(holePath)
  }

  // Extrude
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: elevation,
    bevelEnabled: false,
  })
  geometry.rotateX(-Math.PI / 2)
  return geometry
}
```

### Ceiling System

**Key Features:**
- **Flat Geometry**: Unlike slabs, ceilings are flat (no extrusion)
- **Hole Support**: Cuts out openings (e.g., for columns)
- **Height Positioning**: Positioned at ceiling height with z-fighting offset

```typescript
function generateCeilingGeometry(ceilingNode): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  // Create shape from polygon
  // Add holes
  // Return flat ShapeGeometry (no extrusion)
}
```

---

## Auto-Detection System

Located: `packages/core/src/lib/space-detection.ts`

### Space Detection Algorithm

The system automatically detects interior/exterior spaces using **grid-based flood fill**:

**Steps:**

1. **Build Grid**: Create discrete grid from walls (0.5m resolution)
2. **Mark Walls**: Rasterize wall polygons onto grid
3. **Flood Fill from Edges**: Mark all edge-connected cells as "exterior"
4. **Find Interior Regions**: Flood fill remaining unmarked regions
5. **Classify Wall Sides**: Check which space each wall side faces

### Grid Building

```typescript
function buildGrid(walls, resolution): Grid {
  // Find bounds from wall endpoints
  // Add padding (2m)
  // Create grid cells

  // Mark wall cells using line rasterization
  for (const wall of walls) {
    markWallCells(grid, wall)
  }
}
```

### Flood Fill from Edges

```typescript
function floodFillFromEdges(grid): void {
  // Add all edge cells to queue
  // Mark as 'exterior'

  // BFS flood fill
  while (queue.length > 0) {
    const key = queue.shift()
    // Check 4 neighbors
    // Mark non-wall neighbors as 'exterior'
  }
}
```

### Interior Space Detection

```typescript
function findInteriorSpaces(grid, levelId): Space[] {
  // Scan grid for unmarked cells
  // Flood fill to find connected regions
  // Each region becomes a Space

  for (const cell of grid.cells) {
    if (cell !== 'wall' && cell !== 'exterior') {
      // Found interior - flood fill
      const spaceCells = floodFillInterior(cell)
      const polygon = extractPolygonFromCells(spaceCells, grid)
      spaces.push({ id, levelId, polygon, wallIds: [], isExterior: false })
    }
  }
}
```

### Wall Side Classification

```typescript
function assignWallSides(walls, grid): WallSideUpdate[] {
  for (const wall of walls) {
    // Sample points on front/back sides (perpendicular to wall)
    const frontCell = getCellAt(midPoint + normal * offset)
    const backCell = getCellAt(midPoint - normal * offset)

    updates.push({
      wallId: wall.id,
      frontSide: classifySide(frontCell),  // 'interior' | 'exterior' | 'unknown'
      backSide: classifySide(backCell),
    })
  }
}
```

### Space Detection Sync

The `initSpaceDetectionSync` function subscribes to scene changes and runs detection when:
- New walls are added that touch existing walls
- Walls are deleted
- Walls are modified

```typescript
initSpaceDetectionSync(sceneStore, editorStore)
// → Listens for scene changes
// → Groups walls by level
// → Runs detectSpacesForLevel() for affected levels
// → Updates wall.frontSide/backSide
// → Stores spaces in editor store
```

---

## Data Flow

```
User Action (tool creates/updates node)
       ↓
useScene.createNode() / updateNode()
       ↓
Node added/updated in store
Node marked dirty
       ↓
React re-renders NodeRenderer
useRegistry() registers 3D object
       ↓
System detects dirty node (useFrame)
Updates geometry via sceneRegistry
Clears dirty flag
       ↓
Space detection runs (if wall changed)
Updates wall side classification
Updates interior spaces
```

---

## Key Technologies

| Technology | Purpose |
|------------|---------|
| **React Three Fiber** | React renderer for Three.js |
| **Three.js** | 3D graphics library |
| **Zustand** | State management |
| **Zundo** | Undo/redo middleware |
| **three-bvh-csg** | Boolean geometry operations (wall cutouts) |
| **three-mesh-bvh** | Bounding volume hierarchy for raycasting |

---

## File Locations

### Schemas
- `packages/core/src/schema/nodes/` - Node type definitions

### State
- `packages/core/src/store/use-scene.ts` - Scene store
- `packages/viewer/src/store/use-viewer.ts` - Viewer state
- `apps/editor/src/store/use-editor.tsx` - Editor state

### Systems
- `packages/core/src/systems/` - Geometry generation systems

### Renderers
- `packages/viewer/src/components/renderers/` - Node renderers

### Auto-Detection
- `packages/core/src/lib/space-detection.ts` - Space detection algorithm
- `packages/core/src/hooks/spatial-grid/` - Spatial query utilities
