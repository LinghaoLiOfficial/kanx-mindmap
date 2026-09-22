// @vitest-environment jsdom

import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MindMapProvider,
  useMindMap,
  type MindMapChangeDetail,
} from "../components/mindmap";
import { sampleTree, serializeDocument, type Tree } from "../lib/mindmap/model";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

function Probe({ name }: { name: string }) {
  const map = useMindMap();
  return (
    <section aria-label={name}>
      <span>{map.tree.nodes.root.text}</span>
      <span>{map.canUndo ? "undoable" : "clean"}</span>
      <button
        onClick={() =>
          map.execute({ type: "text", id: "root", text: `${name} changed` })
        }
      >
        change
      </button>
    </section>
  );
}

describe("MindMapProvider", () => {
  it("isolates stores for multiple providers", () => {
    render(
      <>
        <MindMapProvider><Probe name="first" /></MindMapProvider>
        <MindMapProvider><Probe name="second" /></MindMapProvider>
      </>,
    );
    fireEvent.click(screen.getByRole("region", { name: "first" }).querySelector("button")!);
    expect(screen.getByRole("region", { name: "first" }).textContent).toContain("first changed");
    expect(screen.getByRole("region", { name: "second" }).textContent).toContain("让好想法，生长");
  });

  it("reports controlled changes and accepts the value echoed by its owner", () => {
    const details: MindMapChangeDetail[] = [];
    function Controlled() {
      const [value, setValue] = useState(sampleTree());
      return (
        <MindMapProvider
          value={value}
          onChange={(tree, detail) => {
            details.push(detail);
            setValue(tree);
          }}
        >
          <Probe name="controlled" />
        </MindMapProvider>
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(screen.getByRole("region", { name: "controlled" }).textContent).toContain("controlled changed");
    expect(details).toMatchObject([{ source: "user", command: { type: "text" } }]);
  });

  it("loads and saves only when persistence is explicitly configured", async () => {
    const stored = sampleTree();
    stored.nodes.root.text = "persisted";
    localStorage.setItem("map", JSON.stringify(serializeDocument(stored)));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(
      <MindMapProvider persistence={{ documentKey: "map", debounceMs: 0 }}>
        <Probe name="persisted-map" />
      </MindMapProvider>,
    );
    await screen.findByText("persisted");
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    await waitFor(() =>
      expect(setItem).toHaveBeenCalledWith(
        "map",
        expect.stringContaining("persisted-map changed"),
      ),
    );
  });

  it("does not touch localStorage by default", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<MindMapProvider><Probe name="memory" /></MindMapProvider>);
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    await Promise.resolve();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("resets history when a different controlled tree arrives", () => {
    function Controlled() {
      const [value, setValue] = useState<Tree>(sampleTree());
      return (
        <>
          <button onClick={() => {
            const next = sampleTree();
            next.nodes.root.text = "external";
            setValue(next);
          }}>replace</button>
          <MindMapProvider value={value} onChange={setValue}>
            <Probe name="controlled" />
          </MindMapProvider>
        </>
      );
    }
    render(<Controlled />);
    fireEvent.click(screen.getByRole("button", { name: "change" }));
    expect(screen.getByRole("region", { name: "controlled" }).textContent).toContain("undoable");
    fireEvent.click(screen.getByRole("button", { name: "replace" }));
    expect(screen.getByRole("region", { name: "controlled" }).textContent).toContain("externalclean");
  });
});
