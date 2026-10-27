import { Text } from '@/components/Typography';
import React from 'react';
import { Linking, TouchableOpacity, View } from 'react-native';

export default function ResaleRoyaltyPolicy() {
  return <View style={{ gap: 6 }}>
    <Text style={{ fontWeight: '700' }}>IPOPHL-based graduated resale royalty · starts at 5%</Text>
    <Text>Each portion of the future resale artwork price is charged separately:</Text>
    <Text>First ₱150,000: 5%{ '\n' }Next ₱200,000: 4%{ '\n' }Next ₱250,000: 3%{ '\n' }Next ₱400,000: 2%{ '\n' }Next ₱1,000,000: 1.5%{ '\n' }Amount above ₱2,000,000: 1%</Text>
    <Text>Based on selling price excluding VAT, before platform fees. Not added to this commission payment.</Text>
    <Text>This contractual option does not waive statutory resale rights where those rights apply to covered works.</Text>
    <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL('https://ilaw.ipophil.gov.ph/pluginfile.php/150/mod_resource/content/2/Copyright%20Reference%20Book%202021.pdf#page=56')}><Text style={{ color: '#B84A4A' }}>View IPOPHL reference · Section 14.1, page 50</Text></TouchableOpacity>
  </View>;
}
