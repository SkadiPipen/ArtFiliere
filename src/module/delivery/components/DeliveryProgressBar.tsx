// Step 1, 2, 3 progress indicators
import { DeliveryStep } from '@/module/delivery/types/delivery';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
    currentStep: DeliveryStep;
}

export const DeliveryProgressBar: React.FC<Props> = ({ currentStep }) => {
    const isStep1Done = currentStep !== 'ACCEPTED' && currentStep !== 'ARRIVED_AT_ARTIST';
    const isStep2Done = currentStep === 'ARRIVED_AT_BUYER' || currentStep === 'DELIVERED';
    const isStep3Done = currentStep === 'DELIVERED';

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Delivery Progress</Text>

            {/* Step 1 */}
            <View style={styles.stepRow}>
                <View style={[styles.badge, isStep1Done? styles.badgeGreen : styles.badgeRed]}>
                    {isStep1Done ? (
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                    ) : (
                        <Text style={styles.badgeText}>1</Text>
                    )}
                </View>
                <View style={styles.stepTextContainer}>
                    <Text style={[styles.stepTitle, isStep1Done && styles.textMuted]}>Obtain Asset from Artist</Text>
                    <Text style={styles.stepSubtitle}>Pick up order from artist location</Text>
                </View>
            </View>

            {/* Step 2 */}
            <View style={styles.stepRow}>
                <View style={[styles.badge, isStep2Done? styles.badgeGreen : (isStep1Done ? styles.badgeRed : styles.badgeGray)]}>
                    {isStep2Done ? (
                        <Ionicons name="checkmark" size={16} color="#FFF" />
                    ) : (
                        <Text style={styles.badgeText}>2</Text>
                    )}
                </View>
                <View style={styles.stepTextContainer}>
                    <Text style={[styles.stepTitle, isStep2Done && styles.textMuted]}>Deliver to Buyer</Text>
                    <Text style={styles.stepSubtitle}>Transport to customer location</Text>
                </View>
            </View>

            {/* Step 3 */}
            <View style={styles.stepRow}>
                <View style={[styles.badge, isStep3Done? styles.badgeGreen : styles.badgeGray]}>
                    <Text style={styles.badgeText}>3</Text>
                </View>
                <View style={styles.stepTextContainer}>
                    <Text style={styles.stepTitle}>Give Asset to Buyer</Text>
                    <Text style={styles.stepSubtitle}>Complete handover</Text>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { marginBottom: 16 },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#C0392B',
        marginBottom: 12
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12
    },
    badge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12
    },
    badgeRed: {
        backgroundColor: '#E74C3C'
    },
    badgeGreen: {
        backgroundColor: '#2ECC71'
    },
    badgeGray: {
        backgroundColor: '#BDC3C7'
    },
    badgeText: {
        color: '#FFF', 
        fontWeight: 'bold',
        fontSize: 14
    },
    stepTextContainer: {
        flex: 1
    },
    stepTitle: {
        fontSize: 15,
        fontWeight:'600', 
        color: '#2C3E50'
    },
    stepSubtitle: {
        fontSize: 12,
        color: '#7F8C8D'
    },
    textMuted: {
        color: '#95A5A6'
    }
});