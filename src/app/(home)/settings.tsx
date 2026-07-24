import * as Device from 'expo-device';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';


export default function HomeScreen() {
  return (
    <View style={styles.container}> 
      <Text style={styles.text}>This is profile page</Text>
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
