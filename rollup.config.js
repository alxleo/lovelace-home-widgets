import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/alx-home-widgets.js",
    format: "es",
    inlineDynamicImports: true,
    sourcemap: false
  },
  plugins: [nodeResolve(), typescript(), terser()],
  onwarn(warning, warn) {
    if (warning.code === "THIS_IS_UNDEFINED" && warning.id?.includes("node_modules")) return;
    warn(warning);
  }
};
