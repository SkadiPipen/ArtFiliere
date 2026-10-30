import { Text, TextInput } from '@/components/Typography';
import AddressBook from '@/components/AddressBook';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '@/firebase/config';
import CalendarDateField from '@/components/CalendarDateField';
import { settingsRequest, pickSettingsImage, openSettingsDocument } from './settingsApi';

type Registration = { tin_number: string; expires_on: string | null; certificate: string; certificate_name: string; status: string; hourly_rate: string; bio: string; updates: { id: number; status: string; review_note: string; submitted_at: string }[] };
type Profile = { username: string; email: string; firebase_uid: string; role: string; profile_image: string; first_name: string; middle_name: string; last_name: string; date_of_birth: string | null; contact_number: string; created_at: string; is_accepting_commissions: boolean; addresses: Record<string, string | boolean>[]; artist_registration: Registration | null };

function Field({ label, value, onChange, secure = false }: { label: string; value: string; onChange?: (value: string) => void; secure?: boolean }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text>{onChange ? <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} secureTextEntry={secure} autoCapitalize={secure ? 'none' : 'sentences'} autoCorrect={!secure} style={s.input} /> : <Text selectable style={s.readonly}>{value || 'Not provided'}</Text>}</View>;
}
function Button({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && { opacity: 0.5 }]}><Text style={s.buttonText}>{label}</Text></Pressable>;
}

export default function AccountSettingsPanel({ section }: { section: 'account' | 'privacy' }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [success, setSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''), [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [tin, setTin] = useState(''), [expiry, setExpiry] = useState(''), [evidence, setEvidence] = useState<string | null>(null);
  const [noExpiry, setNoExpiry] = useState(true), [showCertificate, setShowCertificate] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const data = await settingsRequest(); setProfile(data); setTin(data.artist_registration?.tin_number || ''); setExpiry(data.artist_registration?.expires_on || ''); setNoExpiry(!data.artist_registration?.expires_on); setError(''); }
    catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => auth.onAuthStateChanged(user => { if (user) load(); else { setProfile(null); setLoading(false); setError('Please sign in to manage settings.'); } }), [load]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setSuccess('');
    try { await work(); } catch (e: any) { setError(e.message || 'Unable to save your changes.'); } finally { setBusy(false); }
  };
  const update = (key: keyof Profile, value: string) => setProfile(previous => previous ? { ...previous, [key]: value } : previous);
  const save = () => run(async () => {
    if (!profile) return;
    const values = section === 'account' ? { username: profile.username, contact_number: profile.contact_number, profile_image: profile.profile_image } : { contact_number: profile.contact_number, first_name: profile.first_name, middle_name: profile.middle_name, last_name: profile.last_name, ...(profile.date_of_birth ? { date_of_birth: profile.date_of_birth } : {}) };
    await settingsRequest('', 'PATCH', values);
    setProfile(await settingsRequest());
    setSuccess('Your changes have been saved.');
  });
  const changePassword = () => run(async () => {
    const user = auth.currentUser;
    if (!user?.email) throw Error('Please sign in again.');
    if (!currentPassword || password.length < 6 || password !== confirm) throw Error('Enter your current password and matching new passwords of at least 6 characters.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, password);
      setCurrentPassword(''); setPassword(''); setConfirm(''); setSuccess('Your password has been changed.');
    } catch (e: any) {
      const messages: Record<string, string> = { 'auth/invalid-credential': 'Your current password is incorrect.', 'auth/wrong-password': 'Your current password is incorrect.', 'auth/weak-password': 'Choose a stronger password that meets your account password policy.', 'auth/password-does-not-meet-requirements': 'The new password does not meet your account password policy.', 'auth/too-many-requests': 'Too many attempts. Please try again later.', 'auth/network-request-failed': 'Check your connection and try again.' };
      throw Error(messages[e.code] || 'Unable to change password. Please sign in again and retry.');
    }
  });
  const submitBir = () => run(async () => {
    if (!evidence) throw Error('Attach a clear photo of the updated BIR registration.');
    if (!noExpiry && !expiry) throw Error('Choose the expiration date shown on your document.');
    await settingsRequest('bir/', 'POST', { tin_number: tin, evidence_image: evidence, expires_on: noExpiry ? null : expiry });
    setEvidence(null); await load(); setSuccess('BIR update submitted to the Creative Moderator. Your current registration stays unchanged until approval.');
  });
  const registration = profile?.artist_registration;
  const passwordAccount = auth.currentUser?.providerData.some(provider => provider.providerId === 'password');
  const avatar = profile?.profile_image || auth.currentUser?.photoURL;
  return <View style={s.panel}>
    <Text style={s.title}>{section === 'account' ? 'Account Settings' : 'Data & Privacy'}</Text>
    {loading && <ActivityIndicator color="#C15656" />}
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!!success && <Text accessibilityRole="alert" style={s.success}>{success}</Text>}
    {profile && !loading && (section === 'account' ? <>
      <View style={s.photoRow}>{avatar ? <Image source={{ uri: avatar }} style={s.avatar} /> : <View style={[s.avatar, s.initial]}><Text style={{ color: '#C15656', fontSize: 26 }}>{profile.username?.slice(0, 1).toUpperCase()}</Text></View>}<View style={{ flex: 1, gap: 8 }}><Text style={s.label}>Profile picture</Text><Button label="Change photo" disabled={busy} onPress={() => run(async () => { const image = await pickSettingsImage(true); if (image) update('profile_image', image); })} /></View></View>
      <Field label="Username" value={profile.username} onChange={value => update('username', value)} />
      <Field label="Email" value={profile.email} />
      <Field label="Account ID" value={profile.firebase_uid} />
      <Field label="Account role" value={profile.role.replaceAll('_', ' ')} />
      <Field label="Contact number" value={profile.contact_number} onChange={value => update('contact_number', value)} />
      <Field label="Member since" value={new Date(profile.created_at).toLocaleDateString()} />
      {registration && <><Field label="Default hourly rate" value={`PHP ${registration.hourly_rate}`} /><Field label="Artist bio" value={registration.bio || ''} /><Field label="Accepting commissions" value={profile.is_accepting_commissions ? 'Yes' : 'No'} /></>}
      {['buyer', 'artist'].includes(profile.role) && <AddressBook showLocationFields={false} />}
      <Button label={busy ? 'Saving...' : 'Save account changes'} disabled={busy} onPress={save} />
    </> : <>
      <Field label="First name" value={profile.first_name} onChange={value => update('first_name', value)} />
      <Field label="Middle name" value={profile.middle_name} onChange={value => update('middle_name', value)} />
      <Field label="Last name" value={profile.last_name} onChange={value => update('last_name', value)} />
      <Field label="Contact number" value={profile.contact_number} onChange={value => update('contact_number', value)} />
      <View style={s.field}><Text style={s.label}>Birthday</Text><CalendarDateField label="Birthday" value={profile.date_of_birth || ''} onChange={value => update('date_of_birth', value)} maximumDate={new Date()} /></View>
      <Button label="Save personal information" disabled={busy} onPress={save} />
      {profile.role === 'artist' && registration && <View style={s.section}>
        <Text style={s.subtitle}>BIR artist registration</Text>
        <Field label="Current TIN" value={registration.tin_number} />
        <Field label="Registration status" value={registration.status} />
        <Field label="Recorded expiration" value={registration.expires_on || 'No expiration recorded'} />
        <Button label={showCertificate ? 'Hide current registration' : 'View current registration'} disabled={busy} onPress={() => registration.certificate.startsWith('data:image/') ? setShowCertificate(!showCertificate) : run(() => openSettingsDocument(registration.certificate, registration.certificate_name || 'bir-registration.pdf'))} />
        {showCertificate && registration.certificate.startsWith('data:image/') && <Image source={{ uri: registration.certificate }} resizeMode="contain" style={s.evidence} />}
        {registration.updates.map(item => <View key={item.id} style={s.record}><Text style={s.label}>Update #{item.id}: {item.status}</Text><Text style={s.copy}>{new Date(item.submitted_at).toLocaleString()}</Text>{!!item.review_note && <Text style={s.copy}>Moderator note: {item.review_note}</Text>}</View>)}
        {!registration.updates.some(item => item.status === 'pending') && <>
          <Text style={s.copy}>Submit the updated record with photo evidence. A Creative Moderator must approve it before your current registration is replaced.</Text>
          <Field label="Updated TIN (9 digits)" value={tin} onChange={setTin} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: noExpiry }} onPress={() => setNoExpiry(!noExpiry)} style={s.record}><Text style={s.copy}>{noExpiry ? '[x]' : '[ ]'} No expiration date is shown on this document</Text></Pressable>
          {!noExpiry && <CalendarDateField label="BIR document expiration" value={expiry} onChange={setExpiry} minimumDate={new Date(new Date().setHours(0, 0, 0, 0))} />}
          <Button label="Attach BIR photo evidence" disabled={busy} onPress={() => run(async () => { const image = await pickSettingsImage(); if (image) setEvidence(image); })} />
          {evidence && <Image source={{ uri: evidence }} accessibilityLabel="Selected BIR photo evidence" resizeMode="contain" style={s.evidence} />}
          <Button label="Submit update for Creative Moderator review" disabled={busy || !evidence} onPress={submitBir} />
        </>}
      </View>}
      <View style={s.section}><Text style={s.subtitle}>Change password</Text>
        {passwordAccount ? <><Field label="Current password" value={currentPassword} onChange={setCurrentPassword} secure /><Field label="New password" value={password} onChange={setPassword} secure /><Field label="Confirm new password" value={confirm} onChange={setConfirm} secure /><Button label="Change password" disabled={busy} onPress={changePassword} /></> : <Text style={s.copy}>This account uses a linked sign-in provider. Manage your password through that provider.</Text>}
      </View>
    </>)}
    <Button label="Refresh saved information" disabled={busy || loading} onPress={load} />
  </View>;
}

const s = StyleSheet.create({
  panel: { gap: 16 }, title: { fontSize: 20, fontWeight: '700', color: '#1A202C' }, subtitle: { fontSize: 16, fontWeight: '700', color: '#60483C' },
  field: { gap: 7 }, label: { fontSize: 13, fontWeight: '600', color: '#4A5568' }, input: { borderWidth: 1, borderColor: '#DCE2E9', padding: 12, borderRadius: 9, minHeight: 46, color: '#3A2D2A', backgroundColor: '#FFF' },
  readonly: { fontSize: 13, lineHeight: 20, color: '#647184', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 9 },
  button: { paddingVertical: 12, paddingHorizontal: 14, minHeight: 44, borderRadius: 9, backgroundColor: '#C15656', alignItems: 'center', justifyContent: 'center' }, buttonText: { fontSize: 13, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 }, avatar: { width: 86, height: 86, borderRadius: 43 }, initial: { backgroundColor: '#FFF0ED', alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#EDF2F7', paddingTop: 20, gap: 14 }, record: { padding: 12, borderRadius: 9, backgroundColor: '#F8FAFC', gap: 5 }, copy: { color: '#647184', fontSize: 13, lineHeight: 20 },
  evidence: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#F8FAFC' }, error: { color: '#B00020', fontSize: 13 }, success: { color: '#286647', fontSize: 13, lineHeight: 20 },
});
