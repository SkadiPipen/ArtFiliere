// ========================================
// FILE: components/artworks/LicenseInfoModal.tsx
// PURPOSE: Modal popup showing license/exclusivity information
// ========================================

import { X } from 'lucide-react-native';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface LicenseInfoModalProps {
  visible: boolean;
  onClose: () => void;
  data: {
    title: string;
    description: string;
    permitted: string[];
    restrictions: string[];
  } | null;
}

export default function LicenseInfoModal({ visible, onClose, data }: LicenseInfoModalProps) {
  if (!data) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Close Button */}
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <X size={24} color="#000" />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Title */}
            <Text style={styles.title}>{data.title}</Text>
            
            {/* Description */}
            <Text style={styles.description}>{data.description}</Text>

            {/* Permitted Uses */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✅ Permitted Uses</Text>
              {data.permitted.map((item, index) => (
                <Text key={index} style={styles.listItem}>• {item}</Text>
              ))}
            </View>

            {/* Restrictions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>❌ Restrictions</Text>
              {data.restrictions.map((item, index) => (
                <Text key={index} style={styles.listItem}>• {item}</Text>
              ))}
            </View>
          </ScrollView>

          {/* Close Button Bottom */}
          <TouchableOpacity style={styles.closeBottomButton} onPress={onClose}>
            <Text style={styles.closeBottomText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  listItem: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    paddingLeft: 4,
  },
  closeBottomButton: {
    backgroundColor: '#D48C62',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  closeBottomText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});