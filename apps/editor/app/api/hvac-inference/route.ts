import { type NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/hvac-inference
 * AI inference endpoint for HVAC CFD prediction
 *
 * As per PRD NFR-001: Response time < 10 seconds
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { features, gridSize, verticalLevels } = body

    // Validate input
    if (!Array.isArray(features) || features.length !== 12) {
      return NextResponse.json(
        { error: 'Invalid feature vector. Expected 12 features.' },
        { status: 400 },
      )
    }

    // TODO: Call actual AI model service
    // For MVP, return mock data based on input parameters
    const mockResponse = generateMockCFDData3D(
      features,
      gridSize || 20,
      verticalLevels || 10,
    )

    return NextResponse.json({
      ...mockResponse,
      inferenceId: crypto.randomUUID(),
      timestamp: Date.now(),
    })
  } catch (error) {
    console.error('HVAC inference error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

/**
 * Generate 3D mock CFD data with vertical stratification
 * Returns volumetric grids for temperature and velocity
 */
function generateMockCFDData3D(
  features: number[],
  gridSize: number,
  verticalLevels: number,
): {
  temperatureGrid: number[][]
  velocityGrid: number[][]
  temperatureGrid3D: number[][][]
  velocityGrid3D: number[][][]
  velocityGrid3DDirection: { x: number; y: number; z: number }[][][]
  averageTemperature: number
  pmv: number
  comfortScore: number
  verticalLevels: number
  heightOffsets: number[]
} {
  const [
    length = 5,
    width = 5,
    roomHeight = 2.8,
    ,
    ,
    supplyTemp = 20,
    airflowRate,
    ,
    outdoorTemp = 25,
    diffuserX = 0,
    diffuserY,
    diffuserZ = 0,
  ] = features

  // Generate 2D grid (legacy support)
  const temperatureGrid: number[][] = []
  const velocityGrid: number[][] = []

  const centerTemp: number = supplyTemp
  const edgeTemp: number = outdoorTemp

  for (let i = 0; i < gridSize; i++) {
    temperatureGrid[i] = []
    velocityGrid[i] = []

    for (let j = 0; j < gridSize; j++) {
      const di = Math.abs(i - gridSize / 2) / (gridSize / 2)
      const dj = Math.abs(j - gridSize / 2) / (gridSize / 2)
      const dist = Math.sqrt(di * di + dj * dj)

      const temp = centerTemp + (edgeTemp - centerTemp) * dist * 0.3
      temperatureGrid[i]![j] = parseFloat(temp.toFixed(2))

      const velocity = 1.5 * Math.exp(-2 * dist * dist)
      velocityGrid[i]![j] = parseFloat(velocity.toFixed(3))
    }
  }

  // Generate 3D volumetric grids [z][y][x]
  const temperatureGrid3D: number[][][] = []
  const velocityGrid3D: number[][][] = []
  const velocityGrid3DDirection: { x: number; y: number; z: number }[][][] = []

  // Height offsets for each vertical level (normalized 0-1, then scaled to room height)
  const heightOffsets: number[] = []
  for (let k = 0; k < verticalLevels; k++) {
    // Non-uniform sampling: more resolution near floor and ceiling
    const t = k / (verticalLevels - 1)
    const normalizedHeight = t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)
    heightOffsets.push(parseFloat(normalizedHeight.toFixed(3)))
  }

  // Calculate diffuser position in grid coordinates
  const diffuserGridX = Math.floor((diffuserX + length / 2) / length * gridSize)
  const diffuserGridZ = Math.floor((diffuserZ + width / 2) / width * gridSize)

  for (let k = 0; k < verticalLevels; k++) {
    temperatureGrid3D[k] = []
    velocityGrid3D[k] = []
    velocityGrid3DDirection[k] = []

    const normalizedHeight: number = heightOffsets[k]!
    const actualHeight = normalizedHeight * roomHeight

    // Temperature stratification: warmer at ceiling, cooler at floor
    const stratificationFactor = normalizedHeight * 0.15 // 0.15°C difference floor to ceiling

    for (let i = 0; i < gridSize; i++) {
      temperatureGrid3D[k]![i] = []
      velocityGrid3D[k]![i] = []
      velocityGrid3DDirection[k]![i] = []

      for (let j = 0; j < gridSize; j++) {
        // Horizontal distance from diffuser
        const di = Math.abs(i - diffuserGridX) / (gridSize / 2)
        const dj = Math.abs(j - diffuserGridZ) / (gridSize / 2)
        const horizontalDist = Math.sqrt(di * di + dj * dj)

        // Vertical distance from diffuser height (ceiling)
        const diffuserNormalizedHeight = 1.0 // Diffuser at ceiling
        const verticalDist = Math.abs(normalizedHeight - diffuserNormalizedHeight)

        // 3D distance from diffuser
        const dist3D = Math.sqrt(horizontalDist * horizontalDist + verticalDist * verticalDist * 0.5)

        // Temperature with 3D stratification
        const baseTemp = centerTemp + (edgeTemp - centerTemp) * horizontalDist * 0.2
        const tempWithStrat = baseTemp + stratificationFactor * normalizedHeight
        const tempWithJetDecay = tempWithStrat - (1 - verticalDist) * 0.5 // Cooler near diffuser
        temperatureGrid3D[k]![i]![j] = parseFloat(tempWithJetDecay.toFixed(2))

        // Velocity magnitude decreasing with distance from diffuser
        const velocityDecay = Math.exp(-2 * dist3D * dist3D)
        const velocityMagnitude = 1.5 * velocityDecay * (1 - normalizedHeight * 0.3)
        velocityGrid3D[k]![i]![j] = parseFloat(velocityMagnitude.toFixed(3))

        // Velocity direction (airflow from diffuser spreading outward and downward)
        const dirX = (i - diffuserGridX) / (gridSize / 2) * 0.5
        const dirZ = (j - diffuserGridZ) / (gridSize / 2) * 0.5
        const dirY = -normalizedHeight * 0.3 // Downward flow
        const mag = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ) || 1
        velocityGrid3DDirection[k]![i]![j] = {
          x: parseFloat((dirX / mag).toFixed(3)),
          y: parseFloat((dirY / mag).toFixed(3)),
          z: parseFloat((dirZ / mag).toFixed(3)),
        }
      }
    }
  }

  // Calculate average temperature from 3D grid
  const allTemps3D = temperatureGrid3D.flat(2)
  const averageTemperature = allTemps3D.reduce((a, b) => a + b, 0) / allTemps3D.length

  return {
    temperatureGrid,
    velocityGrid,
    temperatureGrid3D,
    velocityGrid3D,
    velocityGrid3DDirection,
    averageTemperature: parseFloat(averageTemperature.toFixed(2)),
    pmv: 0.5,
    comfortScore: 0.85,
    verticalLevels,
    heightOffsets,
  }
}
