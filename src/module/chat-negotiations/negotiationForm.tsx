import LicenseInfoModal from './LicenseInfoModal';
// ========================================
// FILE: src/app/chat-negotiations/negotiationForm.tsx
// PURPOSE: Negotiation form for chat
// ========================================

import { CheckCircle, Circle, Info } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DeliveryAddressPicker, { DeliveryQuote } from './DeliveryAddressPicker';
import type { Artwork, ExclusivityType, LicenseType } from './types';

// Retain the form's existing defaults until a settings backend is available.
const platformSettings = {
  platform_fee_percentage: 10,
  license_multipliers: { personal: 1.0, commercial: 1.5 },
  exclusivity_multipliers: { 'non-exclusive': 1.0, exclusive: 1.3, sole: 1.5 },
};


interface NegotiationFormProps {
  artwork: Artwork;
  buyerId: string;
  buyerName: string;
  artistId: string;
  artistName: string;
  chatId: string;
  onSend: (proposal: any) => void | Promise<void>;
  onCancel: () => void;
  revisionId?: number;
  initialDelivery?: { route_id?: number; delivery_address?: string };
}

export default function NegotiationForm({
  artwork,
  buyerId,
  buyerName,
  artistId,
  artistName,
  chatId,
  onSend,
  onCancel,
  initialDelivery,
  revisionId,
}: NegotiationFormProps) {
  const [offer, setOffer] = useState('');
  const [sending, setSending] = useState(false);

  // ========================================
  // GET AVAILABLE OPTIONS FROM ARTWORK
  // ========================================
  const availableLicenses: LicenseType[] = artwork.license_types || ['personal', 'commercial'];
  const availableExclusivity: ExclusivityType[] = artwork.exclusivity_types || ['non-exclusive', 'exclusive', 'sole'];

  // Check if artwork is digital
  const isDigital = artwork.art_type === 'digital';

  // Form state
  const [licenseType, setLicenseType] = useState<'personal' | 'commercial'>(
    availableLicenses.includes('personal') ? 'personal' : availableLicenses[0] || 'personal'
  );
  const [exclusivity, setExclusivity] = useState<'non-exclusive' | 'exclusive' | 'sole'>(
    availableExclusivity.includes('non-exclusive') ? 'non-exclusive' : availableExclusivity[0] || 'non-exclusive'
  );
  const [durationMonths, setDurationMonths] = useState('12');
  const requiresDelivery = !isDigital;
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [royaltyPercentage, setRoyaltyPercentage] = useState('');
  const [isRoyalty, setIsRoyalty] = useState(false);
  const [note, setNote] = useState('');
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);

  // Info popups
  const [showLicenseInfo, setShowLicenseInfo] = useState(false);
  const [showExclusivityInfo, setShowExclusivityInfo] = useState(false);
  const [selectedInfoKey, setSelectedInfoKey] = useState('');
  const [selectedInfoType, setSelectedInfoType] = useState<'license' | 'exclusivity'>('license');

  // Update the price display section with safe formatting
  const formatPrice = (price: any): string => {
    if (price === undefined || price === null) return '0.00';
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(numPrice)) return '0.00';
    return numPrice.toFixed(2);
  };

  // Calculate prices
  const calculatePrices = () => {
    const basePrice = artwork.base_price || 0;
    const settings = platformSettings;
    const licenseMultipliers = settings.license_multipliers || { personal: 1.0, commercial: 1.5 };
    const exclusivityMultipliers = settings.exclusivity_multipliers || { 'non-exclusive': 1.0, exclusive: 1.3, sole: 1.5 };
    
    const licenseMult = licenseMultipliers[licenseType] || 1.0;
    const exclusivityMult = exclusivityMultipliers[exclusivity] || 1.0;
    
    const subtotal = basePrice * licenseMult * exclusivityMult;
    const platformFee = subtotal * (settings.platform_fee_percentage / 100);
    const finalPrice = subtotal + platformFee;
    const deliveryFee = requiresDelivery ? Number(deliveryQuote?.fee || 0) : 0;
    
    return {
      basePrice,
      licenseMultiplier: licenseMult,
      exclusivityMultiplier: exclusivityMult,
      subtotal,
      platformFee,
      finalPrice,
      deliveryFee,
      totalWithDelivery: finalPrice + deliveryFee,
    };
  };

  const prices = calculatePrices();
  const minimumPrice = Number(prices.finalPrice.toFixed(2));
  const invalidOffer = offer.trim().length > 0 && (!Number.isFinite(Number(offer)) || Number(offer) < minimumPrice);
  const offerError = !Number.isFinite(Number(offer))
    ? 'Enter a valid price.'
    : `Price cannot be below PHP ${minimumPrice.toFixed(2)} for the selected license and exclusivity.`;

  const handleSend = async () => {
    console.log('🔵 SEND PROPOSAL PRESSED');
    console.log('🔵 Artwork:', artwork.title);
    console.log('🔵 Artist ID:', artistId);
    console.log('🔵 Buyer ID:', buyerId);
    
    const offeredPrice = offer.trim() ? Number(offer) : Number(prices.finalPrice.toFixed(2));
    if (!Number.isFinite(offeredPrice) || offeredPrice < Number(prices.finalPrice.toFixed(2))) {
      Alert.alert('Price too low', `Minimum price for these terms is PHP ${prices.finalPrice.toFixed(2)}.`);
      return;
    }
    // Validate
    const duration = parseInt(durationMonths);
    
    // ========================================
    // VALIDATION - Duration only for commercial
    // ========================================
    if (licenseType === 'commercial') {
      if (!duration || duration < 1) {
        Alert.alert('Error', 'Please enter a valid duration (minimum 1 month) for commercial license');
        return;
      }
      if (duration > 60) {
        Alert.alert('Error', 'Maximum duration is 60 months (5 years)');
        return;
      }
    }
    
    if (requiresDelivery && !deliveryQuote) {
      Alert.alert('Delivery required', 'Calculate delivery before sending your proposal.');
      return;
    }

    if (isRoyalty && (!royaltyPercentage || !Number.isFinite(Number(royaltyPercentage)) || Number(royaltyPercentage) <= 0 || Number(royaltyPercentage) > 100)) {
      Alert.alert('Error', 'Please enter a valid royalty percentage');
      return;
    }

    // ========================================
    // BUILD PROPOSAL - ONLY INCLUDE FIELDS WITH VALUES
    // ========================================
    const proposal: any = {
      id: `${artwork.id}_${Date.now()}`,
      artworkId: artwork.id.toString(),
      artworkTitle: artwork.title,
      artworkImageUri: artwork.image_base64 || artwork.image_url || '',
      artistId,
      artistName,
      buyerId,
      buyerName,
      licenseType,
      exclusivity,
      basePrice: prices.basePrice,
      platformFee: Number((offeredPrice / 11).toFixed(2)),
      licenseMultiplier: prices.licenseMultiplier,
      exclusivityMultiplier: prices.exclusivityMultiplier,
      finalPrice: offeredPrice,
      requiresDelivery,
      deliveryFee: prices.deliveryFee,
      isRoyalty,
      status: 'pending' as const,
      chatId,
    };

    // ========================================
    // ONLY add duration if license is commercial
    // ========================================
    if (licenseType === 'commercial') {
      proposal.durationMonths = duration;
    }

    // ONLY add deliveryZone and deliveryAddress if requiresDelivery is true
    if (requiresDelivery && deliveryQuote) {
      proposal.deliveryQuote = deliveryQuote.token;
      proposal.delivery_quote = deliveryQuote.token;
      proposal.delivery_quote_token = deliveryQuote.token;
      proposal.quote_token = deliveryQuote.token;
      proposal.deliveryAddress = deliveryQuote.delivery_address;
      proposal.delivery_address = deliveryQuote.delivery_address;
      proposal.delivery_fee = Number(deliveryQuote.fee || 0);
      proposal.fee = Number(deliveryQuote.fee || 0);
      proposal.distance_km = Number(deliveryQuote.distance_km || 5.0);
      proposal.is_priority = Boolean(deliveryQuote.is_priority);
    }

    // ONLY add royaltyPercentage if isRoyalty is true
    if (isRoyalty) {
      proposal.royaltyPercentage = parseFloat(royaltyPercentage);
    }

    // ONLY add note if it has content
    if (note.trim()) {
      proposal.note = note.trim();
    }

    console.log('📤 Proposal data:', JSON.stringify(proposal, null, 2));
    console.log('📤 Calling onSend...');
    
    setSending(true);
    try {
      await onSend(proposal);
    } catch (error) {
      console.error('❌ Error in handleSend:', error);
      Alert.alert('Error', 'Failed to send proposal');
    } finally {
      setSending(false);
    }
  };

  const showInfo = (type: 'license' | 'exclusivity', key: string) => {
    setSelectedInfoType(type);
    setSelectedInfoKey(key);
    if (type === 'license') {
      setShowLicenseInfo(true);
    } else {
      setShowExclusivityInfo(true);
    }
  };

  // Info data
  const licenseInfo = {
    personal: {
      title: 'Personal Use',
      description: 'For personal, non-commercial use only.',
      permitted: [
        'Display in your home or office',
        'Use on personal items',
        'Share with friends and family'
      ],
      restrictions: [
        'No commercial use',
        'No reselling or redistribution',
        'No modification for resale'
      ]
    },
    commercial: {
      title: 'Commercial Use',
      description: 'For commercial purposes like merchandise, advertising, etc.',
      permitted: [
        'Use on products for sale',
        'Use in marketing materials',
        'Use in product packaging'
      ],
      restrictions: [
        'No reselling digital files as standalone items',
        'No claiming ownership',
        'No trademark registration'
      ]
    }
  };

  const exclusivityInfo = {
    'non-exclusive': {
      title: 'Non-Exclusive',
      description: 'Artist can license the same artwork to others.',
      permitted: [
        'Artist can sell to multiple buyers',
        'Buyer can use as specified',
        'Flexible pricing'
      ],
      restrictions: [
        'No exclusivity guarantee',
        'Others may use similar artwork'
      ]
    },
    exclusive: {
      title: 'Exclusive',
      description: 'Artist will not license to anyone else for the duration.',
      permitted: [
        'Exclusive rights',
        'Artist retains own use rights',
        'Higher value'
      ],
      restrictions: [
        'Artist cannot license to others',
        'Higher price point'
      ]
    },
    sole: {
      title: 'Sole',
      description: 'Artist gives up all rights except portfolio use.',
      permitted: [
        'Complete control',
        'Highest exclusivity',
        'Premium pricing'
      ],
      restrictions: [
        'Artist cannot use the artwork',
        'Most expensive option'
      ]
    }
  };

  return (
    <>
    <LicenseInfoModal visible={showLicenseInfo || showExclusivityInfo} onClose={() => { setShowLicenseInfo(false); setShowExclusivityInfo(false); }} data={selectedInfoType === 'license' ? licenseInfo[selectedInfoKey as keyof typeof licenseInfo] || null : exclusivityInfo[selectedInfoKey as keyof typeof exclusivityInfo] || null} />
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Artwork Preview */}
      <View style={styles.preview}>
        <Text style={styles.previewTitle}>{artwork.title}</Text>
        <Text style={styles.previewArtist}>by {artwork.artist_name}</Text>
        <Text style={styles.previewType}>
          {artwork.art_type === 'digital' ? '💻 Digital' : '🖼️ Physical'}
        </Text>
      </View>

      {/* License Type - Only show available from artwork */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>License Type *</Text>
        <Text style={styles.sectionSubtitle}>Choose one option</Text>
        <View style={styles.optionsContainer}>
          {availableLicenses.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                licenseType === option && styles.optionSelected,
              ]}
              onPress={() => setLicenseType(option as any)}
            >
              <View style={styles.optionRow}>
                {licenseType === option ? (
                  <CheckCircle size={20} color="#D48C62" />
                ) : (
                  <Circle size={20} color="#C7C7CC" />
                )}
                <Text style={[
                  styles.optionText,
                  licenseType === option && styles.optionTextSelected
                ]}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                  {option === 'commercial' && ' (×1.5)'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.infoButton}
                onPress={() => showInfo('license', option)}
              >
                <Info size={16} color="#D48C62" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Exclusivity - Only show available from artwork */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Exclusivity *</Text>
        <Text style={styles.sectionSubtitle}>Choose one option</Text>
        <View style={styles.optionsContainer}>
          {availableExclusivity.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.optionButton,
                exclusivity === option && styles.optionSelected,
              ]}
              onPress={() => setExclusivity(option as any)}
            >
              <View style={styles.optionRow}>
                {exclusivity === option ? (
                  <CheckCircle size={20} color="#D48C62" />
                ) : (
                  <Circle size={20} color="#C7C7CC" />
                )}
                <Text style={[
                  styles.optionText,
                  exclusivity === option && styles.optionTextSelected
                ]}>
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                  {option === 'exclusive' && ' (×1.3)'}
                  {option === 'sole' && ' (×1.5)'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.infoButton}
                onPress={() => showInfo('exclusivity', option)}
              >
                <Info size={16} color="#D48C62" />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Duration - Only show for commercial license */}
      {licenseType === 'commercial' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Duration (Months) *</Text>
          <Text style={styles.sectionSubtitle}>Required for commercial license</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter duration in months"
            value={durationMonths}
            onChangeText={setDurationMonths}
            keyboardType="numeric"
            placeholderTextColor="#C7C7CC"
          />
          <Text style={styles.helperText}>Minimum 1 month. Maximum 60 months (5 years).</Text>
        </View>
      )}

      {!isDigital && <DeliveryAddressPicker artworkId={artwork.id} revisionId={revisionId} onQuote={setDeliveryQuote} />}

      {/* Royalty (Commercial only) */}
      {licenseType === 'commercial' && (
        <View style={styles.section}>
          <View style={styles.switchRow}>
            <Text style={styles.sectionTitle}>Royalty Option</Text>
            <Switch
              value={isRoyalty}
              onValueChange={setIsRoyalty}
              trackColor={{ false: '#E5E5EA', true: '#D48C62' }}
            />
          </View>

          {isRoyalty && (
            <TextInput
              style={styles.input}
              placeholder="Royalty percentage (e.g., 5)"
              value={royaltyPercentage}
              onChangeText={setRoyaltyPercentage}
              keyboardType="numeric"
              placeholderTextColor="#C7C7CC"
            />
          )}
        </View>
      )}

      {/* Note */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Note (Optional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add any special conditions or notes..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          placeholderTextColor="#C7C7CC"
        />
      </View>

      {/* Price Breakdown */}
      <TouchableOpacity 
        style={styles.priceToggle}
        onPress={() => setShowPriceBreakdown(!showPriceBreakdown)}
      >
        <Text style={styles.priceToggleText}>View Price Breakdown</Text>
      </TouchableOpacity>

      {showPriceBreakdown && (
        <View style={styles.priceBreakdown}>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Base Price</Text>
            <Text style={styles.priceValue}>₱{formatPrice(prices.basePrice)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>License Multiplier</Text>
            <Text style={styles.priceValue}>×{formatPrice(prices.licenseMultiplier)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Exclusivity Multiplier</Text>
            <Text style={styles.priceValue}>×{formatPrice(prices.exclusivityMultiplier)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Subtotal</Text>
            <Text style={styles.priceValue}>₱{formatPrice(prices.subtotal)}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Platform Fee ({platformSettings?.platform_fee_percentage || 10}%)</Text>
            <Text style={styles.priceValue}>₱{formatPrice(prices.platformFee)}</Text>
          </View>
          {requiresDelivery && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Delivery Fee</Text>
              <Text style={styles.priceValue}>₱{formatPrice(prices.deliveryFee)}</Text>
            </View>
          )}
          <View style={styles.priceDivider} />
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Price</Text>
            <Text style={styles.totalValue}>₱{formatPrice(prices.totalWithDelivery)}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text>Proposed price (PHP), excluding delivery</Text>
        <Text>Minimum including platform fee and selected multipliers: PHP {prices.finalPrice.toFixed(2)}</Text>
        <TextInput accessibilityLabel="Proposed price" accessibilityHint={invalidOffer ? offerError : `Minimum price PHP ${minimumPrice.toFixed(2)}`} value={offer} onChangeText={setOffer} keyboardType="decimal-pad" placeholder={prices.finalPrice.toFixed(2)} style={[styles.offerInput, invalidOffer && styles.offerInputError]} />
        {invalidOffer && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.offerError}>{offerError}</Text>}
      </View>
      <Text style={styles.totalLabel}>{requiresDelivery && !deliveryQuote ? 'Calculate delivery to see the total.' : `Total including delivery: PHP ${((offer.trim() && Number.isFinite(Number(offer)) ? Number(offer) : minimumPrice) + prices.deliveryFee).toFixed(2)}`}</Text>
      {/* Actions */}
      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.sendButton, (sending || invalidOffer || (requiresDelivery && !deliveryQuote)) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending || invalidOffer || (requiresDelivery && !deliveryQuote)}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send Proposal</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  addressDisplay: { fontSize: 14, color: '#333', lineHeight: 22, paddingVertical: 8 },
  offerInput: { borderWidth: 1, borderColor: '#ccc', padding: 12, borderRadius: 8, backgroundColor: '#fff', marginTop: 8 },
  offerInputError: { borderWidth: 2, borderColor: '#DC2626', color: '#B91C1C', backgroundColor: '#FFF5F5', boxShadow: '0 0 8px rgba(220, 38, 38, 0.4)' },
  offerError: { color: '#B91C1C', fontSize: 12, marginTop: 7, lineHeight: 18 },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 12,
  },
  preview: {
    padding: 12,
    backgroundColor: '#F8F8FC',
    borderRadius: 10,
    marginBottom: 16,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  previewArtist: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2,
  },
  previewType: {
    fontSize: 12,
    color: '#D48C62',
    marginTop: 2,
    fontWeight: '500',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 8,
  },
  optionsContainer: {
    gap: 8,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
  },
  optionSelected: {
    borderColor: '#D48C62',
    backgroundColor: '#FDF6F0',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  optionText: {
    fontSize: 14,
    color: '#000',
  },
  optionTextSelected: {
    color: '#D48C62',
    fontWeight: '500',
  },
  infoButton: {
    padding: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 11,
    color: '#8E8E93',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  zoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    borderRadius: 8,
    backgroundColor: '#FAFAFA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  zoneSelected: {
    borderColor: '#D48C62',
    backgroundColor: '#FDF6F0',
  },
  zoneText: {
    fontSize: 14,
    color: '#000',
  },
  zoneTextSelected: {
    color: '#D48C62',
    fontWeight: '500',
  },
  zoneFee: {
    fontSize: 14,
    color: '#8E8E93',
  },
  priceToggle: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  priceToggleText: {
    fontSize: 14,
    color: '#D48C62',
    fontWeight: '500',
  },
  priceBreakdown: {
    backgroundColor: '#F8F8FC',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  priceLabel: {
    fontSize: 13,
    color: '#555',
  },
  priceValue: {
    fontSize: 13,
    color: '#000',
  },
  priceDivider: {
    height: 1,
    backgroundColor: '#E5E5EA',
    marginVertical: 6,
  },
  totalRow: {
    paddingVertical: 6,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#D48C62',
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5EA',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8E8E93',
  },
  sendButton: {
    flex: 2,
    backgroundColor: '#D48C62',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.6,
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
