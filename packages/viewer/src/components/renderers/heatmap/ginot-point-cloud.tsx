import type { HeatmapNode } from '@pascal-app/core'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, PointsMaterial } from 'three'
import { colorMaps } from '../../../lib/color-maps'

interface GinotPointCloudProps {
  node: HeatmapNode
  metric: 'speed' | 'pressure'
  pointSize: number
  opacity: number
}

function getMetricValues(node: HeatmapNode, metric: 'speed' | 'pressure') {
  if (metric === 'pressure') {
    return node.data.pressureField
  }
  return node.data.speedField
}

function getBounds(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 1 }
  }

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!
    if (v < min) min = v
    if (v > max) max = v
  }

  if (min === max) {
    return { min, max: min + 1 }
  }

  return { min, max }
}

export const GinotPointCloud = ({
  node,
  metric,
  pointSize,
  opacity,
}: GinotPointCloudProps) => {
  const pointCloud = node.data.ginotPointCloud ?? []

  const metricValues = useMemo(() => {
    const fieldValues = getMetricValues(node, metric)
    if (fieldValues && fieldValues.length === pointCloud.length) {
      return fieldValues
    }

    return pointCloud.map((point) => (metric === 'pressure' ? point.pressure : point.speed))
  }, [metric, node, pointCloud])

  const geometry = useMemo(() => {
    if (pointCloud.length === 0) return null

    const positions = new Float32Array(pointCloud.length * 3)
    const colors = new Float32Array(pointCloud.length * 3)
    const { min, max } = getBounds(metricValues)
    const colorMap = (colorMaps[node.colorScheme] ?? colorMaps.jet)!

    for (let index = 0; index < pointCloud.length; index++) {
      const point = pointCloud[index]!
      const color = colorMap(metricValues[index] ?? 0, min, max)
      const baseIndex = index * 3

      positions[baseIndex] = point.position[0]
      positions[baseIndex + 1] = point.position[1]
      positions[baseIndex + 2] = point.position[2]

      colors[baseIndex] = color.r
      colors[baseIndex + 1] = color.g
      colors[baseIndex + 2] = color.b
    }

    const nextGeometry = new BufferGeometry()
    nextGeometry.setAttribute('position', new BufferAttribute(positions, 3))
    nextGeometry.setAttribute('color', new BufferAttribute(colors, 3))
    nextGeometry.computeBoundingSphere()

    return nextGeometry
  }, [metricValues, node.colorScheme, pointCloud])

  const material = useMemo(() => {
    if (!geometry) return null

    return new PointsMaterial({
      size: pointSize,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: true,
      vertexColors: true,
      sizeAttenuation: true,
    })
  }, [geometry, opacity, pointSize])

  useEffect(() => {
    return () => {
      geometry?.dispose()
    }
  }, [geometry])

  useEffect(() => {
    return () => {
      material?.dispose()
    }
  }, [material])

  if (!(geometry && material)) {
    return null
  }

  return <points geometry={geometry} material={material} renderOrder={3} />
}
