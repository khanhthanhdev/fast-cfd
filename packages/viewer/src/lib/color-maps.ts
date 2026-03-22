import { Color, DataTexture, RGBAFormat } from 'three'

export type ColorMapFunction = (
  value: number,
  min: number,
  max: number,
  target?: Color,
) => Color

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function normalizeValue(value: number, min: number, max: number): number {
  const range = max - min
  if (!Number.isFinite(range) || Math.abs(range) <= Number.EPSILON) {
    return 0.5
  }

  return clamp01((value - min) / range)
}

function setColor(target: Color | undefined, red: number, green: number, blue: number): Color {
  return (target ?? new Color()).setRGB(red, green, blue)
}

// Jet colormap (classic CFD visualization) - Fixed blue→cyan→green→yellow→red
export const jetColorMap: ColorMapFunction = (value, min, max, target) => {
  const t = normalizeValue(value, min, max)

  let r: number, g: number, b: number

  if (t < 0.125) {
    // Blue to cyan
    r = 0
    g = t / 0.125
    b = 1
  } else if (t < 0.375) {
    // Cyan to green
    r = 0
    g = 1
    b = 1 - (t - 0.125) / 0.25
  } else if (t < 0.625) {
    // Green to yellow
    r = (t - 0.375) / 0.25
    g = 1
    b = 0
  } else if (t < 0.875) {
    // Yellow to red
    r = 1
    g = 1 - (t - 0.625) / 0.25
    b = 0
  } else {
    // Red (saturate)
    r = 1
    g = 0
    b = 0
  }

  return setColor(target, r, g, b)
}

// Viridis colormap (perceptually uniform, colorblind-friendly)
export const viridisColorMap: ColorMapFunction = (value, min, max, target) => {
  const t = normalizeValue(value, min, max)
  // Simplified viridis approximation
  const r = 0.267 + 0.733 * t
  const g = 0.004 + 0.9 * t * (1 - t)
  const b = 0.33 + 0.47 * (1 - t)
  return setColor(target, r, g, b)
}

// Coolwarm (diverging colormap for positive/negative deviations)
export const coolwarmColorMap: ColorMapFunction = (value, min, max, target) => {
  const t = normalizeValue(value, min, max)
  return setColor(target, t, 0.5, 1 - t)
}

// Plasma colormap
export const plasmaColorMap: ColorMapFunction = (value, min, max, target) => {
  const t = normalizeValue(value, min, max)
  const r = Math.min(1, 0.05 + 1.5 * t)
  const g = 0.1 + 0.4 * t * (1 - t)
  const b = 0.3 + 0.7 * (1 - t)
  return setColor(target, r, g, b)
}

export const colorMaps: Record<string, ColorMapFunction> = {
  jet: jetColorMap,
  viridis: viridisColorMap,
  plasma: plasmaColorMap,
  coolwarm: coolwarmColorMap,
}

/**
 * Generate a 1D texture for GPU color mapping
 */
export function createColorMapTexture(
  colorScheme: string,
  min: number,
  max: number,
  size: number = 256,
): DataTexture {
  const colors = new Uint8Array(size * 4)
  const mapFn = colorMaps[colorScheme] || jetColorMap

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1)
    const value = min + t * (max - min)
    const color = mapFn(value, min, max)

    colors[i * 4 + 0] = Math.round(color.r * 255)
    colors[i * 4 + 1] = Math.round(color.g * 255)
    colors[i * 4 + 2] = Math.round(color.b * 255)
    colors[i * 4 + 3] = 255 // Alpha
  }

  return new DataTexture(colors, size, 1, RGBAFormat)
}
