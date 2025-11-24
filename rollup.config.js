const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const typescript = require('rollup-plugin-typescript2');

module.exports = {
  input: 'src/index.ts',

  output: {
    file: 'dist/mmpay-sdk.js',
    format: 'umd',
    name: 'MMPaySDK',
    sourcemap: true,
    exports: 'named',
  },

  // Plugins handle the heavy lifting:
  plugins: [
    // 1. Compile TypeScript to JavaScript
    typescript({
      tsconfig: 'tsconfig.json',
      useTsconfigDeclarationDir: true,
      tsconfigOverride: {
        compilerOptions: {
          module: "esnext",
          declaration: false,
          declarationMap: false,
        }
      }
    }),

    // 2. Resolve external dependencies (like axios, crypto-js)
    // from node_modules and include them in the bundle.
    resolve({
      browser: true,
    }),

    // 3. Convert CommonJS modules (like axios, crypto-js)
    // into ES Modules so Rollup can handle them.
    commonjs(),
  ],
};
