import API_URL from '@/services/api';
import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Result = { verified: boolean; record_type?: string; message: string };

export default function VerificationScreen() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const verify = async () => {
    const value = code.trim().toUpperCase();
    if (!value) {
      setResult({ verified: false, message: 'Enter the verification code from the agreement or sale receipt.' });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/blockchain/verify/?code=${encodeURIComponent(value)}`);
      const data = await response.json();
      setResult({ verified: Boolean(data.verified), record_type: data.record_type, message: data.message || 'Unable to verify this record.' });
    } catch {
      setResult({ verified: false, message: 'Verification is unavailable. Make sure ArtFiliere and the local blockchain are running.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
      <View style={styles.card}>
        <ShieldCheck size={42} color="#5D8A63" />
        <Text style={styles.title}>Verify an ArtFiliere record</Text>
        <Text style={styles.body}>Enter the verification code shown on a finalized agreement or completed sale receipt.</Text>
        <TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Example: AF-AGR-7KQ9X2" style={styles.input} />
        <TouchableOpacity style={styles.button} onPress={verify} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Verify record</Text>}
        </TouchableOpacity>
        {result && <View style={[styles.result, result.verified ? styles.verified : styles.notVerified]}>
          <Text style={styles.resultTitle}>{result.verified ? '✓ Verified by ArtFiliere' : 'Not verified'}</Text>
          <Text style={styles.resultBody}>{result.message}</Text>
        </View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA', padding: 24 },
  back: { color: '#C15656', fontWeight: '800', fontSize: 15 },
  card: { width: '100%', maxWidth: 480, alignSelf: 'center', marginTop: 56, backgroundColor: '#FFFDF5', borderRadius: 16, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#E9DDD6' },
  title: { color: '#3A2D2A', fontSize: 23, fontWeight: '800', textAlign: 'center', marginTop: 14 },
  body: { color: '#75655F', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 22 },
  input: { width: '100%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8C7C0', borderRadius: 9, paddingHorizontal: 14, paddingVertical: 13, color: '#3A2D2A', fontWeight: '700' },
  button: { width: '100%', marginTop: 12, backgroundColor: '#C15656', borderRadius: 9, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  result: { width: '100%', borderRadius: 10, padding: 15, marginTop: 18 },
  verified: { backgroundColor: '#EAF5EB' },
  notVerified: { backgroundColor: '#FFF0ED' },
  resultTitle: { color: '#3A2D2A', fontWeight: '800', fontSize: 15 },
  resultBody: { color: '#625550', marginTop: 5, fontSize: 13, lineHeight: 18 },
});
