import { Image } from 'react-native';
import { Text } from '@/components/Typography';

type Props = { uri: string; mime: string; label: string };

export default function PrivateDocumentPreview({ uri, mime, label }: Props) {
  if (mime === 'application/pdf') return <Text>Open the web review dashboard to preview this PDF.</Text>;
  return <Image accessibilityLabel={label} source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />;
}
