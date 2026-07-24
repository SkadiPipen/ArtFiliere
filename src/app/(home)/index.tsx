import * as Device from 'expo-device';
import { Platform, StyleSheet, View, Text, Pressable, Image } from 'react-native';
import { router } from 'expo-router';
import Card from "@/components/card";
import { useContext, useState } from 'react';
import { AuthProvider } from '@/providers/AuthProvider';
import { AuthContext } from '@/context/AuthContext';

export default function HomeScreen() {

  const { user, loading } = useContext(AuthContext);
  const [count, setCount] = useState(0);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text>HOME PAGE LAYOUT...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  //style
  text: {
    color: "#000000",
    fontSize: 24,
  },
  container: {
    backgroundColor: "yellow",
  }


});
