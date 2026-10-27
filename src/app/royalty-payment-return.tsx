import { Text } from '@/components/Typography';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { readApiResponse } from '@/module/chat-negotiations/contracts';

export default function RoyaltyPaymentReturn() {
  const { agreementId, reportId } = useLocalSearchParams<{ agreementId?: string; reportId?: string }>();
  const validAgreement = /^\d+$/.test(agreementId || '');
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState('Checking your payment with Xendit…');
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        await auth.authStateReady();
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw Error('Sign in to view and refresh your royalty payment.');
        if (!/^\d+$/.test(reportId || '')) throw Error('Return to royalty reports to check your payment.');
        const result = await readApiResponse(await fetch(`${API_URL}/api/users/royalties/periods/${reportId}/payment/`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'refresh' }),
        }));
        if (active) setMessage(['held', 'released'].includes(result.status)
          ? 'Payment received. Funds are released to the artist after admin verification.'
          : 'Payment is not confirmed yet. You can return to your report and refresh its payment status.');
      } catch (error: any) { if (active) setMessage(error.message || 'Unable to verify payment yet. Refresh its status from your report.'); }
      finally { if (active) setChecking(false); }
    };
    void check();
    return () => { active = false; };
  }, [reportId]);
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#FAF7F4', justifyContent: 'center', padding: 24 }}>
    <View style={{ width: '100%', maxWidth: 560, alignSelf: 'center', padding: 24, gap: 18, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 16, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: '#70482F' }}>Royalty payment</Text>
      {checking && <ActivityIndicator />}
      <Text accessibilityLiveRegion="polite">{message}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.replace({ pathname: '/royalty-reports', params: validAgreement ? { agreementId: agreementId! } : {} })}
        style={{ padding: 14, backgroundColor: '#A33F45', borderRadius: 10 }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>Return to royalty reports</Text>
      </Pressable>
    </View>
  </SafeAreaView>;
}
