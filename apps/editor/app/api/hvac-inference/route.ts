import { type NextRequest, NextResponse } from 'next/server'

const BACKEND_URL =
  process.env.HVAC_INFERENCE_URL || 'http://localhost:8000'

/**
 * POST /api/hvac-inference
 *
 * Proxies JSON requests to the FastAPI backend at HVAC_INFERENCE_URL.
 *
 * Supports two request modes:
 *
 * 1. GINOT Neural Operator mode:
 *    - Request: { load, pc, xyt, metadata? }
 *    - Response: { positions, velocities, pressure, speed, bounds }
 *
 * 2. Legacy 12-feature surrogate model mode:
 *    - Request: { features: number[12], gridSize?, verticalLevels? }
 *    - Response: { temperatureGrid, velocityGrid, temperatureGrid3D, ... }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const upstreamResponse = await fetch(
      `${BACKEND_URL}/api/hvac-inference`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: request.signal,
      },
    )

    const contentType =
      upstreamResponse.headers.get('content-type') ?? 'application/json'

    if (contentType.includes('application/json')) {
      const data = await upstreamResponse
        .json()
        .catch(async () => ({
          detail:
            (await upstreamResponse.text()) || 'Inference request failed',
        }))
      return NextResponse.json(data, { status: upstreamResponse.status })
    }

    return new Response(await upstreamResponse.arrayBuffer(), {
      status: upstreamResponse.status,
      headers: { 'content-type': contentType },
    })
  } catch (error) {
    console.error('HVAC inference proxy error:', error)
    return NextResponse.json(
      { detail: 'Failed to contact the HVAC inference backend' },
      { status: 502 },
    )
  }
}
