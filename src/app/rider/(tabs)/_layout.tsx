import RiderGate from '@/module/delivery/RiderGate';
import { Tabs } from 'expo-router';
import { Clock, Home, Truck, User } from 'lucide-react-native';

export default function RiderTabsLayout() {
  return (
    <RiderGate><Tabs screenOptions={{ tabBarActiveTintColor: '#C15656', headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          tabBarIcon: ({ color }) => <Truck color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <Clock color={color} size={20} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={20} />,
        }}
      />
    </Tabs></RiderGate>
  );
}