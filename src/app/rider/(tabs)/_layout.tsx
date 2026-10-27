import { Redirect, Tabs } from 'expo-router';
import { auth } from '@/firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Clock, Home, Truck, User } from 'lucide-react-native';

export default function RiderTabsLayout() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => onAuthStateChanged(auth, user => { setSignedIn(!!user); setReady(true); }), []);
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color="#BC5454" /></View>;
  if (!signedIn) return <Redirect href="/rider/login" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#BC5454',
        tabBarInactiveTintColor: '#7F8C8D',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color, size }) => <Truck color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => <Clock color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
