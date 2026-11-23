import { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, View } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import { AuthContext } from '@/context/AuthContext';
import { auth } from '@/firebase/config';
import { proofCaptureIsBusy, readPendingProof, recoverProofCapture } from '@/services/deliveryProofCapture';
import { Text } from './Typography';

export default function DeliveryProofRecovery() {
  const { user, loading } = useContext(AuthContext);
  const navigation = useRootNavigationState();
  const router = useRouter();
  const running = useRef(false);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    if (loading || !user || !navigation?.key) return;
    let active = true;
    const restore = async () => {
      if (!active || running.current || proofCaptureIsBusy() || AppState.currentState !== 'active') return;
      running.current = true;
      let pending: Awaited<ReturnType<typeof readPendingProof>> = null;
      try {
        pending = await readPendingProof();
        if (!active || !pending || pending.uid !== user.uid || proofCaptureIsBusy()) return;
        setRestoring(true);
        const result = await recoverProofCapture();
        if (!active || auth.currentUser?.uid !== user.uid || !result) return;
        router.replace({ pathname: '/delivery-details', params: { id: result.record.orderId } });
        Alert.alert(result.uri ? 'Proof recovered' : 'Camera interrupted', result.uri ? 'Your photo was recovered and uploaded to this delivery.' : 'Your delivery has been reopened. Please retake the proof photo.');
      } catch (error: any) {
        if (active && pending && pending.uid === auth.currentUser?.uid) {
          router.replace({ pathname: '/delivery-details', params: { id: pending.orderId } });
          Alert.alert('Proof recovery needs attention', error.message || 'Reopen the delivery to retry the saved photo or retake it.');
        }
      } finally { running.current = false; if (active) setRestoring(false); }
    };
    void restore();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void restore(); });
    return () => { active = false; listener.remove(); };
  }, [loading, user?.uid, navigation?.key, router]);
  return <Modal visible={restoring} transparent animationType="fade"><View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', gap: 16 }}><ActivityIndicator color="#C15656" /><Text>Recovering delivery proof…</Text></View></Modal>;
}
