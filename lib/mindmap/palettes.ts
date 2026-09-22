export type MapPalette = {
  id: string;
  name: string;
  description: string;
  root: string;
  canvas: string;
  dots: string;
  branches: string[];
};
export type MindMapPalette = MapPalette;

export const palettes: MapPalette[] = [
  {
    id: "rainbow-classic",
    name: "经典彩虹",
    description: "明艳六色 · 经典醒目",
    root: "#334155",
    canvas: "#ffffff",
    dots: "#e5e7eb",
    branches: [
      "#dc3f45",
      "#e97824",
      "#c99a00",
      "#26945c",
      "#347fc4",
      "#8756ad",
    ],
  },
  {
    id: "garden",
    name: "林间微光",
    description: "鼠尾草绿 · 温柔自然",
    root: "#426b5d",
    canvas: "#f8f9f6",
    dots: "#dedfdc",
    branches: [
      "#d69532",
      "#4b9a89",
      "#7484cb",
      "#cb8195",
      "#8a9b54",
      "#b77953",
    ],
  },
  {
    id: "ocean",
    name: "海岸来信",
    description: "深海蓝 · 清爽明亮",
    root: "#285975",
    canvas: "#f4f8fb",
    dots: "#d7e2ea",
    branches: [
      "#328aa6",
      "#df9862",
      "#6385c4",
      "#51a492",
      "#b27ca9",
      "#aa9b4a",
    ],
  },
  {
    id: "sunset",
    name: "落日陶土",
    description: "赭石橙 · 温暖复古",
    root: "#914f3d",
    canvas: "#fcf7f2",
    dots: "#eaded4",
    branches: [
      "#cf7955",
      "#bf9a45",
      "#79916b",
      "#b77489",
      "#6a8f9e",
      "#9580b1",
    ],
  },
  {
    id: "iris",
    name: "鸢尾诗集",
    description: "雾感紫 · 安静优雅",
    root: "#625183",
    canvas: "#f8f6fc",
    dots: "#e3dced",
    branches: [
      "#9580bf",
      "#ca819f",
      "#649e9c",
      "#c49a52",
      "#6f8fc0",
      "#aa876d",
    ],
  },
  {
    id: "nordic",
    name: "北欧晨雾",
    description: "石板蓝 · 克制质感",
    root: "#465a68",
    canvas: "#f5f7f8",
    dots: "#dce1e5",
    branches: [
      "#718da3",
      "#829b87",
      "#b6936a",
      "#a97f83",
      "#8d83a6",
      "#569c9b",
    ],
  },
  {
    id: "sorbet",
    name: "夏日果漾",
    description: "莓果粉 · 轻快鲜活",
    root: "#a4476c",
    canvas: "#fff7fa",
    dots: "#eedde5",
    branches: [
      "#d36387",
      "#dc9a35",
      "#45a398",
      "#8c7ac4",
      "#609bc3",
      "#bc865a",
    ],
  },
  {
    id: "ink",
    name: "东方墨韵",
    description: "黛青色 · 雅致沉静",
    root: "#344f51",
    canvas: "#f7f7f2",
    dots: "#dedfd4",
    branches: [
      "#578b88",
      "#bc654f",
      "#b09a50",
      "#7788a4",
      "#927697",
      "#82965e",
    ],
  },
  {
    id: "atelier",
    name: "晴空拾光",
    description: "群青蓝 · 大胆有序",
    root: "#354f99",
    canvas: "#f7f8fc",
    dots: "#dce0ef",
    branches: [
      "#4d75cc",
      "#df785b",
      "#c5a032",
      "#3e9e88",
      "#aa6cac",
      "#6c91a3",
    ],
  },
];

export const PALETTE_STORAGE = "kanx-mindmap.palette.v1";
