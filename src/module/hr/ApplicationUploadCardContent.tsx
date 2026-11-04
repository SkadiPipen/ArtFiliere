import { ImagePlus, UploadCloud, CheckCircle2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/Typography';

export type UploadCardProps = { label: string; filename?: string; disabled?: boolean; onUpload: () => void; onFile: (file: File) => void };
export function UploadCardContent({ label, filename, disabled, onUpload }: UploadCardProps) {
  return <View style={{ alignItems: 'center', justifyContent: 'center', minHeight: 250, padding: 24, gap: 16 }}>
    <Text style={{ color: '#A74646', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{label} *</Text>
    {filename ? <CheckCircle2 size={42} color="#B95552" /> : <ImagePlus size={44} color="#C88B83" />}
    <Text style={{ color: '#8A7770', textAlign: 'center', fontSize: 13 }}>{filename || 'Choose your PDF or image file'}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`${filename ? 'Replace' : 'Upload'} ${label}`} disabled={disabled} onPress={onUpload} style={{ backgroundColor: '#B95552', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 9, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#FFF', fontWeight: '700', fontSize: 16 }}>{filename ? 'Replace file' : 'Upload'}</Text><UploadCloud size={21} color="#FFF" /></Pressable>
    <Text style={{ color: '#9C837A', fontSize: 11, textAlign: 'center' }}>PDF, JPEG, PNG or WebP</Text>
  </View>;
}
