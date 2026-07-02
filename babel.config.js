const isProduction =
  (process.env.BABEL_ENV || process.env.NODE_ENV || 'development') ===
  'production';

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        cwd: 'babelrc',
        root: ['./src'],
        extensions: [
          '.android.tsx',
          '.android.ts',
          '.android.jsx',
          '.android.js',
          '.native.tsx',
          '.native.ts',
          '.native.jsx',
          '.native.js',
          '.js',
          '.ts',
          '.tsx',
          '.json',
        ],
        alias: {
          '': './src',
          realm: './src/platform/android/realm',
          '@realm/react': './src/platform/android/realm-react',
          'react-native-reanimated': './src/platform/android/react-native-reanimated',
        },
      },
    ],
    ...(isProduction
      ? [
          [
            'transform-remove-console',
            {
              exclude: ['error', 'warn'],
            },
          ],
        ]
      : []),
  ],
  sourceMaps: !isProduction,
};
