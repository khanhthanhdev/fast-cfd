import { DataTexture, RGBAFormat, NearestFilter } from 'three'
import { colorMaps } from './color-maps'

export interface GridData {
  values: number[][]
  min: number
  max: number
}

/**
 * 3D grid data for volumetric heatmaps
 */
export interface GridData3D {
  values: number[][][] // [verticalLevel][row][col]
  min: number
  max: number
  verticalLevels: number
  heightOffsets?: number[]
}

/**
 * Create a heatmap texture from 2D grid data
 */
export function createHeatmapTexture(
  gridData: GridData,
  colorScheme: string = 'jet',
): DataTexture {
  const gridSize = gridData.values.length
  const colorMapFn = (colorMaps[colorScheme] ?? colorMaps.jet)!

  const textureSize = gridSize * 4 // Upscale for smoother appearance
  const pixels = new Uint8Array(textureSize * textureSize * 4)

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const value = gridData.values[y]?.[x] ?? gridData.min
      const color = colorMapFn(value, gridData.min, gridData.max)

      // Upscale each grid cell to 4x4 pixels
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          const px = x * 4 + dx
          const py = textureSize - 1 - y * 4 - dy // Flip Y for correct orientation
          const idx = (py * textureSize + px) * 4

          pixels[idx + 0] = Math.round(color.r * 255)
          pixels[idx + 1] = Math.round(color.g * 255)
          pixels[idx + 2] = Math.round(color.b * 255)
          pixels[idx + 3] = 255
        }
      }
    }
  }

  const texture = new DataTexture(pixels, textureSize, textureSize, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true

  return texture
}

/**
 * Create an array of heatmap textures for 3D volumetric rendering
 * Returns one texture per vertical level
 */
export function createHeatmapTexture3D(
  gridData: GridData3D,
  colorScheme: string = 'jet',
  upscaleFactor: number = 4,
): DataTexture[] {
  const { values, min, max, verticalLevels, heightOffsets } = gridData
  const gridSize = values[0]?.length ?? 0
  const colorMapFn = (colorMaps[colorScheme] ?? colorMaps.jet)!

  const textures: DataTexture[] = []

  for (let k = 0; k < verticalLevels; k++) {
    const levelData = values[k]
    if (!levelData) continue

    const textureSize = gridSize * upscaleFactor
    const pixels = new Uint8Array(textureSize * textureSize * 4)

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const value = levelData[y]?.[x] ?? min
        const color = colorMapFn(value, min, max)

        // Upscale each grid cell
        for (let dy = 0; dy < upscaleFactor; dy++) {
          for (let dx = 0; dx < upscaleFactor; dx++) {
            const px = x * upscaleFactor + dx
            const py = textureSize - 1 - y * upscaleFactor - dy // Flip Y
            const idx = (py * textureSize + px) * 4

            pixels[idx + 0] = Math.round(color.r * 255)
            pixels[idx + 1] = Math.round(color.g * 255)
            pixels[idx + 2] = Math.round(color.b * 255)
            pixels[idx + 3] = 255
          }
        }
      }
    }

    const texture = new DataTexture(pixels, textureSize, textureSize, RGBAFormat)
    texture.magFilter = NearestFilter
    texture.minFilter = NearestFilter
    texture.needsUpdate = true
    textures.push(texture)
  }

  return textures
}

/**
 * Create a single slice texture from 3D grid data at a specific height level
 */
export function createHeatmapTextureFromSlice(
  gridData: GridData3D,
  sliceIndex: number,
  colorScheme: string = 'jet',
  upscaleFactor: number = 4,
): DataTexture {
  const { values, min, max } = gridData
  const gridSize = values[0]?.length ?? 0
  const colorMapFn = (colorMaps[colorScheme] ?? colorMaps.jet)!

  const sliceData = values[sliceIndex]
  if (!sliceData) {
    // Return empty texture if slice out of bounds
    return createHeatmapTexture({ values: [], min, max }, colorScheme)
  }

  const textureSize = gridSize * upscaleFactor
  const pixels = new Uint8Array(textureSize * textureSize * 4)

  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const value = sliceData[y]?.[x] ?? min
      const color = colorMapFn(value, min, max)

      for (let dy = 0; dy < upscaleFactor; dy++) {
        for (let dx = 0; dx < upscaleFactor; dx++) {
          const px = x * upscaleFactor + dx
          const py = textureSize - 1 - y * upscaleFactor - dy
          const idx = (py * textureSize + px) * 4

          pixels[idx + 0] = Math.round(color.r * 255)
          pixels[idx + 1] = Math.round(color.g * 255)
          pixels[idx + 2] = Math.round(color.b * 255)
          pixels[idx + 3] = 255
        }
      }
    }
  }

  const texture = new DataTexture(pixels, textureSize, textureSize, RGBAFormat)
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.needsUpdate = true

  return texture
}
