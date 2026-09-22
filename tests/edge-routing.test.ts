import { describe, expect, it } from "vitest";
import {
  EDGE_CORRIDOR_CLEARANCE,
  EDGE_TARGET_LEAD,
  getMindMapEdgeRoute,
} from "../lib/mindmap/edge-routing";
import {
  ElkMindMapLayout,
  MINDMAP_LAYER_GAP,
  type Size,
} from "../lib/mindmap/layout";
import type { Tree } from "../lib/mindmap/model";

function routePoints(path: string) {
  const values = path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (values.length === 3) {
    const [sourceX, sourceY, targetX] = values;
    return Array.from({ length: 101 }, (_, index) => ({
      x: sourceX + ((targetX - sourceX) * index) / 100,
      y: sourceY,
    }));
  }
  const [
    sourceX,
    sourceY,
    corridorX,
    control1X,
    ,
    control2X,
    targetY,
    approachX,
    ,
    targetX,
  ] = values;
  const points = [];
  for (let index = 0; index <= 25; index++)
    points.push({
      x: sourceX + ((corridorX - sourceX) * index) / 25,
      y: sourceY,
    });
  for (let index = 1; index <= 100; index++) {
    const t = index / 100,
      inverse = 1 - t;
    points.push({
      x:
        inverse ** 3 * corridorX +
        3 * inverse ** 2 * t * control1X +
        3 * inverse * t ** 2 * control2X +
        t ** 3 * approachX,
      y:
        inverse ** 3 * sourceY +
        3 * inverse ** 2 * t * sourceY +
        3 * inverse * t ** 2 * targetY +
        t ** 3 * targetY,
    });
  }
  for (let index = 1; index <= 25; index++)
    points.push({
      x: approachX + ((targetX - approachX) * index) / 25,
      y: targetY,
    });
  return points;
}

describe("XMind-style edge routing", () => {
  it("moves downward entirely inside the inter-layer corridor", () => {
    const route = getMindMapEdgeRoute({
      sourceX: 124,
      sourceY: 20,
      targetX: 200,
      targetY: 120,
    });

    expect(route).toEqual({
      kind: "corridor",
      path: "M 124 20 H 140 C 152 20 164 120 176 120 H 200",
    });
    expect(140).toBe(200 - MINDMAP_LAYER_GAP + EDGE_CORRIDOR_CLEARANCE);
    expect(176).toBe(200 - EDGE_TARGET_LEAD);
  });

  it("uses the same safe x corridor when moving upward", () => {
    expect(
      getMindMapEdgeRoute({
        sourceX: 80,
        sourceY: 160,
        targetX: 200,
        targetY: 20,
      }),
    ).toEqual({
      kind: "corridor",
      path: "M 80 160 H 140 C 152 160 164 20 176 20 H 200",
    });
  });

  it("reduces aligned topics to a horizontal line", () => {
    expect(
      getMindMapEdgeRoute({
        sourceX: 100,
        sourceY: 40,
        targetX: 220,
        targetY: 40,
      }),
    ).toEqual({ kind: "straight", path: "M 100 40 H 220" });
  });

  it("lets transient short or reversed drag geometries use the fallback", () => {
    for (const coordinates of [
      { sourceX: 150, sourceY: 20, targetX: 200, targetY: 100 },
      { sourceX: 220, sourceY: 20, targetX: 200, targetY: 100 },
      { sourceX: Number.NaN, sourceY: 20, targetX: 200, targetY: 100 },
    ])
      expect(getMindMapEdgeRoute(coordinates)).toBeNull();
  });

  it("does not cross a wide sibling in the screenshot-shaped regression tree", async () => {
    const tree: Tree = {
      rootId: "root",
      nodes: {
        root: {
          kind: "text",
          id: "root",
          text: "单个论文画像",
          parentId: null,
          children: ["metadata", "long-topic"],
          collapsed: false,
        },
        metadata: {
          kind: "text",
          id: "metadata",
          text: "文献元数据",
          parentId: "root",
          children: [
            "title",
            "author",
            "journal",
            "date",
            "abstract",
            "keyword",
          ],
          collapsed: false,
        },
        "long-topic": {
          kind: "text",
          id: "long-topic",
          text: "大语言模型下的人机协同知识管理新模式",
          parentId: "root",
          children: [],
          collapsed: false,
        },
        title: {
          kind: "text",
          id: "title",
          text: "标题",
          parentId: "metadata",
          children: [],
          collapsed: false,
        },
        author: {
          kind: "text",
          id: "author",
          text: "作者",
          parentId: "metadata",
          children: [],
          collapsed: false,
        },
        journal: {
          kind: "text",
          id: "journal",
          text: "期刊",
          parentId: "metadata",
          children: [],
          collapsed: false,
        },
        date: {
          kind: "text",
          id: "date",
          text: "发表时间",
          parentId: "metadata",
          children: [],
          collapsed: false,
        },
        abstract: {
          kind: "text",
          id: "abstract",
          text: "摘要",
          parentId: "metadata",
          children: ["detail"],
          collapsed: false,
        },
        keyword: {
          kind: "text",
          id: "keyword",
          text: "关键词",
          parentId: "metadata",
          children: [],
          collapsed: false,
        },
        detail: {
          kind: "text",
          id: "detail",
          text: "分点提炼",
          parentId: "abstract",
          children: ["entity", "description"],
          collapsed: false,
        },
        entity: {
          kind: "text",
          id: "entity",
          text: "实体",
          parentId: "detail",
          children: [],
          collapsed: false,
        },
        description: {
          kind: "text",
          id: "description",
          text: "阐述",
          parentId: "detail",
          children: [],
          collapsed: false,
        },
      },
    };
    const sizes: Record<string, Size> = Object.fromEntries(
      Object.keys(tree.nodes).map((id) => [
        id,
        id === "root"
          ? { width: 265, height: 92 }
          : id === "long-topic"
            ? { width: 310, height: 83 }
            : { width: 125, height: 57 },
      ]),
    );
    const positions = await new ElkMindMapLayout().layout(tree, sizes);

    for (const parent of Object.values(tree.nodes))
      for (const childId of parent.children) {
        const child = tree.nodes[childId],
          route = getMindMapEdgeRoute({
            sourceX: positions[parent.id].x + sizes[parent.id].width,
            sourceY: positions[parent.id].y + sizes[parent.id].height / 2,
            targetX: positions[child.id].x,
            targetY: positions[child.id].y + sizes[child.id].height / 2,
          });
        expect(route).not.toBeNull();
        const obstacles = Object.values(tree.nodes).filter(
          (node) => node.id !== parent.id && node.id !== child.id,
        );
        for (const point of routePoints(route!.path))
          for (const obstacle of obstacles) {
            const position = positions[obstacle.id],
              size = sizes[obstacle.id];
            expect(
              point.x > position.x &&
                point.x < position.x + size.width &&
                point.y > position.y &&
                point.y < position.y + size.height,
              `${parent.id} -> ${child.id} crossed ${obstacle.id}`,
            ).toBe(false);
          }
      }
  });
});
