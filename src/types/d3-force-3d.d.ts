declare module 'd3-force-3d' {
  export interface RadialForce {
    (alpha: number): void;
    initialize(nodes: any[], ...args: any[]): void;
    strength(s: number | ((node: any) => number)): RadialForce;
    radius(r: number | ((node: any) => number)): RadialForce;
    x(x: number): RadialForce;
    y(y: number): RadialForce;
    z(z: number): RadialForce;
  }
  export function forceRadial(radius: number | ((node: any) => number), x?: number, y?: number, z?: number): RadialForce;
}
