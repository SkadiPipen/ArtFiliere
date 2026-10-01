import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type AppDialogTone = 'success' | 'error' | 'info';

export type AppDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  tone?: AppDialogTone;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
};

export default function AppDialog({ visible, title, message, tone = 'info', primaryLabel = 'Okay', onPrimary, secondaryLabel, onSecondary, onClose }: AppDialogProps) {
  const closeThen = (callback?: () => void) => {
    onClose();
    callback?.();
  };
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? CircleAlert : Info;
  const color = tone === 'success' ? '#4F8657' : tone === 'error' ? '#B94D4D' : '#C15656';
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
          <TouchableOpacity style={styles.close} onPress={onClose} accessibilityLabel="Close dialog"><X size={20} color="#7B6A65" /></TouchableOpacity>
          <View style={[styles.iconCircle, { backgroundColor: `${color}18` }]}><Icon size={29} color={color} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            {secondaryLabel && <TouchableOpacity style={styles.secondaryButton} onPress={() => closeThen(onSecondary)}><Text style={styles.secondaryText}>{secondaryLabel}</Text></TouchableOpacity>}
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: color }]} onPress={() => closeThen(onPrimary)}><Text style={styles.primaryText}>{primaryLabel}</Text></TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(43,35,32,0.52)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 390, borderRadius: 18, padding: 26, backgroundColor: '#FFFDF7', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
  close: { position: 'absolute', top: 12, right: 12, padding: 7 },
  iconCircle: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  title: { color: '#3A2D2A', fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  message: { color: '#75655F', lineHeight: 21, fontSize: 14, textAlign: 'center', marginTop: 9 },
  actions: { flexDirection: 'row', width: '100%', gap: 10, marginTop: 24 },
  primaryButton: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { flex: 1, minHeight: 44, borderRadius: 9, borderWidth: 1, borderColor: '#D8C7C0', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { color: '#75655F', fontSize: 14, fontWeight: '800' },
});
