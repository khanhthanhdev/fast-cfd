import dedent from 'dedent'
import { z } from 'zod'
import { BaseNode, nodeType, objectId } from '../base'

export const ZoneNode = BaseNode.extend({
  id: objectId('zone'),
  type: nodeType('zone'),
  name: z.string(),
  // Polygon boundary - array of [x, z] coordinates defining the zone
  polygon: z.array(z.tuple([z.number(), z.number()])),
  // Visual styling
  color: z.string().default('#3b82f6'), // Default blue
  metadata: z.json().optional().default({}),
}).describe(
  dedent`
  Zone schema - a polygon zone attached to a level
  - object: "zone"
  - id: zone id
  - levelId: level this zone is attached to
  - name: zone name
  - polygon: array of [x, z] points defining the zone boundary
  - color: hex color for visual styling
  - metadata: zone metadata (optional)
  `,
)

export type ZoneNode = z.infer<typeof ZoneNode>

/**
 * Creates a ZoneNode from a detected Space
 * @param space - The detected space from space detection
 * @param name - Name for the zone (e.g., "Room 1", "Bedroom")
 * @param levelId - The level ID this zone belongs to
 * @returns Partial<ZoneNode> ready to be passed to createNode()
 */
export function createZoneFromSpace(
  space: { polygon: Array<[number, number]>; id: string },
  name: string,
): Partial<ZoneNode> {
  return {
    type: 'zone',
    name,
    polygon: space.polygon,
    color: '#3b82f6', // Default blue
    metadata: {
      createdFrom: 'space-detection',
      sourceSpaceId: space.id,
    },
  }
}
