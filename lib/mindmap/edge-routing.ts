import { MINDMAP_LAYER_GAP } from "./layout";

export const EDGE_CORRIDOR_CLEARANCE = 16;
export const EDGE_TARGET_LEAD = 24;

type EdgeCoordinates = {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

export type MindMapEdgeRoute = {
  path: string;
  kind: "straight" | "corridor";
};

/**
 * Routes vertical movement through the node-free gap between adjacent layers.
 * Returns null for transient drag geometries that no longer satisfy the
 * left-to-right layout invariant.
 */
export function getMindMapEdgeRoute({
  sourceX,
  sourceY,
  targetX,
  targetY,
}: EdgeCoordinates): MindMapEdgeRoute | null {
  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) return null;

  const corridorStartX = targetX - MINDMAP_LAYER_GAP + EDGE_CORRIDOR_CLEARANCE;
  if (sourceX > targetX - MINDMAP_LAYER_GAP) return null;

  if (sourceY === targetY)
    return {
      path: `M ${sourceX} ${sourceY} H ${targetX}`,
      kind: "straight",
    };

  const approachX = targetX - EDGE_TARGET_LEAD;
  if (corridorStartX >= approachX) return null;

  const controlInset = Math.min(12, (approachX - corridorStartX) / 2);
  return {
    path: [
      `M ${sourceX} ${sourceY}`,
      `H ${corridorStartX}`,
      `C ${corridorStartX + controlInset} ${sourceY}`,
      `${approachX - controlInset} ${targetY}`,
      `${approachX} ${targetY}`,
      `H ${targetX}`,
    ].join(" "),
    kind: "corridor",
  };
}
