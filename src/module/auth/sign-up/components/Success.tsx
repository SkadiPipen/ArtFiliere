import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { COLORS } from '@/constants/colors';

export default function Success() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          borderWidth: 2,
          borderColor: COLORS.success,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        <Ionicons name="checkmark" size={32} color={COLORS.success} />
      </View>

      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          color: COLORS.textDark,
          textAlign: 'center',
          marginBottom: 16,
        }}
      >
        Congratulations! You've done sign up.
      </Text>

      <Pressable onPress={() => router.replace('/login')}>
        <Text style={{ color: COLORS.red, fontWeight: '700', fontSize: 14 }}>
          Proceed to Log In
        </Text>
      </Pressable>
    </View>
  );
}