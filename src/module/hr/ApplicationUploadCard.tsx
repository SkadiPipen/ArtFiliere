import { View } from 'react-native';
import { UploadCardContent, type UploadCardProps } from './ApplicationUploadCardContent';

export default function ApplicationUploadCard(props: UploadCardProps) {
  return <View style={{ flex: 1, flexBasis: 260, minWidth: 220, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C87A70', borderRadius: 18, backgroundColor: '#FFFCFA' }}><UploadCardContent {...props} /></View>;
}
