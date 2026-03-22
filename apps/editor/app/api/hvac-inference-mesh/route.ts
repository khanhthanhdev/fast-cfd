import { type NextRequest, NextResponse } from 'next/server'
import { env } from '@/env.mjs'
import { proxyMeshInferenceRequest } from './proxy'

export async function POST(request: NextRequest) {
  const requestId = request.headers.get('x-request-id')

  try {
    return await proxyMeshInferenceRequest(request, {
      backendUrl: env.HVAC_MESH_INFERENCE_URL,
    })
  } catch (error) {
    console.error('HVAC mesh inference proxy error:', error)

    return NextResponse.json(
      { detail: 'Failed to contact the HVAC mesh backend' },
      {
        status: 502,
        headers: requestId ? { 'x-request-id': requestId } : undefined,
      },
    )
  }
}
