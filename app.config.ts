import type { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name || 'ArtFiliere',
  slug: config.slug || 'ArtFiliere',
  plugins: [
    ...(config.plugins || []),
    ...(process.env.GOOGLE_IOS_URL_SCHEME ? [[
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: process.env.GOOGLE_IOS_URL_SCHEME },
    ] as [string, { iosUrlScheme: string }]] : []),
  ],
});
