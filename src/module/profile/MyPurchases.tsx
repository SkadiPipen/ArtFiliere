import SigningModal from '@/module/chat-negotiations/SigningModal';
import { downloadPurchase, purchaseRequest } from '@/services/purchases';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Purchase = {
  id: number; title: string; artist: string; status: string; amount: string; agreement_id: number;
  verification_code?: string;
  is_simulated?: boolean; image?: string; can_download: boolean; can_rate: boolean; checkout_url?: string;
  review?: { artist_rating: number; artwork_rating: number; comment: string; artist_comment?: string; artwork_comment?: string };
  delivery?: { status: string; status_label: string; driver?: string; delivery_address: string; fee: string };
};

export default function MyPurchases({ onClose, filter = 'all' }: { onClose: () => void; filter?: 'all' | 'receive' | 'rate' | 'pay' }) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [artistRating, setArtistRating] = useState(0);
  const [artworkRating, setArtworkRating] = useState(0);
  const [artistComment, setArtistComment] = useState('');
  const [artworkComment, setArtworkComment] = useState('');
  const [agreement, setAgreement] = useState<number | null>(null);
  const syncing = useRef(false);
  const lastChecked = useRef(0);

  const load = useCallback(async (verify = false) => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      let rows: Purchase[] = await purchaseRequest('purchases/');
      if (verify || Date.now() - lastChecked.current > 30000) {
        lastChecked.current = Date.now();
        const pending = rows.filter(p => p.status === 'pending' && !p.is_simulated && p.checkout_url);
        const results = await Promise.allSettled(pending.map(p => purchaseRequest(`payments/${p.id}/refresh/`, 'POST')));
        if (pending.length) rows = await purchaseRequest('purchases/');
        const failed = results.find(r => r.status === 'rejected');
        if (failed?.status === 'rejected') setError(failed.reason.message); else setError('');
      }
      setPurchases(rows);
    } catch (e: any) { 
      setError(e.message); 
    } finally { 
      syncing.current = false; 
      setLoading(false); 
    }
  }, []);

  useEffect(() => { 
    load(); 
    const timer = setInterval(load, 5000); 
    return () => clearInterval(timer); 
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); 
    setError('');
    try { await action(); } 
    catch (e: any) { setError(e.message); } 
    finally { setBusy(false); }
  };

  const rows = purchases.filter(p => 
    filter === 'receive' 
      ? p.status === 'paid' && p.delivery && p.delivery.status !== 'delivered' 
      : filter === 'rate' 
        ? p.can_rate 
        : filter === 'pay' 
          ? p.status === 'pending' 
          : true
  );

  const stars = (label: string, rating: number, change: (n: number) => void) => (
    <View style={s.gap}>
      <Text>{label}</Text>
      <View style={s.row}>
        {[1, 2, 3, 4, 5].map(n => (
          <TouchableOpacity 
            key={n} 
            accessibilityLabel={`${label}: ${n} stars`} 
            onPress={() => change(n)}
          >
            <Text style={{ fontSize: 28, color: n <= rating ? '#D48C62' : '#aaa' }}>
              {n <= rating ? '\u2605' : '\u2606'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {agreement !== null ? (
        <SigningModal id={agreement} onClose={() => setAgreement(null)} onSigned={() => load(true)} />
      ) : null}
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.row}>
          <Text style={s.title}>{filter === 'rate' ? 'To Rate' : 'My Purchases'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={s.link}>Close</Text>
          </TouchableOpacity>
        </View>

        <Text>
          {filter === 'rate' 
            ? 'Paid purchases stay here until you submit your ratings. You can come back anytime.' 
            : 'Once payment is confirmed, your purchase appears here. Digital artworks are available as PNG downloads.'}
        </Text>

        <TouchableOpacity onPress={() => load(true)}>
          <Text style={s.link}>Refresh payment status</Text>
        </TouchableOpacity>

        {loading ? <ActivityIndicator /> : null}
        {Boolean(error) ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
        {!loading && rows.length === 0 ? <Text>No purchases in this category yet.</Text> : null}

        {rows.map(p => (
          <View key={p.id} style={s.card}>
            {Boolean(p.image) ? (
              <Image source={{ uri: p.image }} style={{ width: '100%', height: 180 }} resizeMode="contain" />
            ) : null}

            {Boolean(p.is_simulated) ? (
              <Text style={{ color: '#9A6700', fontWeight: '700' }}>Test purchase - no money charged</Text>
            ) : null}

            <Text style={s.title}>{p.title}</Text>
            <Text>by {p.artist}</Text>
            <Text>PHP {p.amount} · {p.status}</Text>
            {p.status === 'paid' && p.verification_code ? <Text selectable style={{ color: '#5D8A63', fontWeight: '800' }}>Transaction verification code: {p.verification_code}</Text> : null}

            {Boolean(p.agreement_id) ? (
              <TouchableOpacity onPress={() => setAgreement(p.agreement_id)}>
                <Text style={s.link}>View signed agreement</Text>
              </TouchableOpacity>
            ) : null}

            {p.status === 'pending' && Boolean(p.checkout_url) ? (
              <TouchableOpacity disabled={busy} onPress={() => run(() => Linking.openURL(p.checkout_url!))}>
                <Text style={s.link}>Continue payment</Text>
              </TouchableOpacity>
            ) : null}

            {p.status === 'expired' ? (
              <TouchableOpacity disabled={busy} onPress={() => run(async () => {
                const result = await purchaseRequest(`checkout/agreements/${p.agreement_id}/`, 'POST');
                if (result.checkout_url) await Linking.openURL(result.checkout_url);
                await load(true);
              })}>
                <Text style={s.link}>Start a new payment</Text>
              </TouchableOpacity>
            ) : null}

            {Boolean(p.can_download) ? (
              <TouchableOpacity 
                disabled={busy} 
                style={s.button} 
                onPress={() => 
                  run(async () => {
                    if ((p as any).is_commission && p.image) {
                      if (typeof window !== 'undefined' && window.document) {
                        const link = document.createElement('a');
                        link.href = p.image;
                        link.download = `${p.title.replace(/\s+/g, '_')}_commission.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      } else {
                        await Linking.openURL(p.image);
                      }
                    } else {
                      await downloadPurchase(p.id);
                    }
                  })
                }>
                <Text style={s.white}>Download artwork PNG</Text>
              </TouchableOpacity>
            ) : null}

            {Boolean(p.delivery) ? (
              <View style={s.gap}>
                <Text>Delivery: {p.delivery?.status_label}</Text>
                <Text>{p.delivery?.delivery_address}</Text>
                <Text>Delivery fee: PHP {p.delivery?.fee}</Text>
                <Text>Rider: {p.delivery?.driver || 'Awaiting assignment'}</Text>
              </View>
            ) : null}

            {Boolean(p.review) ? (
              <Text>
                Your ratings: artist {p.review?.artist_rating}/5 · artwork {p.review?.artwork_rating}/5
                {p.review?.artist_comment ? `\nArtist review: ${p.review.artist_comment}` : ''}
                {p.review?.artwork_comment ? `\nArtwork review: ${p.review.artwork_comment}` : ''}
                {p.review?.comment ? `\n${p.review.comment}` : ''}
              </Text>
            ) : null}

            {Boolean(p.can_rate) && reviewing !== p.id ? (
              <TouchableOpacity onPress={() => { 
                setReviewing(p.id); 
                setArtistRating(0); 
                setArtworkRating(0); 
                setArtistComment(''); 
                setArtworkComment(''); 
              }}>
                <Text style={s.link}>Rate artist and artwork</Text>
              </TouchableOpacity>
            ) : null}

            {Boolean(p.can_rate) && reviewing === p.id ? (
              <View style={s.gap}>
                {stars('Artist', artistRating, setArtistRating)}
                <TextInput 
                  accessibilityLabel="Artist review" 
                  style={s.input} 
                  multiline 
                  maxLength={2000} 
                  placeholder="Review your experience with the artist (optional)" 
                  value={artistComment} 
                  onChangeText={setArtistComment} 
                />
                {stars('Artwork', artworkRating, setArtworkRating)}
                <TextInput 
                  accessibilityLabel="Artwork review" 
                  style={s.input} 
                  multiline 
                  maxLength={2000} 
                  placeholder="Review the artwork (optional)" 
                  value={artworkComment} 
                  onChangeText={setArtworkComment} 
                />
                <TouchableOpacity 
                  disabled={busy || !artistRating || !artworkRating} 
                  style={[s.button, (!artistRating || !artworkRating || busy) && { opacity: 0.4 }]} 
                  onPress={() => run(async () => { 
                    await purchaseRequest(`purchases/${p.id}/review/`, 'POST', { 
                      artist_rating: artistRating, 
                      artwork_rating: artworkRating, 
                      artist_comment: artistComment, 
                      artwork_comment: artworkComment 
                    }); 
                    setReviewing(null); 
                    await load(); 
                  })}
                >
                  <Text style={s.white}>Submit ratings and reviews</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => setReviewing(null)}>
                  <Text style={s.link}>Rate later</Text>
                </TouchableOpacity>
                <Text>This purchase stays under To Rate in your profile until you submit.</Text>
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { padding: 24, paddingTop: 50, gap: 16, maxWidth: 800, width: '100%', alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#603c36' },
  row: { flexDirection: 'row', gap: 16, alignItems: 'center', justifyContent: 'space-between' },
  card: { padding: 18, borderWidth: 1, borderColor: '#e3d7d0', borderRadius: 12, gap: 10 },
  gap: { gap: 8 }, 
  input: { borderWidth: 1, borderColor: '#bbb', padding: 12, borderRadius: 8 },
  link: { color: '#C15656', paddingVertical: 8 }, 
  error: { color: '#b00020' },
  button: { backgroundColor: '#C15656', padding: 12, borderRadius: 8, alignItems: 'center' }, 
  white: { color: '#fff', fontWeight: '700' },
});
