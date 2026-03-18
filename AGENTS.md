# AGENTS.md — Pascal Editor (fast-cfd)

## Commands
- **Dev:** `bun dev` (root — builds packages then starts Next.js on port 3002 with watchers)
- **Build:** `turbo build` | single pkg: `turbo build --filter=@pascal-app/core`
- **Lint:** `biome lint` | fix: `biome lint --write` | format: `biome format --write`
- **Type-check:** `turbo run check-types`

## Architecture
Turborepo monorepo. Apps: `apps/editor` (Next.js 16). Packages: `packages/core` (schemas, Zustand scene store, systems), `packages/viewer` (R3F renderers, camera, post-processing), `packages/editor` (editor components/tools), `packages/ui` (shared UI). State: three Zustand stores — `useScene` (core), `useViewer` (viewer), `useEditor` (editor). Nodes stored in flat dict; systems run in `useFrame` loop processing dirty nodes via `sceneRegistry`. Event bus uses mitt. Stack: React 19, Three.js/WebGPU, React Three Fiber, Drei, Zod, Zundo, three-bvh-csg, Bun.

## Code Style (Biome)
- 2-space indent, 100-char line width, single quotes, no semicolons, trailing commas
- JSX uses double quotes. Imports auto-organized by Biome.
- TypeScript strict. Schemas use Zod. Node IDs prefixed by type (e.g. `wall_abc123`).
- Access store outside React: `useScene.getState()`. In components: `useScene((s) => s.nodes)`.

## Key Conventions
- Cursor rules in `.cursor/rules/*.mdc` cover node schemas, renderers, systems, tools, events, layers, selection managers, spatial queries, scene registry, viewer isolation.
- Claude/agent rules in `.claude/rules/` cover primary workflow, dev rules, orchestration, docs.
- YAGNI/KISS/DRY. Always run `bun dev` from root. Never mutate 3D objects directly — go through store + dirty-node system pipeline.
