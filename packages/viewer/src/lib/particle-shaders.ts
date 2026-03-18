/**
 * Vertex shader for particle system
 * Handles position transformation and point size attenuation
 */
export const particleVertexShader = `
  uniform float pointSize;
  uniform float time;

  attribute vec3 color;
  attribute float lifetime;

  varying vec3 vColor;
  varying float vLifetime;

  void main() {
    vColor = color;
    vLifetime = lifetime;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`

/**
 * Fragment shader for particle rendering
 * Renders circular particles with lifetime-based fade
 */
export const particleFragmentShader = `
  varying vec3 vColor;
  varying float vLifetime;

  void main() {
    // Circular particle shape
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);

    // Discard pixels outside circle
    if (dist > 0.5) discard;

    // Soft edge falloff
    float edgeSmooth = 0.5 - smoothstep(0.4, 0.5, dist);

    // Fade based on lifetime
    float alpha = smoothstep(0.0, 0.3, vLifetime) * edgeSmooth;

    gl_FragColor = vec4(vColor, alpha);
  }
`

/**
 * Create shader material uniforms
 */
export function createParticleUniforms(
  pointSize: number = 0.05,
  time: number = 0,
) {
  return {
    pointSize: { value: pointSize },
    time: { value: time },
  }
}
