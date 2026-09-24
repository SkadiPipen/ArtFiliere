import { COLORS } from '@/constants/colors';
import API_URL from '@/services/api';
import { loginUser } from '@/services/auth';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  async function handleLogin() {
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

      const data = await response.json();

      console.log(data);

      alert('Login Successfully!');

      router.replace(data.role === 'platform_admin' ? '/admin-dashboard' : data.role === 'hr' ? '/hr-dashboard' : data.role === 'creative_moderator' ? '/creative-dashboard' : (['rider', 'driver'].includes(data.role?.toLowerCase())) ? '/rider/(tabs)' as any : '/(home)');
    } catch (error: any) {
      alert(error.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <View
        style={{
          flex: 1,
          flexDirection: isWide ? 'row' : 'column',
        }}
      >
        {isWide && (
          <View
            style={{
              flex: 1,
              backgroundColor: COLORS.cream,
              paddingHorizontal: 32,
              paddingTop: 24,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Pressable
              onPress={() => router.push('/')}
              style={{ position: 'absolute', top: 24, left: 24 }}
            >
              <Text style={{ color: COLORS.red, fontWeight: '600', fontSize: 14 }}>
                ‹ Back to Home
              </Text>
            </Pressable>

            <Image
              source={require('@/assets/images/logo.png')}
              style={{ width: 220, height: 220 }}
              resizeMode="contain"
            />
          </View>
        )}

        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 32,
            paddingVertical: 40,
          }}
          style={{ flex: 1, backgroundColor: COLORS.white }}
        >
          <Text
            style={{
              fontSize: 34,
              fontWeight: '800',
              color: COLORS.red,
              marginBottom: 28,
            }}
          >
            Login
          </Text>

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.creamLight,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 14,
              fontSize: 15,
              color: COLORS.textDark,
            }}
            placeholder="Email"
            placeholderTextColor="#9C9385"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={{
              borderWidth: 1,
              borderColor: COLORS.border,
              backgroundColor: COLORS.creamLight,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 20,
              fontSize: 15,
              color: COLORS.textDark,
            }}
            placeholder="Password"
            placeholderTextColor="#9C9385"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Pressable
            style={({ pressed }) => ({
              backgroundColor: pressed ? COLORS.redDark : COLORS.red,
              paddingVertical: 14,
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 16,
            })}
            onPress={handleLogin}
          >
            <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>
              Log In
            </Text>
          </Pressable>

          <Pressable onPress={() => router.push('/')}>
            <Text
              style={{
                color: COLORS.red,
                fontWeight: '600',
                fontSize: 13,
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              Forgot password?
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push('/sign-up')}>
            <Text
              style={{
                color: COLORS.textDark,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Don't have an account?{' '}
              <Text style={{ color: COLORS.red, fontWeight: '700' }}>Sign Up</Text>
            </Text>
          </Pressable>
          <Pressable 
            onPress={() => router.push('/rider/login' as any)}
            style={{
              marginTop: 24,
              paddingVertical: 12,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: COLORS.red,
              borderStyle: 'dashed',
              alignItems: 'center',
            }}>
            <Text
              style={{
                color: COLORS.red,
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              Are you Courier / Driver? Log In Here
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}