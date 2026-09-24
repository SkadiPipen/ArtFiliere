import { auth } from '@/firebase/config';
import ContractPanel from '@/module/chat-negotiations/ContractPanel';
import API_URL from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Plus, X } from 'lucide-react-native';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const MAX_IMAGES = 4;

export default function CommissionRequestScreen() {
  const router = useRouter();
  const { artistId, artistName } = useLocalSearchParams<{ artistId: string; artistName?: string }>();

  const [windowWidth, setWindowWidth] = useState(Dimensions.get('window').width);
  const isDesktop = windowWidth > 860;

  const [showNegotiate, setShowNegotiate] = useState(false);
  const [createdCommissionId, setCreatedCommissionId] = useState<string | null>(null);

  React.useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  // Form states
  const [description, setDescription] = useState('');
  const [refImages, setRefImages] = useState<string[]>([]);
  const [artType, setArtType] = useState<'Physical' | 'Digital'>('Physical');
  const [tagInput, setTagInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(['Modern', 'Art Pop']);
  const [loading, setLoading] = useState(false);

  // Time & Rush States
  const [targetDate, setTargetDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  });
  const [isRush, setIsRush] = useState(false);

  // Rush Job Toggle
  const toggleRushJob = () => {
    const nextRush = !isRush;
    setIsRush(nextRush);
    const newDate = new Date();
    if (nextRush) {
      newDate.setDate(newDate.getDate() + 3);
    } else {
      newDate.setDate(newDate.getDate() + 14);
    }
    setTargetDate(newDate);
  };

  const formattedDate = targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = targetDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // Cross-platform Image Picker using updated MediaType API
  const handlePickImage = async () => {
    if (refImages.length >= MAX_IMAGES) {
      Alert.alert('Limit Reached', `You can upload up to ${MAX_IMAGES} reference images.`);
      return;
    }

    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera roll permissions are needed to select references.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'], // Fixes ImagePicker.MediaTypeOptions deprecation
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setRefImages((prev) => [...prev, uri]);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Image picker error.');
    }
  };

  const handleNext = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe your commission idea.');
      return;
    }

    try {
      setLoading(true);
      const email = auth.currentUser?.email || '';

      const res = await fetch(`${API_URL}/api/commissions/requests/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: Number(artistId),
          user_email: email,
          title: `Custom ${artType} Commission`,
          description,
          art_type: artType,
          tags: selectedTags.join(', '),
          is_rush_job: isRush,
          deadline: targetDate.toISOString(),
          time_duration: isRush ? 4500 : 3000,
          reference_images: refImages,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Set the ID and immediately display the contract negotiation form
        setCreatedCommissionId(String(data.commission_req_id));
        setShowNegotiate(true);
      } else {
        Alert.alert('Error', data.error || 'Failed to submit request.');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to connect to commissions API.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <ArrowLeft color="#B84A4A" size={24} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={[s.formRow, isDesktop ? s.formRowDesktop : s.formRowMobile]}>
          
          {/* LEFT COLUMN: FOR REFERENCE */}
          <View style={s.column}>
            <Text style={s.headingRed}>FOR REFERENCE</Text>
            <View style={s.redDivider} />

            <Text style={s.labelRed}>Upload Images:</Text>
            <View style={s.slotsRow}>
              {Array.from({ length: MAX_IMAGES }).map((_, i) => {
                const img = refImages[i];
                if (img) {
                  return (
                    <View key={i} style={s.slotBox}>
                      <Image source={{ uri: img }} style={s.slotImage} resizeMode="cover" />
                      <TouchableOpacity
                        style={s.removeBtn}
                        onPress={() => setRefImages((p) => p.filter((_, idx) => idx !== i))}
                      >
                        <X color="#FFF" size={12} />
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (i === refImages.length) {
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[s.slotBox, s.uploadActiveBox]}
                      onPress={handlePickImage}
                    >
                      <Plus color="#C15656" size={26} />
                    </TouchableOpacity>
                  );
                }
                return <View key={i} style={[s.slotBox, s.emptyBox]} />;
              })}
            </View>

            <Text style={s.labelRed}>Description:</Text>
            <TextInput
              style={s.descInput}
              multiline
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your desired piece, dimensions, mood, color scheme..."
              placeholderTextColor="#999"
            />
            <View style={s.redDividerBottom} />
          </View>

          {/* RIGHT COLUMN: ART COMMISSION DETAILS */}
          <View style={s.column}>
            <Text style={s.headingRed}>ART COMMISSION DETAILS</Text>

            {/* Type of Art */}
            <View style={s.fieldRow}>
              <Text style={s.labelRedInline}>Type of Art:</Text>
              <View style={s.pillGroup}>
                <TouchableOpacity
                  style={[s.outlinePill, artType === 'Physical' && s.outlinePillActive]}
                  onPress={() => setArtType('Physical')}
                >
                  <Text style={[s.outlinePillText, artType === 'Physical' && s.outlinePillTextActive]}>
                    Physical
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.outlinePill, artType === 'Digital' && s.outlinePillActive]}
                  onPress={() => setArtType('Digital')}
                >
                  <Text style={[s.outlinePillText, artType === 'Digital' && s.outlinePillTextActive]}>
                    Digital
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Tags */}
            <View style={s.fieldRow}>
              <Text style={s.labelRedInline}>Tags:</Text>
              <TextInput
                style={s.tagInput}
                value={tagInput}
                onChangeText={setTagInput}
                onSubmitEditing={() => {
                  if (tagInput.trim() && !selectedTags.includes(tagInput.trim())) {
                    setSelectedTags([...selectedTags, tagInput.trim()]);
                    setTagInput('');
                  }
                }}
                placeholder="Type tag & press enter"
                placeholderTextColor="#999"
              />
            </View>
            <View style={s.tagsRow}>
              {selectedTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  style={s.solidTag}
                  onPress={() => setSelectedTags(selectedTags.filter((t) => t !== tag))}
                >
                  <Text style={s.solidTagText}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={s.redDivider} />

            {/* TIME DURATION & INTERACTIVE DATE/TIME */}
            <Text style={s.headingRedSmall}>TIME DURATION</Text>
            <View style={s.dateRow}>
              <Text style={s.labelRedInline}>Date & time to be done:</Text>

              {/* DATE PICKER BADGE */}
              <View style={s.dateBadgeWrapper}>
                {Platform.OS === 'web' && (
                  <input
                    type="date"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                    value={targetDate.toISOString().split('T')[0]}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [y, m, d] = e.target.value.split('-').map(Number);
                        const next = new Date(targetDate);
                        next.setFullYear(y, m - 1, d);
                        setTargetDate(next);
                      }
                    }}
                  />
                )}
                <View style={s.dateBadge}>
                  <Text style={s.dateText}>{formattedDate}</Text>
                </View>
              </View>

              {/* TIME PICKER BADGE */}
              <View style={s.dateBadgeWrapper}>
                {Platform.OS === 'web' && (
                  <input
                    type="time"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      zIndex: 2,
                    }}
                    value={`${String(targetDate.getHours()).padStart(2, '0')}:${String(
                      targetDate.getMinutes()
                    ).padStart(2, '0')}`}
                    onChange={(e) => {
                      if (e.target.value) {
                        const [hh, mm] = e.target.value.split(':').map(Number);
                        const next = new Date(targetDate);
                        next.setHours(hh, mm);
                        setTargetDate(next);
                      }
                    }}
                  />
                )}
                <View style={s.dateBadge}>
                  <Text style={s.dateText}>{formattedTime}</Text>
                </View>
              </View>
            </View>

            {/* RUSH JOB BUTTON */}
            <TouchableOpacity
              style={[s.rushBtn, isRush && s.rushBtnActive]}
              onPress={toggleRushJob}
              activeOpacity={0.8}
            >
              <Text style={[s.rushBtnText, isRush && s.rushBtnTextActive]}>
                {isRush ? ' Rush job (Urgent)' : 'Rush job'}
              </Text>
            </TouchableOpacity>

            {/* NEXT BUTTON */}
            <TouchableOpacity
              style={s.nextBtn}
              onPress={handleNext}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={s.nextBtnText}>Next &gt;&gt;</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Existing Negotiate Contract Panel Overlay */}
      {showNegotiate && (
        <ContractPanel
          startInChat={false}
          artworkId={createdCommissionId || String(artistId)}
          onClose={() => {
            setShowNegotiate(false);
            router.replace('/(tabs)/commissions' as any);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FAF6ED' },
  backBtn: { paddingHorizontal: 20, paddingTop: 12 },
  content: { padding: 24, maxWidth: 1100, alignSelf: 'center', width: '100%' },
  formRow: { gap: 36 },
  formRowDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  formRowMobile: { flexDirection: 'column' },
  column: { flex: 1, width: '100%' },

  headingRed: { color: '#B84A4A', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  headingRedSmall: { color: '#B84A4A', fontSize: 14, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  labelRed: { color: '#B84A4A', fontSize: 13, fontWeight: '600', marginTop: 14, marginBottom: 8 },
  labelRedInline: { color: '#B84A4A', fontSize: 13, fontWeight: '600', marginRight: 12 },
  redDivider: { height: 1.5, backgroundColor: '#C15656', marginVertical: 10, opacity: 0.7 },
  redDividerBottom: { height: 1.5, backgroundColor: '#C15656', marginTop: 24, opacity: 0.7 },

  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  slotBox: {
    width: 72,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#CCC',
    backgroundColor: '#FFF',
  },
  slotImage: { width: '100%', height: '100%' },
  uploadActiveBox: {
    borderColor: '#C15656',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: { borderColor: '#DDD', borderStyle: 'dashed' },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(184, 74, 74, 0.85)',
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  descInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#B84A4A',
    borderRadius: 8,
    minHeight: 110,
    padding: 12,
    fontSize: 13,
    color: '#333',
    textAlignVertical: 'top',
  },

  fieldRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 8, flexWrap: 'wrap', gap: 6 },
  pillGroup: { flexDirection: 'row', gap: 10 },
  outlinePill: {
    borderWidth: 1,
    borderColor: '#C15656',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#FFF',
  },
  outlinePillActive: { backgroundColor: '#C15656' },
  outlinePillText: { color: '#C15656', fontSize: 13, fontWeight: '600' },
  outlinePillTextActive: { color: '#FFF' },

  tagInput: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    color: '#333',
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 12 },
  solidTag: {
    backgroundColor: '#B84A4A',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 16,
  },
  solidTagText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, flexWrap: 'wrap' },
  dateBadgeWrapper: { position: 'relative' },
  dateBadge: {
    backgroundColor: '#ECECEC',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  dateText: { fontSize: 13, color: '#333', fontWeight: '500' },

  rushBtn: {
    backgroundColor: '#E2E2E2',
    alignSelf: 'flex-start',
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  rushBtnActive: { backgroundColor: '#C15656' },
  rushBtnText: { color: '#777', fontSize: 13, fontWeight: '700' },
  rushBtnTextActive: { color: '#FFF' },

  nextBtn: {
    backgroundColor: '#C15656',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});