import type { Collection, CollectionId } from '../schema/collections'
import type { AnyNode, AnyNodeId } from '../schema/types'
import { isObject } from '../utils/types'

export type PersistedSceneGraph = {
  nodes: Record<AnyNodeId, AnyNode>
  rootNodeIds: AnyNodeId[]
}

export type PersistedSceneState = PersistedSceneGraph & {
  collections: Record<CollectionId, Collection>
}

function isTransientNode(node: AnyNode): boolean {
  return isObject(node.metadata) && (node.metadata as Record<string, unknown>).isTransient === true
}

function stripVolatileMetadata(node: AnyNode): AnyNode['metadata'] {
  if (!isObject(node.metadata) || !('particleSystem' in node.metadata)) {
    return node.metadata
  }

  const { particleSystem: _particleSystem, ...metadata } = node.metadata
  return metadata
}

function sanitizeNodeForPersistence(node: AnyNode): AnyNode | null {
  if (isTransientNode(node)) {
    return null
  }

  // Heatmap nodes are simulation results — never persist them.
  // Users re-run the AI simulation to regenerate heatmaps.
  if (node.type === 'heatmap') {
    return null
  }

  const metadata = stripVolatileMetadata(node)
  return metadata === node.metadata ? node : { ...node, metadata }
}

export function sanitizeSceneNodesForPersistence(
  nodes: Record<AnyNodeId, AnyNode>,
): Record<AnyNodeId, AnyNode> {
  return Object.fromEntries(
    Object.entries(nodes).flatMap(([id, node]) => {
      const sanitizedNode = sanitizeNodeForPersistence(node)

      return sanitizedNode ? [[id, sanitizedNode]] : []
    }),
  ) as Record<AnyNodeId, AnyNode>
}

export function sanitizeSceneGraphForPersistence(
  sceneGraph: PersistedSceneGraph,
): PersistedSceneGraph {
  const nodes = sanitizeSceneNodesForPersistence(sceneGraph.nodes)
  return {
    ...sceneGraph,
    nodes,
    rootNodeIds: sceneGraph.rootNodeIds.filter((id) => id in nodes),
  }
}

export function sanitizeSceneStateForPersistence(
  sceneState: PersistedSceneState,
): PersistedSceneState {
  return {
    ...sceneState,
    nodes: sanitizeSceneNodesForPersistence(sceneState.nodes),
  }
}
