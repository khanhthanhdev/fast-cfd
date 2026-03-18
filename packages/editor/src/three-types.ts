// R3F JSX type augmentations for the editor package.
// The @react-three/fiber module augments react's JSX.IntrinsicElements
// with Three.js element types (mesh, group, etc.).
// This file additionally augments ThreeElements with three/webgpu exports.
import { extend, type ThreeToJSXElements } from '@react-three/fiber'
import * as THREE from 'three/webgpu'

declare module '@react-three/fiber' {
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}

extend(THREE as any)

// R3F v9 commitUpdate validates `threeLine` → `ThreeLine` without stripping
// the `three` prefix (unlike createInstance). Register the prefixed key so
// updates don't throw "ThreeLine is not part of the THREE namespace".
extend({ ThreeLine: THREE.Line })
