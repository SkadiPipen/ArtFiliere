import CommissionDeliveryPanel from './CommissionDeliveryPanel';
import ProvenancePanel from '@/module/blockchain/ProvenancePanel';
import { auth } from '@/firebase/config';
import SigningModal from '@/module/chat-negotiations/SigningModal';
import { ChatModal } from '@/module/chat-negotiations/chatModal';
import { CompensationSettings } from '@/module/chat-negotiations/compensation';
import API_URL from '@/services/api';
import { openPaymentCheckout, preparePaymentWindow } from '@/services/paymentReturn';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AvailabilityCalendar from './AvailabilityCalendar';
import ResaleRoyaltyPolicy from './ResaleRoyaltyPolicy';

export async function commissionApi(path: string, body?: any) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please sign in.');
  const multipart = body instanceof FormData;
  const response = await fetch(`${API_URL}/api/commissions/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || JSON.stringify(data));
  return data;
}

function Button({
  text,
  onPress,
  disabled,
  variant = 'primary',
  style,
}: {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  style?: any;
}) {
  const isSecondary = variant === 'secondary';
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.buttonBase,
        isSecondary ? styles.buttonSecondary : styles.buttonPrimary,
        disabled && styles.buttonDisabled,
        style,
      ]}
    >
      <Text style={[styles.buttonText, isSecondary && styles.buttonSecondaryText]}>{text}</Text>
    </TouchableOpacity>
  );
}

export default function CommissionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWebWide = width >= 1024;

  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [paymentNotice, setPaymentNotice] = useState('');
  const loadInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [signing, setSigning] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [counter, setCounter] = useState<any>(null);
  const [standardResaleRate, setStandardResaleRate] = useState<string | null>(null);
  useEffect(() => { void commissionApi('policy/').then(policy => setStandardResaleRate(policy.resale_royalty_percentage == null ? null : String(policy.resale_royalty_percentage))).catch(() => {}); }, []);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [revisionReplies, setRevisionReplies] = useState<Record<number, string>>({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState('');
  const [payout, setPayout] = useState<Record<string, string>>({ routing_type: 'WALLET', routing_value: 'PH_GCASH' });
  const [payoutInfo, setPayoutInfo] = useState<any>(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutChecking, setPayoutChecking] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('');
  const [payoutError, setPayoutError] = useState('');
  const keepSavedAccount = !!payoutInfo?.configured && payout.routing_type === payoutInfo.fields?.routing_type && payout.routing_value?.trim().toUpperCase() === payoutInfo.fields?.routing_value;
  const [resalePrice, setResalePrice] = useState('');

  // Expand/collapse state for milestone cards
  const [expandedMilestones, setExpandedMilestones] = useState<Record<number, boolean>>({});

  const toggleMilestone = (mId: number) => {
    setExpandedMilestones((prev) => ({ ...prev, [mId]: !prev[mId] }));
  };

  const load = useCallback(async () => {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    try {
      const snapshot = await commissionApi(`flow/${id}/`);
      setData(snapshot);
      if (snapshot.funding_pending && snapshot.status === 'AWAITING_FUNDS') {
        setPaymentNotice('Checking payment confirmation with Xendit…');
        try {
          const verified = await commissionApi(`flow/${id}/`, { action: 'refresh_payment' });
          setData(verified);
          setPaymentNotice(verified.funded_at ? '' : 'Xendit has not confirmed payment yet. Complete checkout; this page checks automatically.');
        } catch {
          setPaymentNotice('Payment confirmation could not be checked. This page will retry automatically, or use Refresh payment status.');
        }
      } else setPaymentNotice('');
    } catch (e: any) {
      setError(e.message);
    } finally { loadInFlight.current = false; }
  }, [id]);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    const onFocus = () => { void load(); };
    if (Platform.OS === 'web') window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer); subscription.remove();
      if (Platform.OS === 'web') window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!data?.is_artist) return;
    let active = true;
    setPayoutLoading(true); setPayoutError('');
    commissionApi('payout-profile/').then(result => {
      if (active) { setPayout(result.fields); setPayoutInfo(result); }
    }).catch((e: any) => { if (active) setPayoutError(e.message); })
      .finally(() => { if (active) setPayoutLoading(false); });
    return () => { active = false; };
  }, [data?.is_artist, data?.artist_id]);

  const savePayout = async () => {
    setPayoutSaving(true); setPayoutError(''); setPayoutMessage('');
    try {
      const result = await commissionApi('payout-profile/', payout);
      setPayout(result.fields); setPayoutInfo(result);
      setPayoutMessage('Recipient saved for future Xendit milestone payouts. Destination validation occurs when Xendit processes the payout.');
    } catch (e: any) { setPayoutError(e.message); }
    finally { setPayoutSaving(false); }
  };

  const checkPayoutConnection = async () => {
    setPayoutChecking(true); setPayoutError('');
    try {
      const result = await commissionApi('payout-profile/?check_connection=1');
      setPayoutInfo(result); // Connection checks never overwrite unsaved form edits.
    } catch (e: any) { setPayoutError(e.message); }
    finally { setPayoutChecking(false); }
  };

  const action = async (action: string, extra: any = {}) => {
    const paymentTab = action === 'fund' ? preparePaymentWindow() : null;
    let opened = false;
    setBusy(true);
    setError('');
    try {
      const result = await commissionApi(`flow/${id}/`, { action, version: data.proposal?.version, ...extra });
      if (action === 'fund') {
        if (!result.checkout_url) throw new Error('Checkout could not be confirmed. Retry to reconcile the same payment reference.');
        await openPaymentCheckout(result.checkout_url, 'commission', Number(id), paymentTab);
        opened = true;
        void load();
      } else { setData(result); if (action === 'refresh_payment') setPaymentNotice(result.funded_at ? '' : 'Xendit has not confirmed payment yet. Complete checkout; this page checks automatically.'); }
      setCounter(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      if (!opened) paymentTab?.close();
      setBusy(false);
    }
  };

  const upload = async (milestone: any) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const body = new FormData();
      body.append('action', 'submit');
      body.append('milestone_id', String(milestone.id));
      if (Platform.OS === 'web') body.append('file', await (await fetch(file.uri)).blob(), file.name);
      else body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      setBusy(true);
      setError('');
      setData(await commissionApi(`flow/${id}/`, body));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const file = async (submission: any, inspect: boolean) => {
    setError('');
    try {
      const url = `${API_URL}/api/commissions/flow/${id}/files/${submission.id}/${inspect ? '?preview=1' : ''}`;
      const token = await auth.currentUser?.getIdToken();
      if (Platform.OS === 'web') {
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error((await response.json()).detail || 'File unavailable.');
        const blob = await response.blob();
        if (inspect && submission.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = () => setPreview(String(reader.result));
          reader.readAsDataURL(blob);
        } else {
          const objectURL = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = objectURL;
          link.download = submission.name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
        }
      } else {
        const fs = await import('expo-file-system/legacy');
        const sharing = await import('expo-sharing');
        const path = `${fs.cacheDirectory}commission-${id}-${submission.id}${inspect ? '-preview' : ''}.${submission.type.split('/')[1]}`;
        const result = await fs.downloadAsync(url, path, { headers: { Authorization: `Bearer ${token}` } });
        if (result.status !== 200) throw new Error('File unavailable.');
        if (inspect && submission.type.startsWith('image/')) setPreview(path);
        else await sharing.shareAsync(path, { mimeType: submission.type });
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.topBar}>
        <TouchableOpacity activeOpacity={0.8} onPress={() => router.replace('/commissions')} style={styles.backButton}>
          <Text style={styles.backButtonText}> Back to commissions</Text>
        </TouchableOpacity>
        {data && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{data.status}</Text>
          </View>
        )}
      </View>

      {!!error && (
        <View style={styles.errorBanner}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!data ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#C15656" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.mainScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.contentContainer}>

            {/* ROW 1: PORTRAIT COMMISSION (LEFT) & PROPOSAL VERSION (RIGHT) */}
            <View style={[styles.topRowWrapper, isWebWide ? styles.rowLayout : styles.columnLayout]}>

              {/* Left: Portrait Commission */}
              <View style={[styles.topColumn, isWebWide && styles.flexHalf]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.colHeaderTitle}>Portrait commission</Text>
                </View>
                <View style={styles.card}>
                  <Text style={styles.titleText}>{data.title}</Text>
                  <Text style={styles.subtitleText}>{data.status} · {data.artist} / {data.buyer}</Text>
                  <Text style={styles.bodyText}>{data.description}</Text>
                  <Text style={styles.bodyMuted}>References below:</Text>

                  {data.reference_images?.map((uri: string, index: number) => (
                    <View key={index} style={styles.imageWrapper}>
                      <Image source={{ uri }} style={styles.refImage} resizeMode="contain" />
                    </View>
                  ))}

                  {['STAGE_1', 'STAGE_2', 'STAGE_3'].includes(data.status) && (
                    <View style={styles.chatButtonRow}>
                      <Button text="Open commission chat" onPress={() => setChatOpen(true)} />
                    </View>
                  )}

                  {data.disputed && (
                    <View style={styles.disputeNoticeBox}>
                      <Text style={styles.disputeText}>Unreleased funds frozen for Customer Service review.</Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Right: Proposal Version (Scrollable Box, Plain Background, Signed PDF Button inside) */}
              <View style={[styles.topColumn, isWebWide && styles.flexHalf]}>
                <View style={styles.cardHeader}>
                  <Text style={styles.colHeaderTitle}>Proposal version</Text>
                </View>
                <View style={[styles.card, styles.scrollableProposalCard]}>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.proposalScrollContainer} contentContainerStyle={{ gap: 12 }}>

                    {data.proposal ? (
                      <>
                        <Text style={styles.sectionHeading}>
                          Proposal version {data.proposal.version} · {data.proposal.status}
                        </Text>

                        {/* Plain text styling without extra backgrounds */}
                        <View style={{ gap: 6 }}>
                          {Object.entries(data.proposal.terms).filter(([key]) => !['compensation_terms', 'delivery_quote', 'delivery_details'].includes(key)).map(([key, value]) => (
                            <Text key={key} style={styles.bodyText}>
                              <Text style={{ fontWeight: '700' }}>{key.replace(/_/g, ' ')}: </Text>
                              {Array.isArray(value) ? value.join(' / ') : String(value)}
                            </Text>
                          ))}
                        </View>

                        {data.proposal.terms.delivery_details?.delivery_snapshot && <View style={{ gap: 6 }}>
                          <Text style={styles.boldText}>Delivery destination · artist confirmation</Text>
                          {['street', 'barangay', 'city', 'province', 'region', 'postal_code'].map(field => <Text key={field} style={styles.bodyText}>{field.replace('_', ' ')}: {data.proposal.terms.delivery_details.delivery_snapshot[field]}</Text>)}
                          <Text style={styles.bodyText}>Recipient: {data.proposal.terms.delivery_details.recipient_name} · {data.proposal.terms.delivery_details.recipient_phone}</Text>
                          <Text style={styles.bodyText}>Driver route: {data.proposal.terms.delivery_details.distance_km} km · Base PHP {data.proposal.terms.delivery_details.base_fare} + distance PHP {data.proposal.terms.delivery_details.distance_fee} = PHP {data.proposal.terms.delivery_fee}</Text>
                        </View>}
                        {data.proposal.terms.compensation_terms && <View style={{ gap: 6 }}><Text style={styles.boldText}>Commercial compensation terms</Text>{Object.entries(data.proposal.terms.compensation_terms).map(([key, value]) => <Text key={key} style={styles.bodyText}>{key.replace(/_/g, ' ')}: {typeof value === 'object' ? JSON.stringify(value) : String(value)}</Text>)}</View>}
                        {data.proposal.terms.compensation_type === 'hybrid' && <View style={{ gap: 8 }}><Text style={styles.helperText}>Commercial royalties start after final delivery approval. Production payments and royalty reports are separate.</Text><Button text="Open commercial royalty reports" onPress={() => router.push('/royalty-reports' as any)} /></View>}
                        {data.status === 'NEGOTIATING' && (
                          <View style={{ gap: 10, marginTop: 8 }}>
                            {!data.proposal.is_proposer && (
                              <View style={styles.actionRow}>
                                <Text style={styles.helperText}>Accepting confirms the proposal, pickup, buyer destination, delivery instructions and shipping fee shown above.</Text>
                                <Button text="Accept terms" disabled={busy} onPress={() => action('accept')} />
                                <Button text="Decline" variant="secondary" disabled={busy} onPress={() => action('decline')} />
                              </View>
                            )}
                            <Button
                              text="Negotiate / counter-offer"
                              onPress={() => setCounter({ ...data.proposal.terms, ...(data.proposal.terms.license_type === 'personal' ? { compensation_type: 'one_time', compensation_terms: {} } : {}), milestones: data.proposal.terms.milestones.join(',') })}
                            />

                            {counter && (
                              <View style={{ gap: 10, marginTop: 6 }}>
                                <Text style={styles.fieldLabel}>Total PHP</Text>
                                <TextInput style={styles.input} value={counter.price} onChangeText={price => setCounter({ ...counter, price })} />

                                {data.art_type.toLowerCase() === 'physical' && (
                                  <>
                                    <Text style={styles.fieldLabel}>Shipping fee included in total PHP</Text>
                                    <Text style={styles.bodyText}>PHP {counter.delivery_fee || '0'} · {counter.delivery_details?.distance_km || '—'} km by road</Text>
                                    <Text style={styles.bodyText}>Delivery destination: {counter.delivery_address}</Text>
                                    <Text style={styles.bodyText}>Floor / Unit / Room: {counter.delivery_floor_unit || 'None'} · Instructions: {counter.delivery_instruction || 'None'}</Text>
                                    <Text style={styles.bodyText}>Artist pickup: {counter.pickup_address}</Text>
                                    <Button text="Refresh delivery quote" disabled={busy} onPress={() => { setBusy(true); void commissionApi(`delivery-quote/?commission_id=${id}`).then(quote => setCounter((previous: any) => ({ ...previous, price: (Number(previous.price) - Number(previous.delivery_fee || 0) + Number(quote.fee)).toFixed(2), delivery_quote: quote.token, delivery_details: quote, delivery_fee: quote.fee, delivery_address: quote.delivery_address, pickup_address: quote.pickup_address }))).catch(e => setError(e.message)).finally(() => setBusy(false)); }} />
                                  </>
                                )}

                                <Text style={styles.fieldLabel}>Milestone percentages, comma separated</Text>
                                <TextInput style={styles.input} value={counter.milestones} onChangeText={milestones => setCounter({ ...counter, milestones })} />

                                <AvailabilityCalendar artistId={data.artist_id} selectedDate={counter.deadline.slice(0, 10)} onSelect={date => setCounter({ ...counter, deadline: `${date}T17:00:00+08:00` })} />

                                <Text style={styles.fieldLabel}>Counter-offer notes</Text>
                                <View style={{ gap: 8 }}>
                                  <Button text={counter.allow_resale ? 'Resale permitted · turn off' : 'Permit resale of licensed deliverable'} onPress={() => setCounter({ ...counter, allow_resale: !counter.allow_resale, royalty_percentage: '0' })} />
                                  {counter.allow_resale && <>
                                    <Text style={styles.fieldLabel}>Resale royalty percentage · system standard</Text>
                                    <ResaleRoyaltyPolicy />
                                    <Button disabled={standardResaleRate == null} text={Number(counter.royalty_percentage) > 0 ? 'Optional resale royalties enabled · turn off' : 'Enable optional resale royalties'} onPress={() => setCounter({ ...counter, royalty_percentage: Number(counter.royalty_percentage) > 0 ? '0' : standardResaleRate })} />
                                    <Text style={styles.helperText}>Future permitted resales only. Not charged in this commission total.</Text>
                                  </>}
                                </View>
                                {counter.license_type === 'commercial' && <CompensationSettings commissionMode allowApplication={!data.is_artist} enabled={!!data.buyer_royalty_enabled} category={counter.compensation_type || 'one_time'} terms={counter.compensation_terms?.subtype ? counter.compensation_terms : { subtype: 'one_time_payment' }} expectedTotal={Number(counter.price)} onChange={(compensation_type, compensation_terms) => setCounter({ ...counter, compensation_type, compensation_terms: { ...compensation_terms, reporting_duration_months: counter.duration_months } })} />}
                                <TextInput multiline style={[styles.input, styles.multilineInput]} value={counter.note} onChangeText={note => setCounter({ ...counter, note })} />

                                <Button
                                  text="Submit counter-offer"
                                  disabled={busy}
                                  onPress={() => action('counter', { terms: { ...counter, milestones: counter.milestones.split(',').map(Number) } })}
                                />
                              </View>
                            )}
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.emptyText}>No proposal version data currently available.</Text>
                    )}
                  </ScrollView>

                  {!!data.agreement_id && (
                    <View style={[styles.agreementInsideProposal, { alignItems: 'flex-end' }]}>
                      <Button
                        style={{ alignSelf: 'flex-end' }}
                        text={data.fully_signed ? 'View signed agreement / PDF' : 'Review and sign agreement'}
                        onPress={() => setSigning(true)}
                      />
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* ROW 2: MILESTONES & REVISIONS (BELOW PORTRAIT COMMISSION & PROPOSAL) */}
            <View style={styles.bottomSectionWrapper}>
              <View style={styles.sectionMainHeader}>
                <Text style={styles.sectionMainTitle}>Milestones & Revision History</Text>
              </View>

              <View style={[styles.bottomColumnsLayout, isWebWide ? styles.rowLayout : styles.columnLayout]}>

                {/* 1. LEFT COLUMN: Funding due & Verified funding with refresh icon button */}
                <View style={[styles.milestonesLeftCol, isWebWide ? styles.colWidthLeft : styles.colFull]}>
                  <View style={styles.card}>
                    <View style={styles.fundingTitleRow}>
                      <Text style={styles.sectionHeading}>Funding Details</Text>
                      {data.funding_pending && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          disabled={busy}
                          onPress={() => action('refresh_payment')}
                          style={styles.refreshIconButton}
                          accessibilityLabel="Refresh verified payment status"
                          accessibilityRole="button"
                        >
                          <Text style={styles.refreshIconText}>↻</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {data.funding_due_at && <Text style={styles.bodyText}>Funding due: {new Date(data.funding_due_at).toLocaleString()}</Text>}

                    {!data.is_artist && data.status === 'AWAITING_FUNDS' && (
                      <Button text="Fund full commission" disabled={busy} onPress={() => action('fund')} />
                    )}

                    <Text style={styles.bodyText}>
                      Verified funding: {data.funded_at ? new Date(data.funded_at).toLocaleString() : 'Awaiting payment confirmation'}
                    </Text>
                    <Text style={styles.boldText}>Holding balance PHP {data.held_amount}</Text>
                    {!!paymentNotice && <Text accessibilityLiveRegion="polite" style={styles.helperText}>{paymentNotice}</Text>}
                  </View>

                  {/* Payout Recipient Configuration (for Artist) */}
                  {data.is_artist && (
                    <View style={styles.card}>
                      <Text style={styles.sectionHeading}>Bank / e-wallet payout recipient</Text>
                      <Text style={styles.helperText}>Your name and address are filled from your artist profile. Review them against your bank or e-wallet registration.</Text>
                      {payoutLoading && <ActivityIndicator color="#C15656" />}
                      {!!payoutError && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{payoutError}</Text>}
                      {!!payoutMessage && <Text accessibilityLiveRegion="polite" style={{ color: '#34734C' }}>{payoutMessage}</Text>}
                      {payoutInfo?.configured && <Text style={styles.boldText}>Saved destination: {payoutInfo.routing} · Account ending {payoutInfo.account_last4}</Text>}
                      {[['given_name', 'Given name'], ['surname', 'Surname'], ['account_holder_name', 'Registered account holder name']].map(([key, label]) => <View key={key} style={{ gap: 5 }}>
                        <Text style={styles.helperText}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={payout[key] || ''} onChangeText={text => setPayout({ ...payout, [key]: text })} editable={!payoutLoading && !payoutSaving} />
                      </View>)}
                      <Text style={styles.boldText}>Receive payouts through</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {[['WALLET', 'E-wallet'], ['SWIFT', 'Bank']].map(([value, label]) => <TouchableOpacity key={value} disabled={payoutLoading || payoutSaving} accessibilityRole="radio" accessibilityState={{ checked: payout.routing_type === value }} onPress={() => setPayout({ ...payout, routing_type: value, routing_value: value === 'WALLET' ? 'PH_GCASH' : '', account_number: '' })} style={{ padding: 12, borderRadius: 9, backgroundColor: payout.routing_type === value ? '#C15656' : '#F2E8DF' }}><Text style={{ color: payout.routing_type === value ? '#FFF' : '#65574D', fontWeight: '600' }}>{label}</Text></TouchableOpacity>)}
                      </View>
                      <Text style={styles.helperText}>{payout.routing_type === 'WALLET' ? 'E-wallet routing code (GCash: PH_GCASH)' : 'Bank SWIFT/BIC code'}</Text>
                      <TextInput accessibilityLabel="Payout destination routing code" autoCapitalize="characters" style={styles.input} placeholder={payout.routing_type === 'WALLET' ? 'PH_GCASH' : 'Your bank’s SWIFT/BIC code'} value={payout.routing_value || ''} editable={!payoutLoading && !payoutSaving} onChangeText={text => setPayout({ ...payout, routing_value: text.toUpperCase() })} />
                      <Text style={styles.helperText}>{payout.routing_type === 'WALLET' ? 'Registered e-wallet mobile/account number' : 'Bank account number'}</Text>
                      <TextInput accessibilityLabel="Payout account number" keyboardType="number-pad" autoComplete="off" style={styles.input} placeholder={keepSavedAccount ? `Leave blank to keep account ending ${payoutInfo.account_last4}` : payout.routing_type === 'WALLET' ? 'Enter your registered account number (GCash: 09...)' : 'Enter your bank account number'} value={payout.account_number || ''} editable={!payoutLoading && !payoutSaving} onChangeText={text => setPayout({ ...payout, account_number: text })} />
                      {[['street', 'Street / barangay'], ['city', 'City'], ['province', 'Province'], ['postal_code', 'Postal code']].map(([key, label]) => <View key={key} style={{ gap: 5 }}><Text style={styles.helperText}>{label}</Text><TextInput accessibilityLabel={label} style={styles.input} value={payout[key] || ''} editable={!payoutLoading && !payoutSaving} onChangeText={text => setPayout({ ...payout, [key]: text })} /></View>)}
                      <View style={{ gap: 8, padding: 12, backgroundColor: '#FAF6EF', borderRadius: 10 }}>
                        <Text style={styles.boldText}>Xendit · {payoutInfo?.xendit?.mode === 'test' ? 'Test mode' : payoutInfo?.xendit?.mode === 'live' ? 'Live mode' : 'Not configured'}</Text>
                        <Text style={styles.helperText}>{payoutInfo?.xendit?.payouts_enabled ? 'Platform milestone payouts are enabled.' : 'Platform milestone payouts are currently disabled. The administrator must enable them after Xendit setup.'}</Text>
                        {payoutInfo?.xendit?.detail && <Text style={styles.helperText}>{payoutInfo.xendit.detail}</Text>}
                        {payoutInfo?.xendit && !payoutInfo.xendit.webhook_configured && <Text style={styles.helperText}>Payout callbacks still need configuration by the administrator.</Text>}
                        <Button text={payoutChecking ? 'Checking Xendit…' : 'Check Xendit connection'} disabled={payoutChecking || payoutLoading} onPress={() => void checkPayoutConnection()} />
                      </View>
                      <Button text={payoutSaving ? 'Saving recipient…' : 'Save payout recipient'} disabled={payoutLoading || payoutSaving || !payoutInfo} onPress={() => void savePayout()} />
                    </View>
                  )}

                  {/* Asset Record (Completed) */}
                  {data.asset && (
                    <View style={styles.card}>
                      <Text style={styles.sectionHeading}>Completed asset · Owner: {data.asset.owner}</Text>
                      {!!data.asset.provenance_id && <ProvenancePanel recordId={data.asset.provenance_id} />}
                      <Text selectable style={styles.hashText}>Provenance record: {data.asset.record_hash}</Text>
                      <Text selectable style={styles.hashText}>Blockchain: {data.asset.proof_status} {data.asset.transaction_hash}</Text>
                      {!data.is_artist && data.asset.license.allow_resale && (
                        <View style={{ gap: 8 }}>
                          <TextInput style={styles.input} value={resalePrice} onChangeText={setResalePrice} placeholder="Resale listing price PHP" placeholderTextColor="#9D8D85" />
                          <Button
                            text="List deliverable for resale"
                            onPress={async () => {
                              try {
                                await commissionApi(`assets/${data.asset.id}/resale/`, { price: resalePrice });
                                setError('Resale listing submitted for creative moderation.');
                              } catch (e: any) {
                                setError(e.message);
                              }
                            }}
                          />
                        </View>
                      )}
                    </View>
                  )}
                </View>

                {/* 2. CENTER COLUMN: Stages with collapsible overview (Stage:, %, Artist payout, Payout, Review due) */}
                <View style={[styles.milestonesCenterCol, isWebWide ? styles.colWidthCenter : styles.colFull]}>
                  {data.milestones.map((m: any) => {
                    const isExpanded = expandedMilestones[m.id];
                    return (
                      <View key={m.id} style={styles.card}>
                        {/* Collapsible Overview Header Bar */}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => toggleMilestone(m.id)}
                          style={styles.stageToggleHeader}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Text style={styles.stageTitle}>Stage {m.number}: {m.label}</Text>
                              <Text style={styles.stageBadge}>{m.percentage}%</Text>
                            </View>
                            <Text style={styles.overviewText}>Artist payout: PHP {m.amount} · {m.status}</Text>
                            <Text style={styles.overviewText}>Payout: {m.payout_status} {m.payout_error}</Text>
                            {!!m.review_due_at && (
                              <Text style={styles.overviewText}>Review due: {new Date(m.review_due_at).toLocaleString()}</Text>
                            )}
                            <Text style={[styles.toggleIcon, { alignSelf: 'flex-end' }]}>{isExpanded ? '▲ Hide' : '▼ View details'}</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Collapsed / Expandable Detailed Section */}
                        {isExpanded && (
                          <View style={styles.stageExpandedContent}>
                            {m.submissions.map((s: any) => (
                              <View key={s.id} style={styles.submissionBox}>
                                <Text style={styles.submissionName}>{s.name} · uploaded {new Date(s.uploaded_at).toLocaleString()}</Text>
                                <Text selectable style={styles.hashText}>SHA-256: {s.sha256}</Text>
                                <Text style={styles.bodyText}>{s.caption}</Text>
                                {!!s.cid && <Text selectable style={styles.hashText}>Encrypted IPFS CID: {s.cid}</Text>}
                                {s.proof && <Text selectable style={styles.hashText}>Blockchain proof: {s.proof.status} {s.proof.transaction_hash}</Text>}
                                <View style={styles.actionRow}>
                                  <Button text="Inspect preview" variant="secondary" onPress={() => file(s, true)} />
                                  {s.download_allowed && <Button text="Download file" onPress={() => file(s, false)} />}
                                </View>
                              </View>
                            ))}

                            {!!m.revision_comment && <Text style={styles.revisionNotice}>Buyer revision comment (1/1 used): {m.revision_comment}</Text>}
                            {m.revision_requested_at && <Text style={styles.bodyMuted}>Requested: {new Date(m.revision_requested_at).toLocaleString()}</Text>}
                            {!!m.revision_reply && <Text style={styles.artistReplyNotice}>Artist’s reply: {m.revision_reply} · {new Date(m.revision_replied_at).toLocaleString()}</Text>}

                            {data.is_artist && data.status === `STAGE_${m.number}` && m.status === 'REVISION_REQUESTED' && !m.revision_replied_at && (
                              <View style={{ gap: 8 }}>
                                <TextInput
                                  style={[styles.input, styles.multilineInput]}
                                  multiline
                                  maxLength={2000}
                                  placeholder="Reply to the requested revision"
                                  placeholderTextColor="#9D8D85"
                                  value={revisionReplies[m.id] || ''}
                                  onChangeText={text => setRevisionReplies({ ...revisionReplies, [m.id]: text })}
                                />
                                <Button text="Send revision reply" disabled={busy || !revisionReplies[m.id]?.trim()} onPress={() => action('reply_revision', { milestone_id: m.id, reply: revisionReplies[m.id] })} />
                              </View>
                            )}

                            {data.is_artist && data.status === `STAGE_${m.number}` && ['PENDING', 'REVISION_REQUESTED'].includes(m.status) && (
                              <Button
                                text={m.number === 3 && data.art_type.toLowerCase() === 'digital' ? 'Upload original final image (up to 30 MB)' : 'Upload milestone / revised submission'}
                                disabled={busy}
                                onPress={() => upload(m)}
                              />
                            )}

                            {!data.is_artist && m.status === 'SUBMITTED' && !data.disputed && (
                              <View style={{ gap: 8 }}>
                                {!m.revision_used && !m.delivery_ready_at && (
                                  <>
                                    <TextInput
                                      style={[styles.input, styles.multilineInput]}
                                      multiline
                                      placeholder="One consolidated revision comment for this stage"
                                      placeholderTextColor="#9D8D85"
                                      value={comments[m.id] || ''}
                                      onChangeText={text => setComments({ ...comments, [m.id]: text })}
                                    />
                                    <Button text="Request revision (1 per stage)" disabled={busy} onPress={() => action('revise', { milestone_id: m.id, comment: comments[m.id] })} />
                                  </>
                                )}
                                {!(m.number === 3 && data.art_type.toLowerCase() === 'physical') && <Button text="Approve milestone" disabled={busy} onPress={() => action('approve', { milestone_id: m.id })} />}
                              </View>
                            )}

                            <CommissionDeliveryPanel data={data} milestone={m} busy={busy} onAction={(name, extra) => { void action(name, { milestone_id: m.id, ...extra }); }} />

                            {data.is_artist && m.approved_at && ['CONFIG_REQUIRED', 'RETRY_PENDING', 'NOT_REQUESTED'].includes(m.payout_status) && (
                              <Button text="Retry / reconcile payout" onPress={() => action('payout', { milestone_id: m.id })} />
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* 3. RIGHT COLUMN: Inspect Preview Header (Close preview Left, Submission Preview Center) & Dispute/Cancellation Box Below It */}
                <View style={[styles.milestonesRightCol, isWebWide ? styles.colWidthRight : styles.colFull]}>
                  {!!preview && (
                    <View style={styles.card}>
                      <View style={styles.previewHeaderContainer}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setPreview('')}
                          style={styles.closePreviewPlainButton}
                        >
                          <Text style={styles.closePreviewPlainText}>Close</Text>
                        </TouchableOpacity>

                        <Text style={styles.previewCenterTitle}>Submission Preview</Text>

                        {/* Spacer to keep center title precisely centered */}
                        <View style={styles.previewHeaderSpacer} />
                      </View>

                      <Image source={{ uri: preview }} style={styles.previewImage} resizeMode="contain" />
                    </View>
                  )}

                  {/* File Dispute & Request Cancellation Box */}
                  {data.status !== 'CANCELLED' && (
                    <View style={styles.card}>
                      <TextInput
                        style={[styles.input, styles.multilineInput]}
                        multiline
                        placeholder="Explain dispute or cancellation request"
                        placeholderTextColor="#9D8D85"
                        value={reason}
                        onChangeText={setReason}
                      />
                      <View style={[styles.actionRow, {alignSelf: 'flex-end' }]}>
                        <Button text="File dispute" disabled={busy} onPress={() => action('dispute', { reason })} />
                        <Button text="Request cancellation" variant="secondary" disabled={busy} onPress={() => action('cancel_request', { reason })} />
                      </View>
                    </View>
                  )}
                </View>

              </View>
            </View>

          </View>
        </ScrollView>
      )}

      {signing && data?.agreement_id && (
        <SigningModal id={data.agreement_id} onClose={() => { setSigning(false); void load(); }} onSigned={load} />
      )}
      {chatOpen && data && (
        <ChatModal visible={chatOpen} onClose={() => setChatOpen(false)} currentUser={auth.currentUser} initialCommissionId={Number(data.id)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAF6EF',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E8DCD4',
    backgroundColor: '#FAF6EF',
  },
  backButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  backButtonText: {
    color: '#8D3B3B',
    fontWeight: '700',
    fontSize: 15,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F3E4DC',
  },
  statusBadgeText: {
    color: '#8D3B3B',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  errorBanner: {
    backgroundColor: '#FCE8E8',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0B8B8',
    alignItems: 'center',
  },
  errorText: {
    color: '#A13030',
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainScroll: {
    paddingVertical: 24,
    paddingHorizontal: Platform.OS === 'web' ? '6%' : 16,
  },
  contentContainer: {
    maxWidth: 1240,
    width: '100%',
    alignSelf: 'center',
    gap: 28,
  },
  topRowWrapper: {
    width: '100%',
    gap: 24,
  },
  rowLayout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  columnLayout: {
    flexDirection: 'column',
  },
  topColumn: {
    gap: 12,
  },
  flexHalf: {
    flex: 1,
  },
  chatButtonRow: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  bottomSectionWrapper: {
    width: '100%',
    gap: 16,
  },
  sectionMainHeader: {
    borderBottomWidth: 2,
    borderBottomColor: '#E2D1C5',
    paddingBottom: 6,
  },
  sectionMainTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#C15656',
  },
  bottomColumnsLayout: {
    width: '100%',
    gap: 20,
  },
  colWidthLeft: {
    flex: 1,
  },
  colWidthCenter: {
    flex: 1.5,
  },
  colWidthRight: {
    flex: 1.15,
  },
  colFull: {
    width: '100%',
  },
  cardHeader: {
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#E2D1C5',
  },
  colHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#7A645A',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E8DCD4',
    shadowColor: '#2B1E1A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  scrollableProposalCard: {
    height: 480,
    paddingRight: 6,
  },
  proposalScrollContainer: {
    paddingRight: 10,
  },
  agreementInsideProposal: {
    right: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EFE5DD',
  },
  titleText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#342621',
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A756C',
  },
  fundingTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  refreshIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#FAF5EE',
    borderWidth: 1,
    borderColor: '#E3D7CE',
  },
  refreshIconText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#735E55',
    marginTop: -2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#382A25',
  },
  previewHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  closePreviewPlainButton: {
    paddingVertical: 4,
    paddingRight: 8,
    backgroundColor: 'transparent',
    borderRadius: 0,
  },
  closePreviewPlainText: {
    color: '#C15656',
    fontWeight: '700',
    fontSize: 14,
  },
  previewCenterTitle: {
    left: 20,
    fontSize: 16,
    fontWeight: '700',
    color: '#382A25',
    textAlign: 'center',
  },
  previewHeaderSpacer: {
    width: 85,
  },
  bodyText: {
    fontSize: 14,
    color: '#55423B',
    lineHeight: 20,
  },
  bodyMuted: {
    fontSize: 12,
    color: '#806E66',
    lineHeight: 18,
  },
  boldText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#342621',
  },
  imageWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#F9F5F0',
    borderWidth: 1,
    borderColor: '#EFE7E0',
  },
  refImage: {
    width: '100%',
    height: 220,
  },
  disputeNoticeBox: {
    backgroundColor: '#FDF2F2',
    padding: 10,
    borderRadius: 8,
  },
  disputeText: {
    color: '#A13030',
    fontWeight: '600',
    fontSize: 13,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#655148',
  },
  stageToggleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  stageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3C2D27',
  },
  stageBadge: {
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: '#F0E6DE',
    color: '#5C4A42',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  overviewText: {
    fontSize: 13,
    color: '#6C584F',
    fontWeight: '500',
  },
  toggleIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E67E22',
    paddingLeft: 8,
  },
  stageExpandedContent: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0E6DE',
    gap: 12,
  },
  submissionBox: {
    backgroundColor: '#FAF7F3',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EFE7E0',
    gap: 6,
  },
  submissionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#342520',
  },
  hashText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#806E66',
  },
  revisionNotice: {
    fontSize: 13,
    color: '#A13030',
    fontWeight: '600',
    backgroundColor: '#FDF2F2',
    padding: 8,
    borderRadius: 6,
  },
  artistReplyNotice: {
    fontSize: 13,
    color: '#3B6849',
    backgroundColor: '#F0F7F2',
    padding: 8,
    borderRadius: 6,
  },
  previewImage: {
    width: '100%',
    height: 380,
    borderRadius: 8,
    marginVertical: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDCEC7',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#40322E',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonBase: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#C15656',
  },
  buttonSecondary: {
    backgroundColor: '#EBE2DC',
  },
  buttonDisabled: {
    backgroundColor: '#DCD5D0',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  buttonSecondaryText: {
    color: '#493A34',
  },
  emptyText: {
    color: '#88746B',
    fontStyle: 'italic',
    paddingVertical: 16,
    textAlign: 'center',
  },
  helperText: {
    fontSize: 12,
    color: '#806E66',
    lineHeight: 18,
    marginTop: 4,
  },
  milestonesLeftCol: {
    gap: 14,
  },
  milestonesCenterCol: {
    gap: 14,
  },
  milestonesRightCol: {
    gap: 14,
  },
});
