import { Color, DataTexture, RGBAFormat } from 'three'

export type ColorMapFunction = (value: number, min: number, max: number) => Color

// Jet colormap (classic CFD visualization) - Fixed blue→cyan→green→yellow→red
export const jetColorMap: ColorMapFunction = (value, min, max) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))

  let r: number, g: number, b: number

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

// Viridis colormap (perceptually uniform, colorblind-friendly)
export const viridisColorMap: ColorMapFunction = (value, min, max) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  // Simplified viridis approximation
  const r = Math.round(255 * (0.267 + 0.733 * t))
  const g = Math.round(255 * (0.004 + 0.9 * t * (1 - t)))
  const b = Math.round(255 * (0.33 + 0.47 * (1 - t)))
  return new Color(`rgb(${r},${g},${b})`)
}

// Coolwarm (diverging colormap for positive/negative deviations)
export const coolwarmColorMap: ColorMapFunction = (value, min, max) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const r = Math.round(255 * t)
  const g = Math.round(255 * 0.5)
  const b = Math.round(255 * (1 - t))
  return new Color(`rgb(${r},${g},${b})`)
}

// Plasma colormap
export const plasmaColorMap: ColorMapFunction = (value, min, max) => {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const r = Math.round(255 * Math.min(1, 0.05 + 1.5 * t))
  const g = Math.round(255 * (0.1 + 0.4 * t * (1 - t)))
  const b = Math.round(255 * (0.3 + 0.7 * (1 - t)))
  return new Color(`rgb(${r},${g},${b})`)
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
