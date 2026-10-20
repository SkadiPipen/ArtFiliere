import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { router } from 'expo-router';
import { useCart } from '@/context/CartContext';
import { auth } from '@/firebase/config';
import { reconcilePaymentReturn } from '@/services/paymentReturn';

export default function PaymentReturnMonitor() {
  const { refreshCart } = useCart();
  useEffect(() => {
    let active = true, checking = false;
    const check = async () => {
      if (checking) return;
      checking = true;
      try {
        await auth.authStateReady();
        if (active && await reconcilePaymentReturn()) {
          // Returning home must not depend on a second, unrelated cart request.
          if (active) router.replace({ pathname: '/(home)', params: { paymentReturn: String(Date.now()) } });
          await refreshCart();
        }
      } catch { /* A return URL or browser close is not proof of payment. Retry verification. */ }
      finally { checking = false; }
    };
    const timer = setInterval(check, 4000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    if (Platform.OS === 'web') window.addEventListener('focus', check);
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onVisible);
    void check();
    return () => {
      active = false; clearInterval(timer); subscription.remove();
      if (Platform.OS === 'web') {
        window.removeEventListener('focus', check);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, []);
  return null;
}
