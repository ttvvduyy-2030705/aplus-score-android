const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

module.exports = mergeConfig(defaultConfig, {
  resolver: {
    sourceExts: [
      'android.tsx',
      'android.ts',
      'android.jsx',
      'android.js',
      'native.tsx',
      'native.ts',
      'native.jsx',
      'native.js',
      ...defaultConfig.resolver.sourceExts.filter(
        ext =>
          ![
            'android.tsx',
            'android.ts',
            'android.jsx',
            'android.js',
            'native.tsx',
            'native.ts',
            'native.jsx',
            'native.js',
          ].includes(ext),
      ),
    ],
  },
});
