import { Text, TextInput } from '@/components/Typography';
import { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '@/context/AuthContext';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import TicketActions from '@/module/moderation/TicketActions';
import { ArrowLeft, RefreshCw, RotateCcw, ShieldCheck, Inbox, UserCheck, ArrowRightLeft, ChevronDown, ChevronUp, ChevronRight, SlidersHorizontal } from 'lucide-react-native';

type Concern = { id: string; label: string; category: string; reference: string };
type FAQ = { id: string; question: string; answer: string; concern: string };
type Reference = { id: number; kind: string; title: string; status: string; date: string; image?: string; label: string; decline_reason?: string };
type AccountSuggestion = { username: string; profile_image: string | null };
type ReportedProfile = { id: number; username: string; name: string; role: string; joined_at: string; bio: string; restricted: boolean; artworks: { id: number; title: string; image_data: string }[] };
type Ticket = { reported_username?: string; reported_user?: { id: number; username: string; role: string }; assigned_to_id?: number | null; assigned_to?: string; transfer_to_id?: number | null; transfer_to?: string; can_handle?: boolean; department_label: string; id: number; number: string; label: string; requester: string; status: string; reference?: Reference; details?: string; evidence?: string; image_data?: string; created_at: string; replies?: { id: number; message: string; sender: string; is_staff: boolean; created_at: string }[] };
type Catalog = { user_id: number; concerns: Concern[]; faqs: FAQ[]; is_moderator: boolean; role: string; department_label: string; statuses: Record<string, string> };
type Page<T> = { results: T[]; next_offset: number | null };
async function request<T>(path: string, method = 'GET', body?: object): Promise<T> {
  const uid = auth.currentUser?.uid;
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw Error('Please sign in to use customer support.');
  const response = await fetch(`${API_URL}/api/support/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (auth.currentUser?.uid !== uid) throw Error('Your session changed. Please reopen customer support.');
  if (!response.ok) {
    const messages = Object.entries(data).map(([key, value]) => `${['error', 'detail'].includes(key) ? '' : `${key}: `}${Array.isArray(value) ? value.join(' ') : value}`);
    throw Error(messages.join('\n') || 'Unable to contact support. Please try again.');
  }
  return data;
}
function Button({ children, onPress, disabled = false, primary = false, compact = false }: { children: React.ReactNode; onPress: () => void; disabled?: boolean; primary?: boolean; compact?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return <Pressable accessibilityRole="button" disabled={disabled} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={onPress} style={({ pressed }) => [s.button, compact && s.compactButton, (primary || (!disabled && (hovered || pressed))) && s.primary, disabled && s.disabled]}>{({ pressed }) => <Text style={[s.buttonText, compact && { fontSize: 12 }, (primary || (!disabled && (hovered || pressed))) && s.white]}>{children}</Text>}</Pressable>;
}
function AccountAvatar({ account }: { account: AccountSuggestion }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [account.profile_image]);
  return account.profile_image && !failed
    ? <Image source={{ uri: account.profile_image }} style={s.accountAvatar} onError={() => setFailed(true)} />
    : <View style={[s.accountAvatar, s.avatarFallback]}><Text style={s.bold}>{account.username.slice(0, 1).toUpperCase()}</Text></View>;
}
function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return <View style={[s.bubble, mine && s.mine]}><Text style={s.bubbleText}>{children}</Text></View>;
}

export default function SupportScreen({ moderator = false, initialPaymentId, initialArtworkId, onClose, embedded = false }: { moderator?: boolean; initialPaymentId?: number; initialArtworkId?: number; onClose?: () => void; embedded?: boolean }) {
  const { user, loading: authLoading } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const [caseActionsExpanded, setCaseActionsExpanded] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mode, setMode] = useState<'new' | 'tickets'>(moderator ? 'tickets' : 'new');
  const [category, setCategory] = useState('');
  const [concern, setConcern] = useState<Concern | null>(null);
  const [faq, setFaq] = useState<FAQ | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [refs, setRefs] = useState<Page<Reference>>({ results: [], next_offset: null });
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [details, setDetails] = useState('');
  const [reportedUsername, setReportedUsername] = useState('');
  const [accountSuggestions, setAccountSuggestions] = useState<AccountSuggestion[]>([]);
  const [chosenAccount, setChosenAccount] = useState<AccountSuggestion | null>(null);
  const [accountSearching, setAccountSearching] = useState(false);
  const [accountSearchError, setAccountSearchError] = useState('');
  const [accountSearched, setAccountSearched] = useState(false);
  const [reportedProfile, setReportedProfile] = useState<ReportedProfile | null>(null);
  const [evidence, setEvidence] = useState('');
  const [photo, setPhoto] = useState('');
  const [review, setReview] = useState(false);
  const [tickets, setTickets] = useState<Page<Ticket>>({ results: [], next_offset: null });
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [queue, setQueue] = useState<'waiting' | 'mine' | 'transfers'>('waiting');
  const [agents, setAgents] = useState<{ id: number; username: string }[]>([]);
  const [transferTarget, setTransferTarget] = useState<number | null>(null);
  const assignments = moderator && catalog?.role === 'customer_support';
  const assignmentAction = (action: string, target_id?: number) => run(async () => {
    setSelected(await request<Ticket>(`tickets/${selected!.id}/`, 'PATCH', { action, target_id }));
    setTransferTarget(null);
    await loadTickets();
  });
  useEffect(() => {
    if (!assignments) return;
    let active = true;
    request<{ id: number; username: string }[]>('agents/').then(rows => { if (active) setAgents(rows); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [assignments]);
  useEffect(() => { setTransferTarget(null); setReportedProfile(null); }, [selected?.id]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gate = useRef(false);
  const initialAppeal = useRef('');
  const run = async (work: () => Promise<void>) => {
    if (gate.current) return;
    gate.current = true; setBusy(true); setError('');
    try { await work(); } catch (e: any) { setError(e.message || 'Please try again.'); }
    finally { gate.current = false; setBusy(false); }
  };
  const loadCatalog = () => run(async () => setCatalog(await request<Catalog>('catalog/')));
  useEffect(() => {
    if (authLoading) return;
    setCatalog(null); setSelected(null); setTickets({ results: [], next_offset: null });
    reset();
    if (user) loadCatalog();
  }, [user?.uid, authLoading]);
  const loadTickets = async (offset = 0) => {
    const page = await request<Page<Ticket>>(`tickets/?moderator=${moderator ? 1 : 0}&queue=${queue}&status=${assignments && queue === 'waiting' ? '' : statusFilter}&offset=${offset}`);
    setTickets(old => ({ ...page, results: offset ? [...old.results, ...page.results] : page.results }));
  };
  useEffect(() => { if (catalog && mode === 'tickets') run(() => loadTickets()); }, [catalog, mode, statusFilter, queue]);
  useEffect(() => {
    if (!assignments || mode !== 'tickets' || selected) return;
    const timer = setInterval(() => run(() => loadTickets()), 5000);
    return () => clearInterval(timer);
  }, [assignments, mode, selected?.id, queue, statusFilter]);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    const timer = setInterval(async () => {
      if (gate.current) return;
      try { const ticket = await request<Ticket>(`tickets/${selected.id}/`); if (active) setSelected(ticket); }
      catch { /* Manual refresh displays network errors. */ }
    }, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [selected?.id]);
  const reset = () => { setCategory(''); setConcern(null); setFaq(null); setReference(null); setDetails(''); setReportedUsername(''); setChosenAccount(null); setReportedProfile(null); setEvidence(''); setPhoto(''); setReview(false); setSearch(''); setError(''); };
  const loadReferences = async (item: Concern, offset = 0, query = '') => {
    const page = await request<Page<Reference>>(`references/?concern=${item.id}&offset=${offset}&q=${encodeURIComponent(query)}`);
    setAppliedSearch(query);
    setRefs(old => ({ ...page, results: offset ? [...old.results, ...page.results] : page.results }));
  };
  const chooseConcern = (item: Concern) => run(async () => {
    setReportedUsername(''); setChosenAccount(null); setConcern(item); setCategory(item.category); setFaq(null); setReference(null); setReview(false); setSearch('');
    setRefs({ results: [], next_offset: null });
    if (item.reference !== 'none') {
      await loadReferences(item);
      if (initialPaymentId && item.reference.endsWith('payment')) {
        const page = await request<Page<Reference>>(`references/?concern=${item.id}&q=${initialPaymentId}`);
        setReference(page.results.find(r => r.id === initialPaymentId) || null);
      }
    }
  });
  useEffect(() => {
    if (!catalog || busy || moderator || !initialArtworkId || !user) return;
    const key = `${user.uid}:${initialArtworkId}`;
    if (initialAppeal.current === key) return;
    initialAppeal.current = key;
    run(async () => {
      const item = catalog.concerns.find(c => c.id === 'rejected_artwork');
      if (!item) throw Error('Only artists can appeal an artwork rejection.');
      const page = await request<Page<Ticket>>(`tickets/?concern=rejected_artwork&artwork_id=${initialArtworkId}&active=1`);
      if (page.results.length) {
        setSelected(await request<Ticket>(`tickets/${page.results[0].id}/`));
        setMode('tickets');
        return;
      }
      const records = await request<Page<Reference>>(`references/?concern=rejected_artwork&reference_id=${initialArtworkId}`);
      const artwork = records.results.find(r => r.id === initialArtworkId);
      if (!artwork) throw Error('This artwork is no longer rejected or is unavailable to your account.');
      setConcern(item); setCategory(item.category); setReference(artwork);
      setRefs(records); setMode('new');
    });
  }, [catalog, busy, moderator, initialArtworkId, user?.uid]);
  const attach = () => run(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64 || asset.base64.length > 2097152 || asset.width * asset.height > 16000000) throw Error('Choose an image under 1.5 MB and 16 megapixels.');
    setPhoto(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
  });
  const submit = () => run(async () => {
    const ticket = await request<Ticket>('tickets/', 'POST', { concern: concern!.id, reference_id: reference?.id ?? null, details, evidence, image_data: photo, reported_username: reportedUsername });
    setSelected(ticket); setReply(''); setMode('tickets'); reset(); await loadTickets();
  });
  const close = onClose || (() => router.canGoBack() ? router.back() : router.replace('/(home)'));
  const accountReport = !!concern && ['suspicious', 'harassment'].includes(concern.id);
  useEffect(() => {
    let active = true;
    setAccountSuggestions([]); setAccountSearched(false); setAccountSearchError('');
    const query = reportedUsername.trim().replace(/^@/, '');
    if (!user || !accountReport || mode !== 'new' || review || chosenAccount || query.length < 2) {
      setAccountSearching(false);
      return;
    }
    setAccountSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await request<{ results: AccountSuggestion[] }>(`accounts/?q=${encodeURIComponent(query)}`);
        if (active) { setAccountSuggestions(data.results); setAccountSearched(true); }
      } catch (e: any) { if (active) setAccountSearchError(e.message || 'Unable to search accounts.'); }
      finally { if (active) setAccountSearching(false); }
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [reportedUsername, accountReport, chosenAccount, mode, review, user?.uid]);
  const ready = concern && (concern.reference === 'none' || reference);
  return <SafeAreaView style={s.page} edges={embedded ? [] : undefined}><KeyboardAvoidingView style={s.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={close} style={s.iconButton}><ArrowLeft size={23} color="#62493E" /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.brand}>ArtFiliere</Text><Text style={s.muted}>{moderator ? `${catalog?.department_label || 'Moderator'} reports` : 'Support & account safety'}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh customer support" disabled={busy} style={[s.iconButton, busy && s.disabled]} onPress={() => { if (selected) run(async () => setSelected(await request<Ticket>(`tickets/${selected.id}/`))); else if (mode === 'tickets' && catalog) run(() => loadTickets()); else loadCatalog(); }}><RefreshCw size={22} color="#984E43" /></TouchableOpacity></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {!selected && <View style={s.hero}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ShieldCheck size={30} color="#BC5555" /><Text accessibilityRole="header" style={[s.heroTitle, { flex: 1 }]}>{moderator ? (selected ? 'Report Details' : 'Concern Queues') : 'Customer Support'}</Text></View><Text style={s.heroCopy}>{moderator ? 'Choose a queue, review the concern, and reply to the member.' : 'Guided help and report tracking'}</Text></View>}
      {!catalog ? <><Text>{authLoading ? 'Checking your session...' : user ? 'Connecting to customer support...' : 'Sign in to view help and your reports.'}</Text>{!authLoading && <Button disabled={busy} onPress={loadCatalog}>Retry connection</Button>}{!authLoading && !user && <Button onPress={() => router.push('/login')}>Sign in</Button>}</> : moderator && !catalog.is_moderator ? <Text>Moderator access is required.</Text> : <>
        {!moderator && <View style={s.row}><Button disabled={busy} primary={mode === 'new'} onPress={() => { setMode('new'); setSelected(null); }}>New Report / FAQs</Button><Button disabled={busy} primary={mode === 'tickets'} onPress={() => { setMode('tickets'); setSelected(null); run(() => loadTickets()); }}>My Reports</Button></View>}
        {assignments && mode === 'tickets' && !selected && <View style={s.queuePanel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.queueTabs}>
            {(['waiting', 'mine', 'transfers'] as const).map(value => {
              const Icon = value === 'waiting' ? Inbox : value === 'mine' ? UserCheck : ArrowRightLeft;
              return <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: queue === value }} disabled={busy} onPress={() => { setQueue(value); setSelected(null); setStatusFilter(''); setStatusMenuOpen(false); }} style={[s.queueTab, queue === value && s.queueTabActive, busy && s.disabled]}><Icon size={18} color={queue === value ? '#FFFFFF' : '#A84B46'} /><Text style={[s.queueTabText, queue === value && s.white]}>{value === 'waiting' ? 'Waiting' : value === 'mine' ? 'Assigned to Me' : 'Transfers'}</Text></Pressable>;
            })}
          </ScrollView>
          <Text style={s.muted}>{queue === 'waiting' ? 'Unassigned concerns ready for a moderator to accept.' : queue === 'mine' ? 'Concerns you accepted and are responsible for handling.' : 'Concerns another moderator has requested to transfer to you. Accept or decline each transfer.'}</Text>
        </View>}
        {mode === 'new' ? <>
          <View style={s.introduction}><Text style={s.bubbleText}>Welcome to ArtFiliere support. Choose a topic below. This guided chat can answer common questions or send a report to our support team.</Text></View>
          {!category && catalog.concerns.some(c => c.id === 'rejected_artwork') && <Button disabled={busy} onPress={() => { const item = catalog.concerns.find(c => c.id === 'rejected_artwork'); if (item) chooseConcern(item); }}>Appeal a rejected artwork</Button>}
          {!category && <View style={s.options}>{[...new Set(catalog.concerns.map(c => c.category)), 'FAQs'].map(c => <Button key={c} disabled={busy} onPress={() => setCategory(c)}>{c}</Button>)}</View>}
          {!!category && !concern && <><Bubble mine>{category}</Bubble><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={reset} style={[s.restartButton, busy && s.disabled]}><RotateCcw size={17} color="#FFF" /><Text style={s.restartText}>Start over</Text></TouchableOpacity></>}
          {category === 'FAQs' && <>{!faq ? <View style={s.options}>{catalog.faqs.map(f => <Button key={f.id} onPress={() => setFaq(f)}>{f.question}</Button>)}</View> : <><Bubble mine>{faq.question}</Bubble><Bubble>{faq.answer}</Bubble><Text>Did this answer your question?</Text><View style={s.row}><Button onPress={() => { reset(); }}>Yes, thanks</Button><Button disabled={busy} onPress={() => { const item = catalog.concerns.find(c => c.id === faq.concern); if (item) chooseConcern(item); }}>No, contact support</Button></View></>}</>}
          {!!category && category !== 'FAQs' && !concern && <><Bubble>What would you like help with?</Bubble><View style={s.options}>{catalog.concerns.filter(c => c.category === category).map(c => <Button disabled={busy} key={c.id} onPress={() => chooseConcern(c)}>{c.label}</Button>)}</View></>}
          {concern && <View style={s.concernCard}><View style={s.concernHeader}><View style={{ flex: 1, gap: 6 }}><Text style={s.muted}>{concern.category}</Text><Text accessibilityRole="header" style={s.concernTitle}>{concern.label}</Text><Text style={s.muted}>{review ? 'Review your report' : 'Report details'}</Text></View><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={reset} style={[s.restartButton, busy && s.disabled]}><RotateCcw size={17} color="#FFF" /><Text style={s.restartText}>Start over</Text></TouchableOpacity></View>
            {concern.reference !== 'none' && !reference && <>
              <Bubble>{concern.reference.includes('artwork') ? 'Select the artwork this report concerns.' : concern.reference === 'commission' ? 'Which commission is this about?' : concern.reference === 'auction' ? 'Which auction is this about?' : 'Which transaction is this about?'}</Bubble>
              <View style={s.row}><TextInput accessibilityLabel="Search linked records" style={[s.input, s.flex]} placeholder="Search by title or record number" value={search} onChangeText={setSearch} /><Button disabled={busy} onPress={() => run(() => loadReferences(concern, 0, search))}>Search</Button></View>
              {!busy && !refs.results.length && <Text>No matching records. Try another search or choose Account & Safety → Something else if you cannot find the record.</Text>}
              {refs.results.map(r => <TouchableOpacity accessibilityRole="button" disabled={busy} key={r.id} style={s.record} onPress={() => setReference(r)}>{!!r.image && <Image source={{ uri: r.image }} style={s.thumb} />}<View style={s.flex}><Text style={s.bold}>{r.title}</Text><Text style={s.muted}>{r.label} · {r.status}</Text><Text style={s.muted}>{new Date(r.date).toLocaleDateString()}</Text></View></TouchableOpacity>)}
              {refs.next_offset !== null && <Button disabled={busy} onPress={() => run(() => loadReferences(concern, refs.next_offset!, appliedSearch))}>More records</Button>}
            </>}
            {reference && <><Bubble mine>{reference.label}: {reference.title}</Bubble>{concern.id === 'rejected_artwork' && !!reference.decline_reason && <Bubble>Rejection reason: {reference.decline_reason}</Bubble>}{!review && <Button disabled={busy} onPress={() => setReference(null)}>Choose a different record</Button>}</>}
            {ready && (!review ? <>
              <Bubble>{concern.id === 'rejected_artwork' ? 'Explain why your artwork should be reconsidered. Include ownership evidence or describe how you addressed the feedback. The Creative Moderator will review your appeal.' : 'Please describe what happened. You can attach a photo. Do not include passwords, payment card numbers, or private keys.'}</Bubble>
              {accountReport && <>
                <Text style={s.bold}>Reported account username (required)</Text>
                <TextInput accessibilityLabel="Reported account username" autoCapitalize="none" autoCorrect={false} maxLength={151} style={s.input} value={reportedUsername} onChangeText={value => { setReportedUsername(value); setChosenAccount(null); }} placeholder="Exact username, with or without @" />
                {accountSearching && <ActivityIndicator accessibilityLabel="Searching accounts" color="#C15656" />}
                {!!accountSearchError && <Text accessibilityRole="alert" style={s.error}>{accountSearchError}</Text>}
                {!accountSearching && accountSearched && !accountSuggestions.length && <Text style={s.muted}>No matching usernames.</Text>}
                {accountSuggestions.map(account => <TouchableOpacity key={account.username} accessibilityRole="button" accessibilityLabel={`Select @${account.username}`} style={s.record} onPress={() => { setChosenAccount(account); setReportedUsername(account.username); setAccountSuggestions([]); }}>
                  <AccountAvatar account={account} />
                  <Text style={s.bold}>@{account.username}</Text>
                </TouchableOpacity>)}
                {chosenAccount && <View style={s.record}><AccountAvatar account={chosenAccount} /><Text style={s.bold}>Selected: @{chosenAccount.username}</Text></View>}
                <Text style={s.muted}>Customer support will use this username to review the correct account.</Text>
              </>}
              <TextInput accessibilityLabel="Report details" multiline maxLength={4000} style={[s.input, s.multiline]} value={details} onChangeText={setDetails} placeholder="What happened, and what help do you need? (at least 10 characters)" />
              {['plagiarism', 'rejected_artwork'].includes(concern.id) && <><Text>{concern.id === 'plagiarism' ? 'Original work link or evidence of ownership (required)' : 'Ownership evidence or supporting links (optional)'}</Text><TextInput accessibilityLabel="Original work evidence" multiline maxLength={2000} style={s.input} value={evidence} onChangeText={setEvidence} placeholder="Link to the original work, publication date, or description of ownership evidence" /></>}
              <Button disabled={busy} onPress={attach}>{photo ? 'Replace photo' : 'Attach a photo (optional)'}</Button>
              {photo && <><Image source={{ uri: photo }} style={s.photo} resizeMode="contain" /><Button onPress={() => setPhoto('')}>Remove photo</Button></>}
              <Button primary disabled={busy || (accountReport && !reportedUsername.trim().replace(/^@/, '')) || details.trim().length < 10 || (concern.id === 'plagiarism' && !evidence.trim())} onPress={() => setReview(true)}>Review report</Button>
            </> : <>
              <Bubble>Review your report before sending it to support.</Bubble><View style={s.card}><Text style={s.bold}>{concern.label}</Text><Text>{reference ? `${reference.label}: ${reference.title}` : 'General concern'}</Text><Text>{details}</Text>{accountReport && <Text>Reported account: {reportedUsername}</Text>}{!!evidence && <Text>Original work evidence: {evidence}</Text>}{!!photo && <Image source={{ uri: photo }} style={s.photo} resizeMode="contain" />}</View>
              <Text style={s.muted}>Support will review your report. Submission does not automatically approve artwork, cancel an order, or issue a refund.</Text>
              <View style={s.row}><Button disabled={busy} onPress={() => setReview(false)}>Edit</Button><Button primary disabled={busy} onPress={submit}>{concern.id === 'rejected_artwork' ? 'Submit appeal' : 'Submit report'}</Button></View>
            </>)}
          </View>}
        </> : selected ? <>
          <View style={s.caseNavigation}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSelected(null); setReply(''); setCaseActionsExpanded(false); run(() => loadTickets()); }} style={s.caseBack}><ArrowLeft size={18} color="#A84B46" /><Text style={s.filterLabel}>Back to Reports</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Refresh report details and replies" disabled={busy} onPress={() => run(async () => setSelected(await request<Ticket>(`tickets/${selected.id}/`)))} style={s.queueRefresh}><RefreshCw size={18} color="#A84B46" /></Pressable>
          </View>
          <View style={s.caseSummary}>
            <View style={s.ticketTop}><Text style={s.ticketNumber}>{selected.number}</Text><View style={[s.ticketStatus, ['resolved', 'closed'].includes(selected.status) && s.ticketStatusDone]}><Text style={[s.ticketStatusText, ['resolved', 'closed'].includes(selected.status) && { color: '#477452' }]}>{catalog.statuses[selected.status]}</Text></View></View>
            <Text style={s.caseTitle}>{selected.label}</Text>
            <View style={s.caseMeta}><Text style={s.muted}>From {selected.requester}</Text><Text style={s.muted}>{selected.department_label}</Text><Text style={s.muted}>{new Date(selected.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>
            {selected.reference && <Text style={s.caseReference}>{selected.reference.label}: {selected.reference.title}</Text>}
          </View>
          <View style={[s.caseLayout, { flexDirection: width >= 1000 ? 'row' : 'column' }]}>
            <View style={[s.caseMain, width < 1000 && { width: '100%', flex: undefined }]}>
              <View style={s.detailPanel}><Text style={s.panelTitle}>Reported Concern</Text>
          <Text style={s.detailCopy}>{selected.details}</Text>{!!selected.evidence && <Text>Original work evidence: {selected.evidence}</Text>}{!!selected.image_data && <Image source={{ uri: selected.image_data }} style={s.photo} resizeMode="contain" />}

              </View>
              <View style={s.detailPanel}>
                <Text style={s.panelTitle}>Conversation</Text>
                {!selected.replies?.length && <Text style={s.muted}>{moderator && !selected.can_handle ? 'Accept this concern to start replying to the member.' : 'No replies yet.'}</Text>}
                {selected.replies?.map(r => <View key={r.id} style={{ gap: 5 }}><Text style={s.muted}>{r.sender} / {new Date(r.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</Text><Bubble mine={moderator ? r.is_staff : !r.is_staff}>{r.message}</Bubble></View>)}
          {(!moderator || selected.can_handle) && <><TextInput accessibilityLabel="Reply to report" style={[s.input, s.multiline, { minHeight: 80 }]} multiline maxLength={4000} value={reply} onChangeText={setReply} placeholder="Write a reply" />
          <Button compact primary disabled={busy || !reply.trim()} onPress={() => run(async () => { setSelected(await request<Ticket>(`tickets/${selected.id}/`, 'POST', { message: reply })); setReply(''); })}>Send reply</Button></>}
          {!moderator && ['resolved', 'closed'].includes(selected.status) && <Text style={s.muted}>Replying reopens this report if you still need help.</Text>}

              </View>
            </View>
            <View style={[s.caseSide, { width: width >= 1000 ? 320 : '100%' }]}>
          {assignments && <View style={s.detailPanel}><Text style={s.panelTitle}>Case Handling</Text>
            <Text style={s.bold}>Handled by: {selected.assigned_to || 'Waiting for a moderator'}</Text>
            {!selected.assigned_to_id && !['resolved', 'closed'].includes(selected.status) && <Button compact primary disabled={busy} onPress={() => assignmentAction('claim')}>Accept concern</Button>}
            {!!selected.transfer_to_id && <Text>Transfer pending confirmation from {selected.transfer_to}. The current moderator remains responsible until acceptance.</Text>}
            {selected.transfer_to_id === catalog.user_id && <View style={s.row}><Button compact primary disabled={busy} onPress={() => assignmentAction('accept_transfer')}>Confirm and accept transfer</Button><Button compact disabled={busy} onPress={() => assignmentAction('decline_transfer')}>Decline transfer</Button></View>}
            {selected.can_handle && (selected.transfer_to_id ? <Button compact disabled={busy} onPress={() => assignmentAction('cancel_transfer')}>Cancel transfer</Button> : !['resolved', 'closed'].includes(selected.status) && <>
              <Text>Transfer to another customer service moderator:</Text>
              <View style={s.options}>{agents.map(agent => <Button compact key={agent.id} disabled={busy} primary={transferTarget === agent.id} onPress={() => setTransferTarget(agent.id)}>{agent.username}</Button>)}</View>
              {!agents.length && <Text>No other available customer service moderators.</Text>}
              {transferTarget !== null && <Button compact disabled={busy} onPress={() => assignmentAction('transfer', transferTarget)}>Request transfer ? recipient must confirm</Button>}
            </>)}
          </View>}
          {!!selected.reported_username && <View style={s.card}>
            <Text style={s.bold}>Reported account: @{selected.reported_username}</Text>
            {assignments && selected.reported_user && <Button compact disabled={busy} onPress={() => run(async () => setReportedProfile(await request<ReportedProfile>(`tickets/${selected.id}/reported-profile/`)))}>View reported person's profile</Button>}
            {reportedProfile && <>
              <Text style={s.title}>{reportedProfile.name}</Text>
              <Text>@{reportedProfile.username} - {reportedProfile.role}</Text>
              <Text style={s.muted}>Joined {new Date(reportedProfile.joined_at).toLocaleDateString()}</Text>
              <Text>{reportedProfile.restricted ? 'Account access restricted' : 'Account access active'}</Text>
              {!!reportedProfile.bio && <Text>{reportedProfile.bio}</Text>}
              {reportedProfile.role === 'artist' && <Text style={s.bold}>Approved artworks</Text>}
              {reportedProfile.artworks.map(artwork => <View style={s.record} key={artwork.id}>
                {!!artwork.image_data && <Image source={{ uri: artwork.image_data }} style={s.thumb} />}
                <Text style={s.flex}>{artwork.title}</Text>
              </View>)}
              <Button compact onPress={() => setReportedProfile(null)}>Close profile</Button>
            </>}
          </View>}
          {moderator && selected.can_handle && <View style={s.detailPanel}><Text style={s.panelTitle}>Case Status</Text><View style={s.row}>{Object.entries(catalog.statuses).map(([value, label]) => <Button compact key={value} disabled={busy || value === selected.status} onPress={() => run(async () => setSelected(await request<Ticket>(`tickets/${selected.id}/`, 'PATCH', { status: value })))}>{label}</Button>)}</View></View>}

              {moderator && selected.can_handle && <View style={s.detailPanel}>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: caseActionsExpanded }} onPress={() => setCaseActionsExpanded(value => !value)} style={s.caseActionsToggle}><Text style={s.panelTitle}>Additional Case Actions</Text>{caseActionsExpanded ? <ChevronUp size={18} color="#A84B46" /> : <ChevronDown size={18} color="#A84B46" />}</Pressable>
                {caseActionsExpanded && <TicketActions ticket={selected} role={catalog.role} onUpdated={async () => setSelected(await request<Ticket>(`tickets/${selected.id}/`))} />}
              </View>}
            </View>
          </View>
        </> : <>
          <View style={s.reportToolbar}>
            <View style={s.reportToolbarTop}>
              <View style={{ flex: 1, gap: 3 }}><Text style={s.listHeading}>Reports</Text><Text style={s.muted}>{tickets.results.length} loaded{statusFilter ? ` / ${catalog.statuses[statusFilter]}` : ''}</Text></View>
              {(!assignments || queue !== 'waiting') && <Pressable accessibilityRole="button" accessibilityLabel="Filter reports by status" accessibilityState={{ expanded: statusMenuOpen }} disabled={busy} onPress={() => setStatusMenuOpen(value => !value)} style={s.filterToggle}><SlidersHorizontal size={16} color="#A84B46" /><Text style={s.filterLabel}>{statusFilter ? catalog.statuses[statusFilter] : 'All Statuses'}</Text>{statusMenuOpen ? <ChevronUp size={16} color="#A84B46" /> : <ChevronDown size={16} color="#A84B46" />}</Pressable>}
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh reports" disabled={busy} onPress={() => run(() => loadTickets())} style={[s.queueRefresh, busy && s.disabled]}><RefreshCw size={18} color="#A84B46" /></Pressable>
            </View>
            {(!assignments || queue !== 'waiting') && statusMenuOpen && <View style={s.statusOptions}>{[['', 'All Statuses'], ...Object.entries(catalog.statuses)].map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: statusFilter === key }} disabled={busy} onPress={() => { setStatusFilter(key); setStatusMenuOpen(false); }} style={[s.statusOption, statusFilter === key && s.statusOptionActive]}><Text style={[s.filterLabel, statusFilter === key && s.white]}>{label}</Text></Pressable>)}</View>}
          </View>
          {!busy && !tickets.results.length && <View style={s.queueEmpty}><Inbox size={30} color="#C49A90" /><Text style={s.listHeading}>No Reports Here</Text><Text style={s.muted}>{statusFilter ? 'Try another status filter to see more concerns.' : 'Reports will appear here when they enter this queue.'}</Text></View>}
          {tickets.results.map(t => <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${t.number}: ${t.label}`} disabled={busy} style={s.ticketCard} key={t.id} onPress={() => run(async () => { setSelected(await request<Ticket>(`tickets/${t.id}/`)); setReply(''); })}>
            <View style={s.ticketTop}><Text style={s.ticketNumber}>{t.number}</Text><View style={[s.ticketStatus, ['resolved', 'closed'].includes(t.status) && s.ticketStatusDone]}><Text style={[s.ticketStatusText, ['resolved', 'closed'].includes(t.status) && { color: '#477452' }]}>{catalog.statuses[t.status]}</Text></View></View>
            <View style={s.ticketSubjectRow}><Text style={s.ticketSubject}>{t.label}</Text><ChevronRight size={20} color="#A84B46" /></View>
            {t.reference && <Text style={s.muted} numberOfLines={2}>{t.reference.label}: {t.reference.title}</Text>}
            <View style={s.ticketMeta}>{moderator && <Text style={s.muted}>From {t.requester}</Text>}<Text style={s.muted}>{new Date(t.created_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>
          </TouchableOpacity>)}
          {tickets.next_offset !== null && <Button disabled={busy} onPress={() => run(() => loadTickets(tickets.next_offset!))}>More reports</Button>}
        </>}
      </>}
      {busy && <ActivityIndicator accessibilityLabel="Loading support" color="#C15656" />}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s = StyleSheet.create({
  compactButton: { alignSelf: 'flex-start', minHeight: 40, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 8 },
  caseNavigation: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, caseBack: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40 },
  caseSummary: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12, padding: 18, gap: 10 }, caseTitle: { fontSize: 22, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#3A2D2A' }, caseMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, caseReference: { fontSize: 12, lineHeight: 18, color: '#A84B46', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFE1DC' },
  caseLayout: { alignItems: 'flex-start', gap: 16 }, caseMain: { flex: 1, minWidth: 0, gap: 14 }, caseSide: { flexShrink: 0, gap: 14 },
  detailPanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12, padding: 16, gap: 12 }, panelTitle: { fontSize: 15, fontWeight: '700', color: '#5A3D37' }, detailCopy: { color: '#453731', fontSize: 14, lineHeight: 21 }, caseActionsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  queuePanel: { gap: 12, padding: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 14 },
  queueTabs: { gap: 8 }, queueTab: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5E8E3' },
  queueTabActive: { backgroundColor: '#BC5555' }, queueTabText: { fontSize: 13, fontWeight: '700', color: '#A84B46' },
  reportToolbar: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12, padding: 14, gap: 12 }, reportToolbarTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  listHeading: { fontSize: 16, fontWeight: '700', color: '#5A3D37' }, filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E5DAD3', borderRadius: 8 }, filterLabel: { color: '#A84B46', fontSize: 12, fontWeight: '600' },
  queueRefresh: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#F5E8E3' }, statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EFE1DC' }, statusOption: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: '#F5E8E3' }, statusOptionActive: { backgroundColor: '#BC5555' },
  queueEmpty: { padding: 28, gap: 10, alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12 },
  ticketCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EFE1DC', borderRadius: 12, padding: 18, gap: 10 }, ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  ticketNumber: { color: '#A84B46', fontSize: 12, fontWeight: '700' }, ticketStatus: { backgroundColor: '#F5E8E3', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }, ticketStatusDone: { backgroundColor: '#EDF4EE' }, ticketStatusText: { fontSize: 11, fontWeight: '700', color: '#A84B46' },
  ticketSubjectRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, ticketSubject: { flex: 1, fontSize: 16, fontWeight: '700', color: '#3A2D2A' }, ticketMeta: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: '#F1E8E2', paddingTop: 10 },
  page: { flex: 1, backgroundColor: '#FAF7F3' }, header: { padding: 18, backgroundColor: '#FFF', borderBottomWidth: 1, borderColor: '#E8DAD2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  brand: { fontSize: 23, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#B54848', marginBottom: 4 },
  iconButton: { padding: 8, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { gap: 16, paddingVertical: 12, marginBottom: 8 },
  heroTitle: { fontSize: 26, lineHeight: 34, fontFamily: 'LoraSemiBold', fontWeight: '600', color: '#3E322B' },
  heroCopy: { fontSize: 16, lineHeight: 24, color: '#74665D' },
  restartButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#52687C', borderRadius: 10, paddingVertical: 13, paddingHorizontal: 18, minHeight: 46 },
  restartText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  introduction: { width: '100%', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#F1E8DF' },
  concernCard: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E3D7D0', borderRadius: 16, padding: 18, gap: 16 },
  concernHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, borderBottomWidth: 1, borderBottomColor: '#EEE4DD', paddingBottom: 16 },
  concernTitle: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: '#603C36' },
  title: { fontSize: 21, fontWeight: '700', color: '#603C36' }, content: { padding: 22, paddingTop: 28, paddingBottom: 60, gap: 14, maxWidth: 1200, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, flex: { flex: 1, minWidth: 150 }, options: { gap: 8 },
  button: { borderWidth: 1, borderColor: '#E2D2C8', borderRadius: 11, paddingVertical: 14, paddingHorizontal: 18, backgroundColor: '#fff' }, buttonText: { color: '#82443D', fontWeight: '600' }, primary: { backgroundColor: '#B65B50', borderColor: '#B65B50' }, white: { color: '#fff' }, disabled: { opacity: 0.45 },
  bubble: { padding: 16, borderRadius: 14, backgroundColor: '#F1E8DF', maxWidth: '94%', alignSelf: 'flex-start' }, mine: { alignSelf: 'flex-end', backgroundColor: '#F9DDCF' }, bubbleText: { color: '#453731', lineHeight: 22 },
  input: { borderWidth: 1, borderColor: '#CABDB3', borderRadius: 8, padding: 12, backgroundColor: '#fff', color: '#322B29' }, multiline: { minHeight: 110, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderColor: '#E3D7D0', backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 }, record: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12, borderWidth: 1, borderColor: '#E3D7D0', borderRadius: 10 },
  accountAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#F1E8DF', alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 54, height: 54, borderRadius: 6 }, photo: { width: '100%', height: 230 }, bold: { fontWeight: '700', color: '#603C36' }, muted: { color: '#776860', fontSize: 12, lineHeight: 18 }, error: { color: '#AF1535', padding: 12, backgroundColor: '#FFF0F0' },
});
