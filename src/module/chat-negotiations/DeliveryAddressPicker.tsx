import { auth } from '@/firebase/config';
import API_URL from '@/services/api';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

export interface DeliveryQuote {
  token: string;
  delivery_address: string;
  fee: number;
  base_fee?: number;
  priority_fee?: number;
  distance_km?: number;
  is_priority?: boolean;
}

interface DeliveryAddressPickerProps {
  artworkId: number | string;
  artistAddress?: string;
  initialAddress?: string | any;
  revisionId?: number;
  onQuote: (quote: DeliveryQuote | null) => void;
}

export default function DeliveryAddressPicker({
  artworkId,
  artistAddress = 'Cebu City Art Studio',
  initialAddress = '',
  onQuote,
}: DeliveryAddressPickerProps) {
  const cleanAddressString = (raw: any): string => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      return (
        raw.delivery_address ||
        raw.address ||
        raw.formatted_address ||
        [raw.street, raw.barangay, raw.city, raw.province].filter(Boolean).join(', ') ||
        ''
      );
    }
    return String(raw);
  };

  const [address, setAddress] = useState<string>(() => cleanAddressString(initialAddress));
  const [isPriority, setIsPriority] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentQuote, setCurrentQuote] = useState<DeliveryQuote | null>(null);
  const debounceTimer = useRef<any>(null);

  const calculateLocalQuote = (targetAddr: string, priorityVal: boolean): DeliveryQuote => {
    const addr = targetAddr.trim().toLowerCase();
    let km = 4.5;
    if (addr.includes('mandaue')) km = 6.2;
    else if (addr.includes('lapu-lapu') || addr.includes('mactan')) km = 12.8;
    else if (addr.includes('talisay')) km = 11.0;
    else if (addr.includes('consolacion')) km = 14.5;
    else if (addr.includes('minglanilla')) km = 16.0;

    const baseFare = 50 + Math.max(0, km - 2) * 15;
    const priorityFee = priorityVal ? 40 : 0;
    const totalFare = Math.round(baseFare + priorityFee);

    return {
      token: `local_quote_${Date.now()}`,
      delivery_address: targetAddr.trim(),
      distance_km: Number(km.toFixed(1)),
      base_fee: Math.round(baseFare),
      priority_fee: priorityFee,
      fee: totalFare,
      is_priority: priorityVal,
    };
  };

  const fetchQuote = async (priorityVal: boolean, targetAddr: string) => {
    const finalAddress = targetAddr.trim() || 'Cebu City, Philippines';

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/delivery/quote/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artwork_id: artworkId,
          artist_address: artistAddress,
          delivery_address: finalAddress,
          is_priority: priorityVal,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const priorityFee = priorityVal ? 40 : 0;
        const totalFee = Number(data.fee) + (data.is_priority ? 0 : priorityFee);
        const resolved: DeliveryQuote = {
          ...data,
          fee: totalFee,
          base_fee: Number(data.fee) - (data.is_priority ? 40 : 0),
          priority_fee: priorityFee,
          is_priority: priorityVal,
        };
        setCurrentQuote(resolved);
        onQuote(resolved);
      } else {
        const fallback = calculateLocalQuote(finalAddress, priorityVal);
        setCurrentQuote(fallback);
        onQuote(fallback);
      }
    } catch {
      const fallback = calculateLocalQuote(finalAddress, priorityVal);
      setCurrentQuote(fallback);
      onQuote(fallback);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initAddressAndQuote = async () => {
      let resolvedAddress = cleanAddressString(initialAddress);

      if (!resolvedAddress && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch(`${API_URL}/auth/me/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const profile = await res.json();
            resolvedAddress = cleanAddressString(
              profile.delivery_address ||
              profile.address ||
              profile.location ||
              profile.buyer?.address
            );
          }
        } catch (err) {
          console.warn('Could not auto-fetch user profile address:', err);
        }
      }

      if (!resolvedAddress) {
        resolvedAddress = 'M.J. Cuenco Avenue corner R. Palma Street, Cebu City, Philippines 6000';
      }

      if (isMounted) {
        setAddress(resolvedAddress);
        fetchQuote(false, resolvedAddress);
      }
    };

    initAddressAndQuote();

    return () => {
      isMounted = false;
    };
  }, [artworkId, initialAddress]);

  const handleAddressChange = (text: string) => {
    setAddress(text);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      if (text.trim().length > 3) {
        fetchQuote(isPriority, text);
      }
    }, 800);
  };

  const handleAddressBlur = () => {
    if (address.trim()) {
      fetchQuote(isPriority, address);
    }
  };

  const handlePriorityToggle = (val: boolean) => {
    setIsPriority(val);
    fetchQuote(val, address);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Delivery Information (Physical Piece)</Text>
      <Text style={styles.label}>Destination Address (Editable) *</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter delivery address in Cebu..."
        placeholderTextColor="#999"
        value={address}
        onChangeText={handleAddressChange}
        onBlur={handleAddressBlur}
      />

      <View style={styles.priorityBox}>
        <View style={{ flex: 1 }}>
          <Text style={styles.priorityTitle}>Priority Delivery (+₱40.00)</Text>
          <Text style={styles.prioritySub}>Direct rush dispatch with dedicated rider</Text>
        </View>
        <Switch
          value={isPriority}
          onValueChange={handlePriorityToggle}
          trackColor={{ false: '#E5E5EA', true: '#D48C62' }}
        />
      </View>

      {loading && (
        <View style={styles.loaderRow}>
          <ActivityIndicator size="small" color="#BC5454" />
          <Text style={styles.loadingText}>Calculating distance and fare...</Text>
        </View>
      )}

      {currentQuote && !loading && (
        <View style={styles.quoteCard}>
          <Text style={styles.quoteDistance}>
            Estimated Distance: {currentQuote.distance_km} km
          </Text>
          <Text style={styles.quoteFee}>
            Delivery Fee: ₱{Number(currentQuote.fee).toFixed(2)}
          </Text>
          <Text style={styles.quoteFormula}>
            (₱50 base for first 2 km + ₱15/km {isPriority ? '+ ₱40 priority rush' : ''})
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12, marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#BC5454', marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 42,
    backgroundColor: '#FFF',
    fontSize: 14,
    color: '#333',
  },
  priorityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8F6',
    borderWidth: 1,
    borderColor: '#FADBD8',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  priorityTitle: { fontSize: 13, fontWeight: '700', color: '#BC5454' },
  prioritySub: { fontSize: 11, color: '#777', marginTop: 2 },
  loaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  loadingText: { fontSize: 12, color: '#777', marginLeft: 8 },
  quoteCard: {
    backgroundColor: '#F9FBF9',
    borderWidth: 1,
    borderColor: '#D4EFDF',
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
  },
  quoteDistance: { fontSize: 12, color: '#555' },
  quoteFee: { fontSize: 15, fontWeight: '700', color: '#27AE60', marginTop: 2 },
  quoteFormula: { fontSize: 11, color: '#888', marginTop: 2 },
});