import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const banner = `/*
 * Calendar Week Card
 * https://github.com/juahan/ha-super-calendar-card
 * MIT License
 * Single-file ES module; all runtime dependencies are bundled in.
 */`;

/** @type {import('rollup').RollupOptions} */
export default {
  input: "src/index.ts",
  output: {
    file: "dist/calendar-week-card.js",
    format: "es",
    banner,
    sourcemap: false,
    inlineDynamicImports: true,
  },
  plugins: [
    resolve({ browser: true, exportConditions: ["browser", "module", "default"] }),
    typescript({ tsconfig: "./tsconfig.json", sourceMap: false }),
  ],
};
