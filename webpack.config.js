// webpack.config.js
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CompressionPlugin = require('compression-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: 'index.js',
      libraryTarget: 'commonjs2',
    },
    target: 'node',
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
    },
    plugins: [
      new CleanWebpackPlugin(),
      isProduction && new CompressionPlugin({
        test: /\.js(\?.*)?$/i,
        algorithm: 'gzip',
        minRatio: 0.8,
      }),
      isProduction && new CompressionPlugin({
        test: /\.js(\?.*)?$/i,
        algorithm: 'brotliCompress',
        filename: '[path][base].br',
        minRatio: 0.8,
      }),
    ].filter(Boolean),
    externals: [
      /node_modules/,
    ],
  };
};
