import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "components/mindmap/index.ts" },
  format: ["esm", "cjs"],
  dts: { compilerOptions: { incremental: false } },
  clean: true,
  sourcemap: true,
  splitting: false,
  outExtension({ format }) {
    return { js: format === "esm" ? ".js" : ".cjs" };
  },
});
