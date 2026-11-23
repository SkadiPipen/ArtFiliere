import { useState } from 'react';
import { Image, type ImageProps } from 'react-native';

const logo = require('@/assets/images/logo.png');

export default function ProfileAvatar({ uri, style, ...props }: Omit<ImageProps, 'source' | 'resizeMode' | 'onError'> & { uri?: string | null }) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photo = uri?.trim();
  const showPhoto = !!photo && photo !== failedUri;

  return <Image
    {...props}
    source={showPhoto ? { uri: photo } : logo}
    style={[style, !showPhoto && { backgroundColor: '#FFFFFF' }]}
    resizeMode={showPhoto ? 'cover' : 'contain'}
    onError={showPhoto ? () => setFailedUri(photo) : undefined}
  />;
}
