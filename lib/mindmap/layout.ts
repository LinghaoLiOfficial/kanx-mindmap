import ELK from "elkjs/lib/elk.bundled.js";
import { type Tree, visible } from "./model";
export type Size = { width: number; height: number };
export type Position = { x: number; y: number };
export const MINDMAP_LAYER_GAP = 76;
export interface MindMapLayoutEngine {
  /**
   * Returns derived React Flow positions in a root-centered coordinate space.
   * The visual center of the root topic is always (0, 0).
   */
  layout(
    tree: Tree,
    sizes: Record<string, Size>,
  ): Promise<Record<string, Position>>;
}
const elk = new ELK();
export class ElkMindMapLayout implements MindMapLayoutEngine {
  async layout(tree: Tree, sizes: Record<string, Size>) {
    const nodes = visible(tree),
      ids = new Set(nodes.map((n) => n.id));
    const originalIds = new Map(nodes.map((n) => [`topic:${n.id}`, n.id]));
    let orderY = 0;
    const result = await elk.layout({
      id: "graph",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "24",
        "elk.layered.spacing.nodeNodeBetweenLayers": `${MINDMAP_LAYER_GAP}`,
        // Sort each layer by derived DFS seed positions. ELK's model-order
        // comparator is expensive on wide trees; INTERACTIVE preserves the same
        // canonical sibling order without that expensive comparator.
        "elk.layered.crossingMinimization.strategy": "INTERACTIVE",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.layered.nodePlacement.favorStraightEdges": "false",
      },
      children: nodes.map((n) => {
        const size = sizes[n.id] ?? { width: 180, height: 46 };
        const seed = { id: `topic:${n.id}`, ...size, x: 0, y: orderY };
        orderY += size.height + 24;
        return seed;
      }),
      edges: nodes.flatMap((n) =>
        n.children
          .filter((id) => ids.has(id))
          .map((id) => ({
            id: `edge:${JSON.stringify([n.id, id])}`,
            sources: [`topic:${n.id}`],
            targets: [`topic:${id}`],
          })),
      ),
    });
    const positions: Record<string, Position> = Object.fromEntries(
      result.children!.map((n) => [
        originalIds.get(n.id)!,
        { x: n.x!, y: n.y! },
      ]),
    );
    // ELK determines vertical order/spacing. Horizontal columns follow tree
    // depth so leaves cannot drift toward the root or vary with their width.
    const depths = new Map<string, number>();
    const widths: number[] = [];
    for (const node of nodes) {
      const depth = node.parentId === null ? 0 : depths.get(node.parentId)! + 1;
      depths.set(node.id, depth);
      widths[depth] = Math.max(
        widths[depth] ?? 0,
        sizes[node.id]?.width ?? 180,
      );
    }
    const columns = [positions[tree.rootId].x];
    for (let depth = 1; depth < widths.length; depth++)
      columns[depth] =
        columns[depth - 1] + widths[depth - 1] + MINDMAP_LAYER_GAP;
    for (const node of nodes)
      positions[node.id].x = columns[depths.get(node.id)!];

    // ELK is free to move the whole graph as its bounds change. Translate its
    // result into a stable coordinate space instead: the root topic's visual
    // center is the origin and every other topic is positioned relative to it.
    const rootSize = sizes[tree.rootId] ?? { width: 180, height: 46 };
    const rootCenter = {
      x: positions[tree.rootId].x + rootSize.width / 2,
      y: positions[tree.rootId].y + rootSize.height / 2,
    };
    for (const position of Object.values(positions)) {
      position.x -= rootCenter.x;
      position.y -= rootCenter.y;
    }
    return positions;
  }
}
export class LayoutRequestGuard {
  private version = 0;
  next() {
    return ++this.version;
  }
  isCurrent(version: number) {
    return this.version === version;
  }
}
export const layoutEngine = new ElkMindMapLayout();
