import { MindMapEditor } from "@/components/mindmap";

export default function Home() {
  return (
    <MindMapEditor
      persistence={{
        documentKey: "kanx-mindmap.document.v1",
        paletteKey: "kanx-mindmap.palette.v1",
      }}
    />
  );
}
