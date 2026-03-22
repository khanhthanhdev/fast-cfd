# Phase 1: Fix Jet Colormap for Accurate Blue-Green-Red Transition

**Priority:** High | **Status:** Complete | **Effort:** 1h

## Context

Current jet colormap in `/packages/viewer/src/lib/color-maps.ts` uses incorrect RGB formulas that don't produce the standard blue→cyan→green→yellow→red transition.

## Requirements

Fix `jetColorMap` function to produce:
- **Blue** (0, 0, 255) at cold end (t < 0.25)
- **Cyan→Green** transition at middle (0.25 ≤ t < 0.75)
- **Red** (255, 0, 0) at hot end (t ≥ 0.75)

## Implementation Steps

### 1. Replace jetColorMap with proper piecewise function

```typescript
export const jetColorMap: ColorMapFunction = (value, min, max) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))

  let r, g, b

  if (t < 0.125) {
    // Blue to cyan
    r = 0
    g = Math.round(255 * (t / 0.125))
    b = 255
  } else if (t < 0.375) {
    // Cyan to green
    r = 0
    g = 255
    b = Math.round(255 * (1 - (t - 0.125) / 0.25))
  } else if (t < 0.625) {
    // Green to yellow
    r = Math.round(255 * ((t - 0.375) / 0.25))
    g = 255
    b = 0
  } else if (t < 0.875) {
    // Yellow to red
    r = 255
    g = Math.round(255 * (1 - (t - 0.625) / 0.25))
    b = 0
  } else {
    // Red (saturate)
    r = 255
    g = 0
    b = 0
  }

  return new Color(`rgb(${r},${g},${b})`)
}
```

### 2. Add new "temperature" colormap optimized for HVAC ranges

```typescript
export const temperatureColorMap: ColorMapFunction = (value, min, max) => {
  // Optimized for 16-30°C range (289K-303K)
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  // Similar to jet but with better perceptual uniformity
  ...
}
```

### 3. Update `createColorMapTexture` to use fixed colormap

### 4. Test color output at key temperature points
- 16°C → Blue
- 20°C → Cyan/Green
- 24°C → Yellow
- 28°C → Orange
- 30°C+ → Red

## Files to Modify

- `/packages/viewer/src/lib/color-maps.ts` - Fix jetColorMap, add temperature colormap

## Success Criteria

- [ ] Cold particles (16-18°C) appear blue
- [ ] Neutral particles (20-24°C) appear green/yellow
- [ ] Hot particles (26°C+) appear red
- [ ] Smooth gradient transitions between colors
- [ ] Color map texture generates correctly
