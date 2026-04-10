import { defineConfig, Options } from "tsup";

export default defineConfig((options: Options) => ({
  entry: {
    index: "src/index.ts",
    utils: "src/utils/index.ts",
    types: "src/types/index.ts",
    schemas: "src/schemas/index.ts",
  },
  clean: true,
  format: ["cjs", "esm"],
  dts: true,
  ...options,
}));
