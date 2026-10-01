import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

export default function LoginScreen() {
  // Routes
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordHidden, setPasswordHidden] = useState(true);
  const [loading, setLoading] = useState(false);

  // Handle login
  const handleLogin = async () => {
    if (email.trim() === '' || password.trim() === '') {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      const userCredentials = await signInWithEmailAndPassword(auth, email.trim(), password);
      const token = await userCredentials.user.getIdToken();

      try {
        const backendResponse = await fetch(`${API_URL}/auth/login/`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        if (!backendResponse.ok) {
          throw new Error('Your rider account could not be linked to ArtFiliere. Ask an administrator to check the rider email address.');
        }
        // Keep rider access available while an administrator corrects a legacy
        // account role. The delivery API remains responsible for protecting
        // individual delivery actions.
        await backendResponse.json();
      } catch (backendError) {
        setLoading(false);
        Alert.alert('Rider access unavailable', backendError instanceof Error ? backendError.message : 'Unable to link this rider account.');
        return;
      }

      setLoading(false);
      router.replace('/rider/(tabs)' as any);
    } catch (error: any) {
      setLoading(false);

      let errorMessage = 'Failed to log in. Please try again.';
      if (error.code === 'auth/invalid-credentials' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        errorMessage = 'Invalid email or password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email. Please enter valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      }

      Alert.alert('Login failed', errorMessage);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer} bounces={false}>
        
        {/*Header with logo*/}
        <View style={styles.headerBackground}>
          <View style={styles.logoCircle}>
            <Image source={require('@/assets/images/logo.png')}
                    style={styles.logoImage}
                    resizeMode="contain"/>
          </View>
        </View>

        {/*Form Body*/}
        <View style={styles.formContainer}>
          <Text style={styles.welcomeText}>Welcome Back</Text>
          <Text style={styles.subText}>Sign in to access your rider account</Text>

          {/*Email and Password Inputs*/}
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#C7C7CD"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#C7C7CD"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={passwordHidden}
              autoCapitalize="none"
              editable={!loading}
            />

            <TouchableOpacity style={styles.eyeIconContainer} onPress={() => setPasswordHidden(!passwordHidden)} activeOpacity={0.7}>
              <Ionicons name={passwordHidden ? "eye-off-outline" : "eye-outline"}
                        size={22}
                        color="#7F8D8D"/>
            </TouchableOpacity>
          </View>

          {/*Login trigger button*/}
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="FFFFFF"/>
            ) : (
              <Text style={styles.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footerBackground} />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContainer: { flexGrow: 1 },
  headerBackground: { backgroundColor: '#F5EFEB', height: 260, justifyContent: 'center', alignItems: 'center' },
  logoCircle: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  logoImage: {width: 160, height: 160},
  formContainer: { flex: 1, paddingHorizontal: 28, paddingTop: 30, backgroundColor: '#FFFFFF' },
  welcomeText: { fontSize: 28, fontWeight: 'bold', color: '#BC5454', marginBottom: 4 },
  subText: { fontSize: 14, color: '#7F8C8D', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: '#BC5454', marginBottom: 6 },
  input: { backgroundColor: '#F2F2F4', height: 48, borderRadius: 6, paddingHorizontal: 16, fontSize: 15, color: '#333333', marginBottom: 20 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F2F2F4', height: 48, borderRadius: 8, marginBottom: 20, paddingHorizontal: 16 },
  passwordInput: {flex: 1, height: '100%', fontSize: 15, color: '#333333'},
  eyeIconContainer: { paddingLeft: 10 , justifyContent: 'center', alignItems: 'center' }, 
  button: { backgroundColor: '#BC5454', height: 50, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  buttonDisabled: { backgroundColor: '#D28D8D' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
  footerBackground: { height: 40, backgroundColor: '#F5EFEB', marginTop: 20 },
});
