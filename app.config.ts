import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || 'ArtFilier',
  slug: config.slug || 'ArtFilier',
  plugins: [
    ...(config.plugins || []),
    'expo-image',
    'expo-web-browser',
  ],
});
