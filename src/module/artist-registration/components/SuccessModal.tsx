import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  visible: boolean;
  onConfirm: () => void;
}

export default function SuccessModal({ visible, onConfirm }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlayBackground}>
        <View style={styles.modalCardContainer}>
          <Text style={styles.modalHeadingTitleText}>
            Your Registration as Artist{"\n"}is Undergoing Approval
          </Text>
          <Text style={styles.modalMutedSubtitle}>
            (This process usually takes 2-3 business days. HR will review your
            submitted BIR Form and portfolio.)
          </Text>

          <TouchableOpacity style={styles.modalConfirmBtn} onPress={onConfirm}>
            <Text style={styles.modalConfirmBtnText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlayBackground: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalCardContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 25,
    width: "100%",
    maxWidth: 450,
    alignItems: "center",
  },
  modalHeadingTitleText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#C15656",
    textAlign: "center",
    lineHeight: 24,
  },
  modalMutedSubtitle: {
    fontSize: 12,
    color: "#666",
    marginVertical: 15,
    textAlign: "center",
    lineHeight: 18,
  },
  modalConfirmBtn: {
    backgroundColor: "#C15656",
    borderRadius: 8,
    height: 42,
    width: "60%",
    justifyContent: "center",
    alignItems: "center",
  },
  modalConfirmBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
