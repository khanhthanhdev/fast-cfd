# Phase 4: Increase Heatmap Slice Density from 10 to 25 Levels

**Priority:** Medium | **Status:** Complete | **Effort:** 0.5h

## Context

Current `verticalLevels` default is 10, need 25 for smoother volumetric visualization.

## Requirements

- Increase default `verticalLevels` from 10 to 25
- Update heatmap renderer to handle increased density efficiently
- Ensure performance remains acceptable (>40fps)

## Implementation Steps

### 1. Update schema default

Modify `/packages/core/src/schema/nodes/heatmap.ts`:

```typescript
export const HeatmapDataSchema = z.object({
  // ... existing fields ...

  // Vertical levels count for 3D grid
  verticalLevels: z.number().default(25), // Changed from 10

  // ... rest of schema ...
})
```

### 2. Update heatmap slice generation

In `/packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx`:

```typescript
// In horizontalSlices useMemo
const visibleLevels = Math.min(25, totalLevels) // Allow up to 25
const step = Math.floor(totalLevels / visibleLevels)

for (let i = 0; i < totalLevels; i += step) {
  // ... existing slice creation ...
}
```

### 3. Optimize for performance

Add LOD (Level of Detail) based on camera distance:

```typescript
const cameraDistance = useThree(({ camera }) =>
  camera.position.distanceTo(new Vector3(centerX, roomHeight / 2, centerZ))
)

const lodLevels = useMemo(() => {
  if (cameraDistance < 5) return 25      // Close: full detail
  if (cameraDistance < 15) return 15     // Medium: reduced
  return 10                               // Far: minimal
}, [cameraDistance])
```

### 4. Adjust opacity for visual clarity

More slices = more opaque overall, so reduce per-slice opacity:

```typescript
const baseOpacity = (node.opacity ?? 0.7) * (10 / visibleLevels) * 0.7
```

## Files to Modify

- `/packages/core/src/schema/nodes/heatmap.ts` - Change default verticalLevels to 25
- `/packages/viewer/src/components/renderers/heatmap/heatmap-3d-renderer.tsx` - Handle 25 slices efficiently

## Success Criteria

- [ ] 25 horizontal slice planes rendered when zoomed in
- [ ] Smooth vertical gradient visualization
- [ ] No significant performance degradation (>40fps)
- [ ] Automatic LOD based on camera distance
- [ ] Opacity adjusted for visual clarity
