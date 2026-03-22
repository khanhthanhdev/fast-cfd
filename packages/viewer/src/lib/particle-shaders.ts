import { attribute, float, Fn, length, smoothstep, step, sub, uniform, uv, vec2 } from 'three/tsl'
import { AdditiveBlending, PointsNodeMaterial } from 'three/webgpu'

export interface ParticleNodeMaterial extends PointsNodeMaterial {
  uniforms: {
    pointSize: { value: number }
    opacity: { value: number }
  }
}

/**
 * Create a TSL-based PointsNodeMaterial for particle rendering.
 *
 * Replicates the legacy GLSL shader behaviour:
 * - Circular particle with smooth falloff + core glow
 * - Lifetime-based fade in / fade out
 * - Configurable point size and opacity
 */
export function createParticleNodeMaterial(
  pointSize: number = 0.05,
  opacity: number = 0.8,
): ParticleNodeMaterial {
  const uPointSize = uniform(float(pointSize))
  const uOpacity = uniform(float(opacity))
  const colorAttr = attribute<'vec3'>('color', 'vec3')
  const lifetimeAttr = attribute<'float'>('lifetime', 'float')

  // Fragment: circular falloff + core glow + lifetime fade
  const particleOpacity = Fn(() => {
    const center = sub(uv(), vec2(0.5, 0.5))
    const dist = length(center)

    // Circle mask: 1 inside radius 0.5, 0 outside
    const circleMask = float(1).sub(step(float(0.5), dist))

    const falloff = sub(float(1), smoothstep(float(0.08), float(0.5), dist))
    const core = smoothstep(float(0), float(0.25), sub(float(0.5), dist))
    const lifetimeFade = smoothstep(float(0), float(0.08), lifetimeAttr).mul(
      smoothstep(float(0), float(0.08), float(1).sub(lifetimeAttr)),
    )

    return falloff
      .mul(0.55)
      .add(core.mul(0.45))
      .mul(lifetimeFade)
      .mul(uOpacity)
      .mul(circleMask)
  })

  const mat = new PointsNodeMaterial({
    colorNode: colorAttr,
    opacityNode: particleOpacity(),
    sizeNode: uPointSize,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })

  // Expose uniforms for runtime updates
  const uniforms = {
    pointSize: {
      get value() { return uPointSize.value as number },
      set value(v: number) { uPointSize.value = v },
    },
    opacity: {
      get value() { return uOpacity.value as number },
      set value(v: number) { uOpacity.value = v },
    },
  }
  ;(mat as ParticleNodeMaterial).uniforms = uniforms

  return mat as ParticleNodeMaterial
}

/**
 * Create particle uniform defaults (kept for API compat).
 */
export function createParticleUniforms(
  pointSize: number = 0.05,
  opacity: number = 0.8,
) {
  return {
    pointSize: { value: pointSize },
    opacity: { value: opacity },
  }
}
