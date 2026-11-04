import { Text, TextInput } from '@/components/Typography';
import { COLORS } from '@/constants/colors';
import API_URL from '@/services/api';
import { loginUser, logOut } from '@/services/auth';
import { platformAccessError } from '@/services/platformAccess';
import { staffDashboardForRole } from '@/services/roleRoutes';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

export default function HomeScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const entrance = useRef(new Animated.Value(0)).current;
  const sketch = useRef(new Animated.Value(0)).current;
  const [focused, setFocused] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!active) return;
      if (reduce) { entrance.setValue(1); sketch.setValue(1); return; }
      animation = Animated.stagger(160, [
        Animated.timing(sketch, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
        Animated.timing(entrance, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]);
      animation.start();
    }).catch(() => { entrance.setValue(1); sketch.setValue(1); });
    return () => { active = false; animation?.stop(); };
  }, [entrance, sketch]);

  async function handleLogin() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      // Login to Firebase
      const user = await loginUser(email, password);

      // Get Firebase ID Token
      const token = await user.getIdToken();

      // Send token to Django
      const response = await fetch(`${API_URL}/auth/login/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await response.text();
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error(
          `Login server returned an unexpected response (HTTP ${response.status}). ` +
          (response.status >= 500
            ? 'Check the Django terminal for the server traceback.'
            : 'Check the API address and that Django is running.'),
        );
      }

      if (!data || typeof data !== 'object') throw new Error('The login server returned an invalid response. Please try again.');

      if (!response.ok) {
        if (data.code === 'account_restricted') { router.replace('/account-appeal' as any); return; }
        throw new Error(data.error || data.detail || 'Unable to sign in.');
      }
      const accessError = platformAccessError(String(data.role).toLowerCase(), Platform.OS);
      if (accessError) { await logOut(); throw new Error(accessError); }



      router.replace((staffDashboardForRole(data.role) || '/(home)') as any);
    } catch (error: any) {
      if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) setError(error.message || 'Unable to sign in.');
    } finally { setBusy(false); }
  }

  const baseline = { opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] };
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.page, isWide && styles.pageWide]}>
          <View style={[styles.brand, isWide && styles.brandWide]}>
            <Pressable accessibilityRole="link" accessibilityLabel="Back to home" onPress={() => router.push('/')} style={[styles.brandLink, isWide ? { alignSelf: 'center' } : { marginTop: 20 }]}>
              <View style={{ width: isWide ? 230 : 122, height: isWide ? 230 : 122, overflow: 'hidden' }}>
                <Image accessibilityIgnoresInvertColors source={require('@/assets/images/logo.png')} resizeMode="contain" style={styles.logo} />
                {/* A moving pencil-like edge uncovers the original logo in a sketch reveal. */}
                <Animated.View pointerEvents="none" style={[styles.sketchCover, { transform: [{ translateX: sketch.interpolate({ inputRange: [0, 1], outputRange: [0, isWide ? 250 : 140] }) }] }]}>
                  <Svg width="12" height="100%" viewBox="0 0 12 120" preserveAspectRatio="none" style={{ position: 'absolute', left: -6 }}>
                    <Path d="M8 0 L2 12 L10 24 L2 36 L10 48 L2 60 L10 72 L2 84 L10 96 L2 108 L8 120" stroke="#F4EBC9" strokeWidth="2" fill="none" />
                  </Svg>
                </Animated.View>
              </View>
            </Pressable>
            {isWide && <Animated.View style={[styles.brandCopy, baseline]}>
              <Text style={styles.brandTitle}>ArtFiliere</Text>
              <Text style={styles.brandSubtitle}>A space for art.</Text>
            </Animated.View>}
            <Svg pointerEvents="none" width={isWide ? 80 : '100%'} height={isWide ? '100%' : 54} viewBox={isWide ? '0 0 60 400' : '0 0 400 60'} preserveAspectRatio="none" style={isWide ? styles.waveRight : styles.wave}>
              <Path d={isWide ? 'M36 0 C96 130 -30 244 34 400 L60 400 L60 0 Z' : 'M0 36 C130 96 244 -30 400 34 L400 60 L0 60 Z'} fill="#FFFFFF" />
            </Svg>
          </View>
          <View style={[styles.formRegion, isWide && styles.formRegionWide]}>
            <Animated.View style={[styles.form, baseline]}>
              <Text style={styles.title}>Login</Text>
              <Animated.View style={[styles.baseline, { transform: [{ scaleX: entrance }] }]} />
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
              <TextInput accessibilityLabel="Email" style={[styles.input, focused === 'email' && styles.inputFocused]} placeholder="Email" placeholderTextColor={COLORS.textMuted}
                value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email"
                onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
              <TextInput accessibilityLabel="Password" style={[styles.input, focused === 'password' && styles.inputFocused]} placeholder="Password" placeholderTextColor={COLORS.textMuted}
                value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" returnKeyType="go"
                onSubmitEditing={handleLogin} onFocus={() => setFocused('password')} onBlur={() => setFocused(null)} />
              <Pressable accessibilityRole="button" disabled={busy} onPress={handleLogin} style={({ pressed }) => [styles.login, pressed && styles.loginPressed, busy && { opacity: 0.65 }]}>
                <Text style={styles.loginText}>{busy ? 'Please wait…' : 'Log In'}</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => router.push('/')} style={styles.textLink}><Text style={styles.link}>Forgot password?</Text></Pressable>
              <Pressable accessibilityRole="link" onPress={() => router.push('/sign-up')} style={styles.textLink}>
                <Text style={styles.signup}>Don't have an account? <Text style={styles.link}>Sign Up</Text></Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => router.push('/rider/login' as any)} style={({ pressed }) => [styles.driver, pressed && { backgroundColor: '#FFF5F3' }]}>
                <Text style={styles.driverText}>Are you Courier / Driver? Log In Here</Text>
              </Pressable>
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.red },
  page: { flexGrow: 1, backgroundColor: '#FFFFFF' },
  pageWide: { flexDirection: 'row', minHeight: '100%' },
  brand: { height: 190, backgroundColor: COLORS.red, paddingTop: 8, paddingHorizontal: 20, overflow: 'hidden' },
  brandWide: { width: '43%', height: '100%', minHeight: 660, alignItems: 'center', justifyContent: 'center', paddingBottom: 90 },
  brandLink: { alignSelf: 'flex-start' },
  logo: { width: '100%', height: '100%', tintColor: COLORS.creamLight },
  sketchCover: { position: 'absolute', top: 0, bottom: 0, left: 0, width: '105%', backgroundColor: COLORS.red },
  brandCopy: { alignSelf: 'center', marginTop: 24, alignItems: 'center' },
  brandTitle: { fontSize: 40, fontWeight: '800', color: '#FFFFFF' },
  brandSubtitle: { fontSize: 17, color: COLORS.creamLight, marginTop: 10 },
  wave: { position: 'absolute', bottom: -1, left: 0 },
  waveRight: { position: 'absolute', top: 0, bottom: 0, right: -1 },
  formRegion: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 48, backgroundColor: '#FFFFFF' },
  formRegionWide: { flex: 1, justifyContent: 'center', paddingHorizontal: 48, paddingVertical: 64 },
  form: { width: '100%', maxWidth: 460, alignSelf: 'center' },
  title: { fontSize: 32, fontWeight: '700', color: COLORS.red, marginBottom: 8 },
  baseline: { width: 42, height: 3, backgroundColor: COLORS.red, borderRadius: 2, marginBottom: 26, alignSelf: 'flex-start' },
  input: { width: '100%', minHeight: 50, borderWidth: 1, borderColor: COLORS.red, backgroundColor: '#FFFFFF', borderRadius: 7, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 15, color: COLORS.textDark },
  inputFocused: { borderColor: COLORS.redDark, borderWidth: 2, paddingHorizontal: 13, paddingVertical: 11 },
  login: { minHeight: 50, backgroundColor: COLORS.red, borderRadius: 7, alignItems: 'center', justifyContent: 'center', marginTop: 3, marginBottom: 12 },
  loginPressed: { backgroundColor: COLORS.redDark, transform: [{ scale: 0.99 }] },
  loginText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  textLink: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  link: { color: COLORS.red, fontWeight: '600', fontSize: 13 },
  signup: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center' },
  driver: { minHeight: 46, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.red, borderRadius: 7, padding: 12, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  driverText: { color: COLORS.red, fontSize: 12, textAlign: 'center' },
  error: { color: '#B42318', backgroundColor: '#FFF5F3', padding: 12, borderRadius: 7, marginBottom: 16, fontSize: 13 },
});
