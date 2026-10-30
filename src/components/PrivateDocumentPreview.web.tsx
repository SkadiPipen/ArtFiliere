import { Image } from 'react-native';

type Props = { uri: string; mime: string; label: string };

export default function PrivateDocumentPreview({ uri, mime, label }: Props) {
  if (mime === 'application/pdf') {
    return <iframe title={label} src={uri} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', minHeight: 400, border: 0, background: '#F3F0ED' }} />;
  }
  return <Image accessibilityLabel={label} source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} />;
}
