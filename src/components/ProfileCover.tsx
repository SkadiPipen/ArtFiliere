import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export default function ProfileCover({ uri }: { uri?: string | null }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff' }]}>
    {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      : <Image source={require('../../assets/images/logo.png')} resizeMode="contain" style={{ position: 'absolute', right: '4%', top: '10%', width: '30%', height: '80%' }} />}
    <LinearGradient colors={['rgba(188,84,84,0.68)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.70)']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} locations={[0, 0.58, 1]} style={StyleSheet.absoluteFill} />
  </View>;
}
