import { useRef, useState } from 'react';
import { Image, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Text } from '@/components/Typography';

export default function StageFilePicker({ label, disabled, onConfirm }: {
  label: string; disabled?: boolean;
  onConfirm: (file: DocumentPicker.DocumentPickerAsset) => Promise<void>;
}) {
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const pick = async () => {
    if (disabled || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false });
      if (!result.canceled) setFile(result.assets[0]);
    } catch (e: any) { setError(e.message || 'Unable to select the file.'); }
    finally { lock.current = false; setWorking(false); }
  };
  const confirm = async () => {
    if (!file || disabled || lock.current) return;
    lock.current = true; setWorking(true); setError('');
    try { await onConfirm(file); setFile(null); }
    catch (e: any) { setError(e.message || 'Upload failed. Your selected file is available to retry.'); }
    finally { lock.current = false; setWorking(false); }
  };
  const button = (text: string, action: () => void, secondary = false) => <TouchableOpacity accessibilityRole="button" disabled={disabled || working} onPress={action} style={{ paddingVertical: 12, paddingHorizontal: 18, maxWidth: '100%', alignSelf: 'flex-start', alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: disabled || working ? '#DDD' : secondary ? '#FAECE8' : '#C15656' }}><Text style={{ color: secondary ? '#A43F48' : '#FFF', fontWeight: '700', textAlign: 'center' }}>{text}</Text></TouchableOpacity>;
  return <View style={{ gap: 12, alignSelf: 'stretch' }}>
    {!file ? button(label, () => void pick()) : <View style={{ padding: 14, borderWidth: 1, borderColor: '#E4C5C0', borderRadius: 12, backgroundColor: '#FFF', gap: 12 }}>
      <Text style={{ fontWeight: '700' }}>Selected file · not submitted</Text>
      <Text numberOfLines={2}>{file.name}</Text>
      {file.mimeType?.startsWith('image/') && <Image source={{ uri: file.uri }} style={{ width: '100%', height: 180 }} resizeMode="contain" />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {button('Replace file', () => void pick(), true)}
        {button(working ? 'Please wait…' : 'Confirm upload', () => void confirm())}
        {button('Cancel', () => setFile(null), true)}
      </View>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
  </View>;
}
