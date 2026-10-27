import { Text, TextInput } from '@/components/Typography';
import CommissionDeliveryPanel from './CommissionDeliveryPanel';
import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { downloadProtectedFile } from '@/services/purchases';
import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Platform, TouchableOpacity, View } from 'react-native';
import { commissionApi } from './CommissionDetailScreen';

const field = { borderWidth: 1, borderColor: '#DCCFC5', borderRadius: 10, padding: 12, backgroundColor: '#FFF', color: '#40322E' } as const;
function Action({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity disabled={disabled} onPress={onPress} style={{ padding: 12, borderRadius: 9, backgroundColor: disabled ? '#DDD' : '#C15656', alignSelf: 'flex-start' }}><Text style={{ color: '#FFF', fontWeight: '700' }}>{label}</Text></TouchableOpacity>;
}

export default function CommissionProgressPanel({ id, onUpdated, onRevisionLayout, focusRevision }: { id: number; onUpdated: () => void; onRevisionLayout?: (y: number) => void; focusRevision?: boolean }) {
  const revisionPosition = useRef<number | null>(null);
  const [data, setData] = useState<any>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [reply, setReply] = useState('');

  // Fixed Sparkling Glitter Animation at the edge of the line
  const sparklePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(sparklePulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sparklePulse]);

  const sparkleScale = sparklePulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.85, 1.25, 0.85],
  });

  const sparkleOpacity = sparklePulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.75, 1, 0.75],
  });

  const sparkleRotate = sparklePulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  useEffect(() => {
    if (focusRevision && revisionPosition.current !== null) onRevisionLayout?.(revisionPosition.current);
  }, [focusRevision]);

  const load = useCallback(async () => {
    try { setData(await commissionApi(`flow/${id}/`)); } catch (e: any) { setError(e.message); }
  }, [id]);

  useEffect(() => { void load(); const timer = setInterval(load, 15000); return () => clearInterval(timer); }, [load]);

  const stages = data?.milestones || [];
  const stage = stages.find((m: any) => m.number === selected) || [...stages].reverse().find((m: any) => m.submissions.length) || stages[0];
  const submission = stage?.submissions[stage.submissions.length - 1];
  const percentage = Math.round(stages.filter((m: any) => m.submissions.length).length / 3 * 100);

  const currentStageIndex = stages.findIndex((m: any) => m.id === stage?.id);
  const hasPrev = currentStageIndex > 0;
  const hasNext = currentStageIndex >= 0 && currentStageIndex < stages.length - 1;

  const handlePrev = () => {
    if (hasPrev) {
      setSelected(stages[currentStageIndex - 1].number);
    }
  };

  const handleNext = () => {
    if (hasNext) {
      setSelected(stages[currentStageIndex + 1].number);
    }
  };

  useEffect(() => {
    let active = true;
    setImage('');
    if (submission?.type.startsWith('image/')) {
      const preview = async () => {
        const token = await auth.currentUser?.getIdToken();
        const response = await fetch(`${API_URL}/api/commissions/flow/${id}/files/${submission.id}/?preview=1`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Unable to load the protected stage preview.');
        const reader = new FileReader();
        reader.onload = () => { if (active) setImage(String(reader.result)); };
        reader.readAsDataURL(await response.blob());
      };
      const nativePreview = async () => {
        const fs = await import('expo-file-system/legacy');
        const token = await auth.currentUser?.getIdToken();
        const result = await fs.downloadAsync(`${API_URL}/api/commissions/flow/${id}/files/${submission.id}/?preview=1`, `${fs.cacheDirectory}commission-preview-${id}-${submission.id}.jpg`, { headers: { Authorization: `Bearer ${token}` } });
        if (result.status !== 200) throw new Error('Unable to load stage preview.');
        if (active) setImage(result.uri);
      };
      void (Platform.OS === 'web' ? preview() : nativePreview()).catch(e => { if (active) setError(e.message); });
    }
    return () => { active = false; };
  }, [id, submission?.id]);

  useEffect(() => { setComment(''); setReply(''); }, [stage?.id]);

  const act = async (action: string, extra: any = {}) => {
    if (!stage || busy) return;
    setBusy(true); setError('');
    try { setData(await commissionApi(`flow/${id}/`, { action, milestone_id: stage.id, ...extra })); setComment(''); setReply(''); onUpdated(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  const upload = async () => {
    if (!stage || busy) return;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (picked.canceled) return;
      setBusy(true); setError('');
      const file = picked.assets[0]; const body = new FormData();
      body.append('action', 'submit'); body.append('milestone_id', String(stage.id));
      if (Platform.OS === 'web') body.append('file', await (await fetch(file.uri)).blob(), file.name);
      else body.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/octet-stream' } as any);
      setData(await commissionApi(`flow/${id}/`, body)); onUpdated();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  };

  if (!data) return <View style={{ padding: 20 }}>{error ? <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text> : <ActivityIndicator color="#C15656" />}</View>;

  const current = data.status === `STAGE_${stage?.number}`;
  const canRevise = !data.is_artist && current && stage?.status === 'SUBMITTED' && !stage.revision_used && !stage.delivery_ready_at && !data.disputed;
  const canUpdate = data.is_artist && current && ['PENDING', 'REVISION_REQUESTED'].includes(stage?.status) && !data.disputed;

  return <View style={{ padding: 18, gap: 18 }}>
    <View><Text style={{ fontSize: 23, fontWeight: '800', color: '#C15656' }}>Progress Track</Text><Text style={{ color: '#75655F', marginTop: 5 }}>{data.title} · {data.is_artist ? `Client: @${data.buyer}` : `Artist: @${data.artist}`}</Text></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#A13030' }}>{error}</Text>}
    {data.disputed && <Text style={{ color: '#A13030' }}>Updates and approval are paused for Customer Service review.</Text>}
    
    {/* Progress Track Line with Stationary Sparkling Glitter at the End of the Filled Bar */}
    <View style={{ height: 10, backgroundColor: '#EADFD7', borderRadius: 10, position: 'relative' }}>
      <View style={{ height: 10, width: `${percentage}%`, backgroundColor: '#C15656', borderRadius: 10, position: 'relative' }}>
        {percentage > 0 && (
          <Animated.View
            style={{
              position: 'absolute',
              right: -8,
              top: -5,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: '#FFFFFF',
              shadowColor: '#C15656',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.85,
              shadowRadius: 5,
              elevation: 4,
              borderWidth: 1,
              borderColor: '#FFF4D0',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: sparkleOpacity,
              transform: [{ scale: sparkleScale }],
            }}
          >
            <Animated.Text
              style={{
                fontSize: 12,
                lineHeight: 14,
                color: '#C15656',
                fontWeight: '900',
                transform: [{ rotate: sparkleRotate }],
              }}
            >
              ✦
            </Animated.Text>
          </Animated.View>
        )}
      </View>
    </View>

    {image ? <Image source={{ uri: image }} style={{ width: '100%', height: 310, backgroundColor: '#FFF', borderRadius: 12 }} resizeMode="contain" /> : submission?.type.startsWith('image/') ? <ActivityIndicator style={{ height: 120 }} color="#C15656" /> : <View style={{ padding: 30, backgroundColor: '#FFF', borderRadius: 12 }}><Text style={{ textAlign: 'center', color: '#75655F' }}>{submission ? 'This stage includes a PDF submission.' : 'No stage artwork submitted yet.'}</Text>{submission && <Action label="View stage file" onPress={() => void downloadProtectedFile(`commissions/flow/${id}/files/${submission.id}/`, submission.name, submission.type).catch(e => setError(e.message))} />}</View>}
    
    {/* Stage Progress Block with Left and Right Arrows */}
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 8 }}>
      <TouchableOpacity
        onPress={handlePrev}
        disabled={!hasPrev}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: hasPrev ? '#FAF5EE' : '#F0EBE5',
          borderWidth: 1,
          borderColor: hasPrev ? '#DCCFC5' : '#EAE3DC',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hasPrev ? 1 : 0.4,
        }}
        accessibilityLabel="Previous stage"
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: hasPrev ? '#C15656' : '#999', marginTop: -2 }}>‹</Text>
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ color: '#C15656', fontWeight: '800', fontSize: 18, textAlign: 'center' }}>{percentage}% of stages submitted</Text>
        <Text style={{ textAlign: 'center', color: '#75655F', marginTop: 5 }}>{stage ? `Stage ${stage.number}: ${stage.label} · ${stage.status.replace(/_/g, ' ')}` : 'Milestones will appear after agreement.'}</Text>
      </View>

      <TouchableOpacity
        onPress={handleNext}
        disabled={!hasNext}
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: hasNext ? '#FAF5EE' : '#F0EBE5',
          borderWidth: 1,
          borderColor: hasNext ? '#DCCFC5' : '#EAE3DC',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hasNext ? 1 : 0.4,
        }}
        accessibilityLabel="Next stage"
        accessibilityRole="button"
      >
        <Text style={{ fontSize: 22, fontWeight: '700', color: hasNext ? '#C15656' : '#999', marginTop: -2 }}>›</Text>
      </TouchableOpacity>
    </View>

    <CommissionDeliveryPanel data={data} milestone={stage} busy={busy} onAction={(name, extra) => { void act(name, extra); }} />
    {canUpdate && <Action label={stage.status === 'REVISION_REQUESTED' ? 'Upload revised stage artwork' : 'Post stage progress update'} onPress={() => void upload()} disabled={busy} />}
    <View onLayout={event => { revisionPosition.current = event.nativeEvent.layout.y; onRevisionLayout?.(event.nativeEvent.layout.y); }} style={{ borderTopWidth: 1, borderColor: '#E1D5CC', paddingTop: 20, gap: 12 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', color: '#C15656' }}>Revision</Text>
      <Text style={{ color: '#75655F' }}>One consolidated buyer revision request/comment per stage. Updated artwork does not reset this limit.</Text>
      {stage && <Text style={{ fontWeight: '700' }}>Stage {stage.number} · Revision {stage.revision_used ? '1/1 used' : '0/1 used'}</Text>}
      {stage?.revision_comment ? <View style={{ backgroundColor: '#FFF', borderRadius: 12, padding: 16, gap: 10 }}>
        <Text style={{ fontWeight: '700' }}>Buyer’s requested revision</Text><Text selectable>{stage.revision_comment}</Text><Text style={{ color: '#75655F', fontSize: 12 }}>{new Date(stage.revision_requested_at).toLocaleString()}</Text>
        {!!stage.revision_reply && <><Text style={{ fontWeight: '700' }}>Artist’s reply</Text><Text selectable>{stage.revision_reply}</Text><Text style={{ color: '#75655F', fontSize: 12 }}>{new Date(stage.revision_replied_at).toLocaleString()}</Text></>}
        {stage.submissions.filter((s: any) => new Date(s.uploaded_at) > new Date(stage.revision_requested_at)).map((s: any) => <Text key={s.id} style={{ color: '#527951' }}>Revised stage submitted: {s.name} · {new Date(s.uploaded_at).toLocaleString()}</Text>)}
      </View> : <Text style={{ color: '#75655F' }}>No revision requested for this stage.</Text>}
      {canRevise && <><TextInput style={field} multiline maxLength={2000} placeholder="Describe all requested changes in one comment" value={comment} onChangeText={setComment} /><Action label="Request revision (once this stage)" disabled={busy || !comment.trim()} onPress={() => void act('revise', { comment })} /></>}
      {canUpdate && stage.status === 'REVISION_REQUESTED' && !stage.revision_replied_at && <><TextInput style={field} multiline maxLength={2000} placeholder="Reply to the buyer’s requested changes" value={reply} onChangeText={setReply} /><Action label="Send artist reply" disabled={busy || !reply.trim()} onPress={() => void act('reply_revision', { reply })} /></>}
      {canUpdate && stage.status === 'REVISION_REQUESTED' && <Action label="Update this stage with revised artwork" disabled={busy} onPress={() => void upload()} />}
      {!data.is_artist && current && stage?.status === 'SUBMITTED' && !data.disputed && !(stage.number === 3 && data.art_type.toLowerCase() === 'physical') && <Action label="Approve this stage" disabled={busy} onPress={() => void act('approve')} />}
    </View>
  </View>;
}
