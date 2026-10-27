import FloatingProgressTracker from './FloatingProgressTracker';
import { Text, TextInput } from '@/components/Typography';
import NegotiationSection, { NegotiationSectionsContext, RequiredMark } from './NegotiationSection';
import CommissionNegotiationForm from './CommissionNegotiationForm';
import API_URL from '@/services/api';
import NegotiationPresets from './NegotiationPresets';
import CopyrightTransferFields from './CopyrightTransferFields';
import PricingFields from './PricingFields';
import LicenseScopeFields, { defaultScope, LicenseScope } from './LicenseScopeFields';
import type { Contract } from './contracts';
import { CompensationSettings, CompensationCategory, CompensationTerms, compensationError } from './compensation';
import InfoAccordion from './InfoAccordion';
// ========================================
// FILE: src/app/chat-negotiations/negotiationForm.tsx
// PURPOSE: Negotiation form for chat
// ========================================

import { CheckCircle, Circle, Info } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import DeliveryAddressPicker, { DeliveryQuote } from './DeliveryAddressPicker';
import type { Artwork, ExclusivityType, LicenseType } from './types';

// Retain the form's existing defaults until a settings backend is available.
const platformSettings = {
  platform_fee_percentage: 10,
  license_multipliers: { personal: 1.0, commercial: 1.5 },
  exclusivity_multipliers: { 'non-exclusive': 1.0, exclusive: 1.5, sole: 1.3 },
};


interface NegotiationFormProps {
  commissionMode?: boolean;
  commissionShippingFee?: number;
  artwork: Artwork;
  buyerId: string;
  buyerName: string;
  artistId: string;
  artistName: string;
  chatId: string;
  onSend: (proposal: any) => void | Promise<void>;
  onCancel: () => void;
  initialProposal?: Contract;
  revisionId?: number;
  initialDelivery?: { route_id?: number; delivery_address?: string };
}

function ArtworkNegotiationForm({
  artwork,
  buyerId,
  buyerName,
  artistId,
  artistName,
  chatId,
  onSend,
  onCancel,
  initialDelivery,
  initialProposal,
  revisionId,
}: NegotiationFormProps) {
  const [royaltyEnabled, setRoyaltyEnabled] = useState(!!artwork.royalty_enabled);
  useEffect(() => setRoyaltyEnabled(!!artwork.royalty_enabled), [artwork.royalty_enabled]);
  const [offer, setOffer] = useState(initialProposal ? initialProposal.pricing_terms?.license_fee || ((Number(initialProposal.price) - Number(initialProposal.delivery_fee || 0)) / 1.1).toFixed(2) : '');
  const [pricingMode, setPricingMode] = useState<'multipliers' | 'fixed'>(initialProposal?.pricing_terms?.mode || (initialProposal ? 'fixed' : 'multipliers'));
  const [licenseFactor, setLicenseFactor] = useState(initialProposal?.pricing_terms?.license_multiplier || String(platformSettings.license_multipliers[initialProposal?.license_type || (artwork.license_types?.includes('personal') !== false ? 'personal' : 'commercial')]));
  const [exclusivityFactor, setExclusivityFactor] = useState(initialProposal?.pricing_terms?.exclusivity_multiplier || String(platformSettings.exclusivity_multipliers[(initialProposal?.exclusivity?.replace('_', '-') || artwork.exclusivity_types?.[0] || 'non-exclusive') as ExclusivityType]));
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ========================================
  // GET AVAILABLE OPTIONS FROM ARTWORK
  // ========================================
  const availableLicenses: LicenseType[] = artwork.license_types || ['personal', 'commercial'];
  const availableExclusivity: ExclusivityType[] = artwork.exclusivity_types || ['non-exclusive', 'exclusive', 'sole'];

  // Check if artwork is digital
  const isDigital = artwork.art_type === 'digital';

  // Form state
  const [licenseType, setLicenseType] = useState<'personal' | 'commercial'>(
    initialProposal?.license_type || (availableLicenses.includes('personal') ? 'personal' : availableLicenses[0] || 'personal')
  );
  const [exclusivity, setExclusivity] = useState<'non-exclusive' | 'exclusive' | 'sole'>(
    (initialProposal?.exclusivity?.replace('_', '-') as ExclusivityType) || (availableExclusivity.includes('non-exclusive') ? 'non-exclusive' : availableExclusivity[0] || 'non-exclusive')
  );
  const [durationMonths, setDurationMonths] = useState(String(initialProposal?.license_scope?.duration_months || initialProposal?.compensation_terms?.reporting_duration_months || 12));
  const requiresDelivery = !isDigital;
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [compensationCategory, setCompensationCategory] = useState<CompensationCategory>(initialProposal?.compensation_type || 'one_time');
  const [compensationTerms, setCompensationTerms] = useState<CompensationTerms>(initialProposal?.compensation_terms?.subtype ? initialProposal.compensation_terms : { subtype: 'one_time_payment' });
  const effectiveCategory = licenseType === 'commercial' ? compensationCategory : 'one_time';
  const effectiveTerms = licenseType === 'commercial' ? compensationTerms : { subtype: 'one_time_payment' };
  const [licenseScope, setLicenseScope] = useState<LicenseScope>(initialProposal?.license_scope?.uses ? initialProposal.license_scope : defaultScope);
  const [resaleRights, setResaleRights] = useState<any>(null);
  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/blockchain/artworks/${artwork.id}/provenance/`).then(async response => {
      if (!response.ok) return;
      const record = await response.json();
      if (!active || !record.rights) return;
      setResaleRights(record.rights);
      if (!initialProposal) {
        setLicenseType(record.rights.license_type);
        setExclusivity('exclusive');
        if (record.rights.scope?.uses) {
          setLicenseScope(record.rights.scope);
          setDurationMonths(String(record.rights.scope.duration_months));
        } else {
          const duration = record.rights.duration_months || 12;
          setLicenseScope({ ...defaultScope, allow_resale: record.rights.allow_resale === true, duration_months: duration });
          setDurationMonths(String(duration));
        }
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [artwork.id]);
  const [note, setNote] = useState('');
  const [showPriceBreakdown, setShowPriceBreakdown] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const trackerWide = availableWidth >= 980;
  const sectionPositions = useRef<Record<string, number>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ presets: false });
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const openSection = (id: string) => {
    setCollapsed(previous => ({ ...previous, [id]: false }));
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, (sectionPositions.current[id] || 0) - 16), animated: true }), 160);
  };


  // Info popups

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

    const licenseMult = Number(licenseFactor);
    const exclusivityMult = Number(exclusivityFactor);

    const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
    const subtotal = pricingMode === 'fixed' ? Number(offer) : roundMoney(basePrice * licenseMult * exclusivityMult);
    const finalPrice = roundMoney(subtotal * (1 + settings.platform_fee_percentage / 100));
    const platformFee = roundMoney(finalPrice - finalPrice / 1.1);

    const baseDeliveryFee = requiresDelivery ? Number(deliveryQuote?.base_fee ?? (deliveryQuote?.is_priority ? Math.max(0, (deliveryQuote?.fee || 0) - 40) : (deliveryQuote?.fee || 0))) : 0;
    const priorityFee = requiresDelivery && deliveryQuote?.is_priority ? 40 : 0;
    const totalDeliveryFee = baseDeliveryFee + priorityFee;

    return {
      basePrice,
      licenseMultiplier: licenseMult,
      exclusivityMultiplier: exclusivityMult,
      subtotal,
      platformFee,
      finalPrice,
      baseDeliveryFee,
      priorityFee,
      deliveryFee: totalDeliveryFee,
      totalWithDelivery: finalPrice + totalDeliveryFee,
    };
  };

  const prices = calculatePrices();
  const validNumber = (text: string, maximum: number) => /^\d+(\.\d{1,2})?$/.test(text) && Number(text) > 0 && Number(text) <= maximum;
  const invalidOffer = pricingMode === 'fixed' ? !validNumber(offer, 9999999999.99) : !validNumber(licenseFactor, 100) || !validNumber(exclusivityFactor, 100);
  const minimumCheckout = Math.round((prices.basePrice + Number.EPSILON) * 100) / 100;
  const belowBasePrice = prices.finalPrice < minimumCheckout;
  const invalidPricing = belowBasePrice || invalidOffer || !Number.isFinite(prices.finalPrice) || prices.finalPrice <= 0 || prices.finalPrice > 9999999999.99;
  const offerError = belowBasePrice ? `Minimum artwork checkout is PHP ${minimumCheckout.toFixed(2)} (artwork base price), excluding delivery.` : pricingMode === 'fixed' ? 'Enter a positive fixed license fee with up to two decimal places.' : 'Enter multipliers greater than zero and no more than 100, with up to two decimal places.';

  const transfer = licenseScope.copyright_transfer;
  const sectionIssues: Record<string, string> = {};
  if (!availableLicenses.includes(licenseType)) sectionIssues.license = 'Choose a license type.';
  if (!availableExclusivity.includes(exclusivity)) sectionIssues.exclusivity = 'Choose an exclusivity option.';
  if (transfer && (!transfer.acknowledged || !transfer.rights.length || !transfer.existing_commitments.trim() || !transfer.artist_reserved_uses.trim() || !transfer.additional_terms.trim())) sectionIssues.copyright = 'Complete the assignment rights, commitments, reserved uses, conditions and acknowledgement.';
  if (!licenseScope.uses.length || (licenseScope.territory === 'custom' && !licenseScope.territory_details.trim()) || (licenseType === 'commercial' && !licenseScope.products.trim())) sectionIssues.permissions = 'Select permitted uses and complete the territory and licensed products or media.';
  const duration = Number(durationMonths);
  if (!Number.isInteger(duration) || duration < 1 || duration > 60) sectionIssues.duration = 'Enter a duration of 1 to 60 whole months.';
  if (requiresDelivery && !deliveryQuote) sectionIssues.delivery = 'Calculate and confirm a delivery quote.';
  const compensationValidation = compensationError(effectiveCategory, { ...effectiveTerms, reporting_duration_months: duration }, prices.finalPrice);
  if (compensationValidation || (effectiveCategory !== 'one_time' && !royaltyEnabled)) sectionIssues.compensation = compensationValidation || 'Royalty access approval is required.';
  if (invalidPricing) sectionIssues.pricing = offerError;
  const requiredSections = [
    ['license', 'License type'], ['exclusivity', 'Exclusivity'],
    ...(transfer ? [['copyright', 'Copyright assignment']] : []),
    ['permissions', 'Permissions'], ['duration', 'Duration'],
    ...(requiresDelivery ? [['delivery', 'Delivery']] : []),
    ...(licenseType === 'commercial' ? [['compensation', 'Compensation']] : []), ['pricing', 'Pricing'],
  ];
  const completed = Object.fromEntries(requiredSections.map(([id]) => [id, !sectionIssues[id]]));
  const handleSend = async () => {
    setSubmitError('');
    setAttemptedSubmit(true);
    const firstMissing = requiredSections.find(([id]) => sectionIssues[id]);
    if (firstMissing) { setSubmitError('Complete the highlighted required section before sending.'); openSection(firstMissing[0]); return; }
    const offeredPrice = prices.finalPrice;

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
      durationMonths: duration,
      licenseScope: { ...licenseScope, duration_months: duration, uses: licenseScope.uses.filter(x => licenseType === 'commercial' || ['personal_display', 'social_media'].includes(x)) },
      exclusivity,
      basePrice: prices.basePrice,
      platformFee: prices.platformFee,
      pricingTerms: pricingMode === 'fixed' ? { mode: 'fixed', fixed_fee: offer } : { mode: 'multipliers', license_multiplier: String(prices.licenseMultiplier), exclusivity_multiplier: String(prices.exclusivityMultiplier) },
      licenseMultiplier: prices.licenseMultiplier,
      exclusivityMultiplier: prices.exclusivityMultiplier,
      finalPrice: offeredPrice,
      requiresDelivery,
      deliveryFee: prices.deliveryFee,
      isRoyalty: effectiveCategory !== 'one_time',
      compensationCategory: effectiveCategory,
      compensationTerms: { ...effectiveTerms, reporting_duration_months: Number(durationMonths) },
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

    // ONLY add note if it has content
    if (note.trim()) {
      proposal.note = note.trim();
    }




    setSending(true);
    try {
      await onSend(proposal);
    } catch (error) {

      setSubmitError(error instanceof Error ? error.message : 'Failed to send proposal.');
    } finally {
      setSending(false);
    }
  };

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
      description: 'Only the buyer may use the licensed rights. The artist cannot use those same rights or license them to others during the agreed term and within the agreed territory. The artist keeps copyright.',
      permitted: [
        'Buyer may exercise the rights expressly granted in the agreement',
        'Artist may still display the work in their portfolio and promotional materials, as reserved in the agreement'
      ],
      restrictions: [
        'Artist cannot exercise the same licensed rights within the agreed scope, territory and term, except for expressly reserved uses',
        'Artist cannot grant those same rights to another buyer',
        'This license does not transfer copyright ownership'
      ]
    },
    sole: {
      title: 'Sole',
      description: 'The buyer is the only licensee, but the artist may also use the licensed rights themselves. The artist cannot license those same rights to other buyers within the agreed territory and term. The artist keeps copyright.',
      permitted: [
        'Buyer may exercise the rights expressly granted in the agreement',
        'Artist may continue their own use, including commercial use where applicable'
      ],
      restrictions: [
        'Artist cannot grant those same rights to another buyer within the agreed scope, territory and term',
        'Buyer does not have exclusive use against the artist',
        'This license does not transfer copyright ownership'
      ]
    }
  };

  return (
    <>
    <NegotiationSectionsContext.Provider value={{ collapsed, toggle: id => setCollapsed(previous => ({ ...previous, [id]: !(previous[id] ?? true) })), positions: (id, y) => { sectionPositions.current[id] = y; }, errors: attemptedSubmit ? sectionIssues : {}, completed }}>
    <View onLayout={event => setAvailableWidth(event.nativeEvent.layout.width)} style={{ flex: 1, flexDirection: 'row', position: 'relative', backgroundColor: '#F8F5F1' }}>
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>
      {/* Artwork Preview */}
      <View style={styles.preview}>
        <Text style={styles.previewTitle}>{artwork.title}</Text>
        <Text style={styles.previewArtist}>by {artwork.artist_name}</Text>
        <Text style={styles.previewType}>
          {artwork.art_type === 'digital' ? 'Digital' : 'Physical'}
        </Text>
      </View>

      <NegotiationSection id="presets" title="Quick presets"><NegotiationPresets licenses={availableLicenses} exclusivities={availableExclusivity} royaltyEnabled={royaltyEnabled} onApply={preset => {
        setLicenseType(preset.license); setExclusivity(preset.exclusivity);
        setLicenseScope({ ...preset.scope, uses: [...preset.scope.uses] });
        setDurationMonths(String(preset.scope.duration_months));
        setCompensationCategory(preset.compensation); setCompensationTerms({ ...preset.terms });
        setPricingMode('multipliers'); setLicenseFactor(preset.licenseFactor); setExclusivityFactor(preset.exclusivityFactor);
        setOffer(''); setSubmitError(''); setAttemptedSubmit(false); setCollapsed({ presets: true, permissions: preset.license !== 'commercial' });
      }} /></NegotiationSection>
      {/* License Type - Only show available from artwork */}
      {!!resaleRights && <View style={styles.section}><Text style={{ fontWeight: '700' }}>Authorized exclusive resale</Text><Text>The original license scope and expiry must remain unchanged. Creator attribution is preserved. The backend checks these restrictions before payment.</Text></View>}
      <NegotiationSection id="license" title="License type" required>

        <Text style={styles.sectionDescription}>Choose how you plan to use the artwork. Your license defines the uses allowed under this agreement.</Text>
        <Text style={styles.sectionSubtitle}>Choose the rights that fit your agreement. Expand any option for permitted uses and restrictions.</Text>
        <View style={styles.optionsContainer}>
          {availableLicenses.map(option => {
            const details = licenseInfo[option as keyof typeof licenseInfo];
            return <InfoAccordion key={option} {...details} selected={licenseType === option} onSelect={() => { setLicenseType(option as any); setLicenseFactor(String(platformSettings.license_multipliers[option as LicenseType])); if (option === 'personal') setLicenseScope({ ...licenseScope, uses: licenseScope.uses.filter(x => ['personal_display', 'social_media'].includes(x)) }); }} />;
          })}
        </View>
      </NegotiationSection>

      {/* Exclusivity - Only show available from artwork */}
      <NegotiationSection id="exclusivity" title="Exclusivity" required>

        <Text style={styles.sectionSubtitle}>Decide who else may use the licensed rights during the agreed term.</Text>
        <View style={styles.optionsContainer}>
          {availableExclusivity.map(option => {
            const details = exclusivityInfo[option as keyof typeof exclusivityInfo];
            return <InfoAccordion key={option} {...details} selected={exclusivity === option} onSelect={() => { setExclusivity(option as any); setExclusivityFactor(String(platformSettings.exclusivity_multipliers[option as ExclusivityType])); }} />;
          })}
        </View>
      </NegotiationSection>

      <NegotiationSection id="copyright" title="Copyright ownership" required={!!transfer}><CopyrightTransferFields value={licenseScope.copyright_transfer} onChange={copyright_transfer => setLicenseScope({ ...licenseScope, copyright_transfer })} /></NegotiationSection>
      <NegotiationSection id="permissions" title="License permissions" required><LicenseScopeFields value={licenseScope} commercial={licenseType === 'commercial'} onChange={setLicenseScope} /></NegotiationSection>
      {(
        <NegotiationSection id="duration" title="License duration" required>

          <InfoAccordion title="License duration" description="Choose 1 to 60 whole months from the later signature date. The agreed term limits the license; royalty reporting uses the same duration. Renewal requires written agreement. Statutory rights and outstanding payment obligations are not waived when the term ends." />
          <Text style={styles.sectionSubtitle}>Starts on the later signature date; renewal requires written agreement</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter duration in months"
            value={durationMonths}
            onChangeText={setDurationMonths}
            keyboardType="numeric"
            placeholderTextColor="#C7C7CC"
          />
          <Text style={styles.helperText}>Minimum 1 month. Maximum 60 months (5 years).</Text>
        </NegotiationSection>
      )}

      {!isDigital && <NegotiationSection id="delivery" title="Delivery" required><DeliveryAddressPicker artworkId={artwork.id} revisionId={revisionId} onQuote={setDeliveryQuote} /></NegotiationSection>}

      {licenseType === 'commercial' && <NegotiationSection id="compensation" title="Compensation" required>
        <CompensationSettings expectedTotal={prices.finalPrice} enabled={royaltyEnabled} onAccessChange={setRoyaltyEnabled} category={compensationCategory} terms={{ ...compensationTerms, reporting_duration_months: Number(durationMonths) }} onChange={(category, terms) => { setCompensationCategory(category); setCompensationTerms(terms); if (terms.reporting_duration_months !== undefined) setDurationMonths(String(terms.reporting_duration_months)); }} />
      </NegotiationSection>}

      {/* Note */}
      <NegotiationSection id="notes" title="Additional notes">

        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Add any special conditions or notes..."
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          placeholderTextColor="#C7C7CC"
        />
      </NegotiationSection>

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
            <>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Delivery Fee</Text>
                <Text style={styles.priceValue}>₱{formatPrice(prices.baseDeliveryFee)}</Text>
              </View>
              {prices.priorityFee > 0 && (
                <View style={styles.priceRow}>
                  <Text style={[styles.priceLabel, { color: '#BC5454', fontWeight: '600' }]}>Priority Delivery Rush</Text>
                  <Text style={[styles.priceValue, { color: '#BC5454', fontWeight: '600' }]}>+₱{formatPrice(prices.priorityFee)}</Text>
                </View>
              )}
            </>
          )}
          <View style={styles.priceDivider} />
          <View style={[styles.priceRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total Price</Text>
            <Text style={styles.totalValue}>₱{formatPrice(prices.totalWithDelivery)}</Text>
          </View>
        </View>
      )}

      <NegotiationSection id="pricing" title="Negotiated pricing" required><PricingFields mode={pricingMode} onMode={mode => { if (mode === 'fixed' && !offer) setOffer(prices.subtotal.toFixed(2)); setPricingMode(mode); }} license={licenseFactor} exclusivity={exclusivityFactor} fixed={offer} onLicense={setLicenseFactor} onExclusivity={setExclusivityFactor} onFixed={setOffer} base={prices.basePrice} subtotal={prices.subtotal} fee={prices.platformFee} total={prices.finalPrice} error={invalidPricing ? offerError : undefined} /></NegotiationSection>
      <Text style={styles.totalLabel}>
        {requiresDelivery && !deliveryQuote
          ? 'Calculate delivery to see the total.'
          : `Total including delivery: PHP ${formatPrice(
              prices.finalPrice +
                prices.deliveryFee
            )}`}
      </Text>
      {!!submitError && <Text accessibilityRole="alert" style={styles.offerError}>{submitError}</Text>}
      {/* Actions */}
      <View style={styles.actionContainer}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendButton, sending && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendButtonText}>Send Proposal</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
    <View style={trackerWide ? { width: 240, paddingTop: 16, paddingRight: 12 } : { position: 'absolute', right: 16, bottom: 16, zIndex: 50 }}>
      <FloatingProgressTracker sections={requiredSections} completed={completed} errors={sectionIssues} attempted={attemptedSubmit} desktop={trackerWide} onSelect={openSection}
        onCollapseAll={() => setCollapsed(Object.fromEntries(['presets', 'license', 'exclusivity', 'copyright', 'permissions', 'duration', 'delivery', 'compensation', 'notes', 'pricing'].map(id => [id, true])))}
        onExpandAll={() => setCollapsed(Object.fromEntries(['presets', 'license', 'exclusivity', 'copyright', 'permissions', 'duration', 'delivery', 'compensation', 'notes', 'pricing'].map(id => [id, false])))} />
    </View>
    </View>
    </NegotiationSectionsContext.Provider>
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
    backgroundColor: '#F8F5F1',
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
    marginBottom: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EAE2DA',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#382C26',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#81756D',
    lineHeight: 19,
    marginBottom: 8,
  },
  sectionDescription: { fontSize: 13, lineHeight: 19, color: '#666', marginBottom: 8 },
  licenseCopy: { flex: 1, gap: 3 },
  licenseDescription: { fontSize: 12, lineHeight: 18, color: '#666' },
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

export default function NegotiationForm(props: NegotiationFormProps) {
  return props.commissionMode ? <CommissionNegotiationForm {...props} /> : <ArtworkNegotiationForm {...props} />;
}
