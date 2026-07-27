import BottomNavBar from '@/components/home/BottomNavbar';
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

export default function HomeLayout() {
  return (
    <View style={styles.container}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="edit-profile" />
      </Stack>

      <BottomNavBar />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});