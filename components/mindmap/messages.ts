export type MindMapLocale = "zh-CN" | "en";

export type MindMapMessages = {
  defaultTitle: string;
  palette: string;
  importJson: string;
  exportJson: string;
  canvasLabel: string;
  loading: string;
  layoutError: string;
  storageReadError: string;
  storageWriteError: string;
  paletteStorageError: string;
  dragChild: string;
  dragSibling: string;
  dragHint: string;
  shortcuts: string;
  closeHelp: string;
  closeToast: string;
  palettePanel: string;
  closePalette: string;
  topics: (count: number) => string;
  addChild: string;
  addSibling: string;
  expand: string;
  collapse: string;
  remove: string;
  undo: string;
  redo: string;
  autoLayout: string;
  zoomOut: string;
  resetZoom: string;
  zoomIn: string;
  fitView: string;
  topicText: string;
  imageTopic: string;
  helpRows: Array<[string, string]>;
};

export const mindMapMessages: Record<MindMapLocale, MindMapMessages> = {
  "zh-CN": {
    defaultTitle: "我的思维导图",
    palette: "配色",
    importJson: "导入 JSON",
    exportJson: "导出 JSON",
    canvasLabel: "思维导图画布",
    loading: "正在整理你的思路…",
    layoutError: "布局失败，请点击自动布局重试。",
    storageReadError: "无法读取已保存的导图，已打开默认导图。",
    storageWriteError: "本地保存失败，请通过 onChange 备份数据。",
    paletteStorageError: "配色已应用，但无法保存到本地。",
    dragChild: "松开以添加为子主题",
    dragSibling: "松开以调整主题顺序",
    dragHint: "拖至主题中心或上下边缘；空白处释放取消",
    shortcuts: "快捷键",
    closeHelp: "关闭帮助",
    closeToast: "关闭提示",
    palettePanel: "配方方案",
    closePalette: "收起配色",
    topics: (count) => `${count} 个主题`,
    addChild: "新增子主题",
    addSibling: "新增同级主题",
    expand: "展开",
    collapse: "折叠",
    remove: "删除",
    undo: "撤销",
    redo: "重做",
    autoLayout: "自动布局",
    zoomOut: "缩小",
    resetZoom: "重置缩放",
    zoomIn: "放大",
    fitView: "适应画布",
    topicText: "主题文本",
    imageTopic: "图片主题",
    helpRows: [
      ["Ctrl / ⌘ + 点击", "添加或取消选择主题"],
      ["Shift + 点击", "连续选择同级主题"],
      ["Delete / Backspace", "删除选中主题"],
      ["Tab", "新增子主题"],
      ["Enter", "新增同级主题"],
      ["Ctrl / ⌘ + V", "将剪贴板图片粘贴为子主题"],
      ["直接输入", "替换选中主题文本"],
      ["双击 / F2", "编辑主题"],
      ["Shift + Enter", "编辑时换行"],
      ["方向键", "在主题间移动"],
      ["⌘ / Ctrl + S", "保存脑图"],
      ["⌘ / Ctrl + Z", "撤销"],
      ["⌘ / Ctrl + Shift + Z", "重做"],
      ["滚轮 / 拖动画布", "平移"],
      ["触控板捏合", "缩放"],
    ],
  },
  en: {
    defaultTitle: "My mind map",
    palette: "Palette",
    importJson: "Import JSON",
    exportJson: "Export JSON",
    canvasLabel: "Mind map canvas",
    loading: "Arranging your ideas…",
    layoutError: "Layout failed. Run auto layout to try again.",
    storageReadError: "The saved mind map could not be read. The default map is open.",
    storageWriteError: "Local save failed. Back up the data through onChange.",
    paletteStorageError: "The palette was applied but could not be saved locally.",
    dragChild: "Release to add as a child topic",
    dragSibling: "Release to reorder the topic",
    dragHint: "Drag to a topic center or edge; release on empty space to cancel",
    shortcuts: "Shortcuts",
    closeHelp: "Close help",
    closeToast: "Close notification",
    palettePanel: "Color palettes",
    closePalette: "Close palettes",
    topics: (count) => `${count} ${count === 1 ? "topic" : "topics"}`,
    addChild: "Add child topic",
    addSibling: "Add sibling topic",
    expand: "Expand",
    collapse: "Collapse",
    remove: "Delete",
    undo: "Undo",
    redo: "Redo",
    autoLayout: "Auto layout",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
    zoomIn: "Zoom in",
    fitView: "Fit view",
    topicText: "Topic text",
    imageTopic: "Image topic",
    helpRows: [
      ["Ctrl / ⌘ + click", "Add or remove a topic from the selection"],
      ["Shift + click", "Select a range of sibling topics"],
      ["Delete / Backspace", "Delete selected topics"],
      ["Tab", "Add a child topic"],
      ["Enter", "Add a sibling topic"],
      ["Ctrl / ⌘ + V", "Paste a clipboard image as a child topic"],
      ["Type", "Replace the selected topic text"],
      ["Double click / F2", "Edit a topic"],
      ["Shift + Enter", "Insert a line break"],
      ["Arrow keys", "Move between topics"],
      ["⌘ / Ctrl + S", "Save the mind map"],
      ["⌘ / Ctrl + Z", "Undo"],
      ["⌘ / Ctrl + Shift + Z", "Redo"],
      ["Wheel / drag canvas", "Pan"],
      ["Trackpad pinch", "Zoom"],
    ],
  },
};

export function resolveMessages(
  locale: MindMapLocale = "zh-CN",
  overrides?: Partial<MindMapMessages>,
): MindMapMessages {
  return { ...mindMapMessages[locale], ...overrides };
}
