// Step 1 and 2 details ug photo upload
import { ActiveDelivery } from '@/module/delivery/types/delivery';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
    artist: ActiveDelivery['artist'];
    isArrived: boolean;
    photoUri?: string | null;
    onTakePhoto: () => void;
}

export const ArtistPickupCard: React.FC<Props> = ({ artist, isArrived, photoUri, onTakePhoto }) => (
    <View style={styles.cardYellow}>
        <Text style={styles.cardTitle}>Artist Information (Pickup Location)</Text>
        <Text style={styles.label}>Artist Name</Text>
        <Text style={styles.valueBold}>{artist?.name || 'Studio Location'}</Text>

        <View style={styles.rowBetween}>
            <View>
                <Text style={styles.label}>Phone</Text>
                <Text style={styles.value}>{artist?.phone || 'N/A'}</Text>
            </View>
            {artist?.phone && (
                <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${artist.phone}`)}>
                    <Ionicons name="call-outline" size={14} color="#BC5454"/>
                    <Text style={styles.callButtonText}>Call</Text>
                </TouchableOpacity>
            )}
        </View>

        <Text style={styles.label}>Pickup Address</Text>
        <Text style={styles.value}>{artist?.address || 'Pickup Address'}</Text>

        {isArrived && (
            <View style={{ marginTop: 12 }}>
                {photoUri ? (
                    <View style={styles.previewContainer}>
                        <Image source={{ uri: photoUri }} style={styles.previewImage}/>
                        <TouchableOpacity style={styles.retakeButton} onPress={onTakePhoto} activeOpacity={0.8}>
                            <Ionicons name="checkmark-circle" size={18} color="#2ECC71"/>
                            <Text style={styles.retakeText}>Proof Added (Tap to Retake)</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity style={styles.photoButton} onPress={onTakePhoto} activeOpacity={0.8}>
                        <Ionicons name="camera-outline" size={18} color="#BC5454"/>
                        <Text style={styles.photoButtonText}>Take Photo Proof of Asset (1)</Text>
                    </TouchableOpacity>
                )}
            </View>
        )}
    </View>
);

const styles = StyleSheet.create({
    cardYellow: { backgroundColor: '#FFFDF6', padding: 14, borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FADBD8' },
    cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#BC5454', marginBottom: 8 },
    label: { fontSize: 12, color: '#7F8C8D', marginTop: 6 },
    value: { fontSize: 14, color: '#2C3E50' },
    valueBold: { fontSize: 15, fontWeight: 'bold', color: '#2C3E50' },
    rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    callButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#BC5454', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14 },
    callButtonText: { color: '#BC5454', fontWeight: '600', marginLeft: 4, fontSize: 12 },
    photoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BC5454', padding: 10, borderRadius: 8, marginTop: 12, backgroundColor: '#FFFFFF' },
    photoButtonText: { color: '#BC5454', fontWeight: '600', marginLeft: 6, fontSize: 13 },
    previewContainer: { alignItems: 'center', marginTop: 4 },
    previewImage: { width: '100%', height: 160, borderRadius: 8, marginBottom: 8 },
    retakeButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8 },
    retakeText: { color: '#2ECC71', fontWeight: 'bold', marginLeft: 6, fontSize: 13 }
});