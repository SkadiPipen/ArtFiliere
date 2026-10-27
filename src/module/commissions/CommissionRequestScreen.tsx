import { Text, TextInput } from '@/components/Typography';
import CommissionDeliveryDetails from './CommissionDeliveryDetails';
import { auth } from "@/firebase/config";
import NegotiationForm from '@/module/chat-negotiations/negotiationForm';
import API_URL from "@/services/api";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Plus, X } from "lucide-react-native";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, Image, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseProposedBudget } from './budget';

import AvailabilityCalendar, { manilaDate } from './AvailabilityCalendar';

const MAX_IMAGES = 4;
const STYLE_OPTIONS = [
  "Digital illustration",
  "Realism",
  "Anime / Manga",
  "Watercolor",
  "Sketch",
  "Portrait",
  "Other",
];

export default function CommissionRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    artistId?: string;
    id?: string;
    artist_id?: string;
    artistName?: string;
  }>();

  const rawArtistId = params.artistId || params.id || params.artist_id;
  const [bookedDates, setBookedDates] = useState<string[]>([]);
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const handleAvailability = useCallback((dates: string[], ready: boolean) => {
    setBookedDates(dates); setAvailabilityReady(ready);
  }, []);

  const [windowWidth, setWindowWidth] = useState(
    Dimensions.get("window").width,
  );
  const isDesktop = windowWidth > 860;

  React.useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => {
      setWindowWidth(window.width);
    });
    return () => sub?.remove();
  }, []);

  const [subject, setSubject] = useState("");
  const [style, setStyle] = useState("Digital illustration");
  const [instructions, setInstructions] = useState("");
  const [refImages, setRefImages] = useState<string[]>([]);
  const [artType, setArtType] = useState<"Physical" | "Digital">("Physical");
  const [proposedBudget, setProposedBudget] = useState("");
  const [loading, setLoading] = useState(false);

  const [targetDate, setTargetDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d;
  });
  const [isRush, setIsRush] = useState(false);
  const requestTags = [
    artType,
    style,
    ...subject
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 3),
  ];

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

  const formattedDate = targetDate.toLocaleDateString("en-US", {
    timeZone: 'Asia/Manila',
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedTime = targetDate.toLocaleTimeString("en-US", {
    timeZone: 'Asia/Manila',
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const handlePickImage = async () => {
    if (refImages.length >= MAX_IMAGES) {
      if (Platform.OS === "web") {
        window.alert(
          `Limit reached: You can upload up to ${MAX_IMAGES} reference images.`,
        );
      } else {
        Alert.alert(
          "Limit Reached",
          `You can upload up to ${MAX_IMAGES} reference images.`,
        );
      }
      return;
    }

    try {
      if (Platform.OS !== "web") {
        const { status } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Denied",
            "Camera roll permissions are needed to select references.",
          );
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.base64
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        setRefImages((prev) => [...prev, uri]);
      }
    } catch (e: any) {
      if (Platform.OS === "web")
        window.alert(e.message || "Image picker error.");
      else Alert.alert("Error", e.message || "Image picker error.");
    }
  };

  const showAlert = (title: string, msg: string, onOk?: () => void) => {
    if (Platform.OS === "web") {
      window.alert(`${title}: ${msg}`);
      if (onOk) onOk();
    } else {
      Alert.alert(
        title,
        msg,
        onOk ? [{ text: "OK", onPress: onOk }] : undefined,
      );
    }
  };

  const [draft, setDraft] = useState<any>(null);
  const [milestonePercentages, setMilestonePercentages] = useState(['30', '30', '40']);
  const [deliveryQuote, setDeliveryQuote] = useState<any>(null);
  const [floorUnit, setFloorUnit] = useState('');
  const [deliveryInstruction, setDeliveryInstruction] = useState('');
  
  const sendProposal = async (proposal: any) => {
    const physical = String(draft.art_type).toLowerCase() === 'physical';
    if (physical && !deliveryQuote) throw new Error('Calculate shipping before sending the proposal.');
    const deliveryFee = physical ? deliveryQuote.fee : '0';
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Sign in to submit your commission proposal.');
    const response = await fetch(`${API_URL}/api/commissions/requests/`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...draft, flow_version: 2, proposal: {
        price: (Number(proposal.finalPrice) + Number(deliveryFee || 0)).toFixed(2),
        license_type: proposal.licenseType, exclusivity: proposal.exclusivity,
        duration_months: proposal.durationMonths || 0, royalty_percentage: proposal.royaltyPercentage || 0,
        allow_resale: proposal.allowResale === true,
        compensation_type: proposal.compensationCategory || 'one_time', compensation_terms: proposal.compensationTerms || {}, delivery_fee: deliveryFee || '0', note: proposal.note || '',
        delivery_quote: physical ? deliveryQuote.token : '', delivery_floor_unit: floorUnit, delivery_instruction: deliveryInstruction,
        milestones: milestonePercentages.map(Number), deadline: draft.deadline,
      } }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || JSON.stringify(data));
    router.replace({ pathname: '/commission-detail' as any, params: { id: String(data.commission_req_id) } });
  };
  const handleNext = async () => {
    if (subject.trim().length < 3) {
      showAlert(
        "Required",
        "Tell the artist what you want created, such as a pet portrait or character illustration.",
      );
      return;
    }
    if (!style.trim()) {
      showAlert("Required", "Choose the style you would like.");
      return;
    }
    const budget = parseProposedBudget(proposedBudget);
    if (!budget) {
      showAlert(
        "Required",
        "Enter a budget greater than zero, such as 1000 or 1,000.00 (up to two decimal places). The artist can still negotiate it with you.",
      );
      return;
    }

    if (!availabilityReady || bookedDates.includes(manilaDate(targetDate)) || targetDate <= new Date()) {
      showAlert('Completion date', 'Choose an available future completion date from the calendar.'); return;
    }
    const resolvedArtistId = Number(rawArtistId);
    if (!resolvedArtistId || isNaN(resolvedArtistId)) {
      showAlert(
        "Error",
        "Missing valid artist information. Please return to the artist page.",
      );
      return;
    }

    try {
      setLoading(true);
      const token = await auth.currentUser?.getIdToken();
      const email = auth.currentUser?.email || "";
      const username =
        auth.currentUser?.displayName || email.split("@")[0] || "";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const payload = {
        artist_id: resolvedArtistId,
        user_email: email,
        buyer_username: username,
        title: `${style} commission: ${subject.trim().slice(0, 55)}`,
        subject: subject.trim(),
        style,
        description: instructions.trim(),
        art_type: artType,
        tags: requestTags.join(", "),
        is_rush_job: isRush,
        deadline: targetDate.toISOString(),
        proposed_budget: budget,
        reference_images: refImages,
      };

      setDraft(payload);
    } catch (e: any) {
      showAlert(
        "Network Error",
        e.message || "Failed to submit commission request.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(home)" as any);
    }
  };

  if (draft) return <SafeAreaView style={s.page}>
    <ScrollView contentContainerStyle={{ padding: 20, maxWidth: 1000, width: '100%', alignSelf: 'center', gap: 12 }}>
      <Text style={s.headingRedSmall}>COMMISSION PROPOSAL</Text>
      <Text>One consolidated revision request/comment per stage. Full upfront funding after both signatures.</Text>
      <Text>Stage percentages (must total 100)</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>{milestonePercentages.map((value, index) => <TextInput key={index} value={value} keyboardType="number-pad" accessibilityLabel={`Stage ${index + 1} percentage`} style={s.budgetInput}
        onChangeText={next => setMilestonePercentages(values => values.map((v, i) => i === index ? next : v))} />)}</View>
      {String(draft.art_type).toLowerCase() === 'physical' && <CommissionDeliveryDetails artistId={String(rawArtistId)} onQuote={setDeliveryQuote} floorUnit={floorUnit} onFloorUnit={setFloorUnit} instruction={deliveryInstruction} onInstruction={setDeliveryInstruction} />}
      <NegotiationForm commissionMode commissionShippingFee={deliveryQuote ? Number(deliveryQuote.fee) : undefined} artwork={{ id: 'commission', title: draft.title, art_type: draft.art_type.toLowerCase(), base_price: Number(draft.proposed_budget) }}
        buyerId={auth.currentUser?.uid || ''} buyerName={auth.currentUser?.displayName || ''} artistId={String(rawArtistId)} artistName={params.artistName || 'Artist'} chatId="commission"
        onSend={sendProposal} onCancel={() => setDraft(null)} />
    </ScrollView>
  </SafeAreaView>;

  return (
    <SafeAreaView style={s.page}>
      <TouchableOpacity style={s.backBtn} onPress={handleBack}>
        <ArrowLeft color="#B84A4A" size={24} />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[s.formRow, isDesktop ? s.formRowDesktop : s.formRowMobile]}
        >
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
                      <Image
                        source={{ uri: img }}
                        style={s.slotImage}
                        resizeMode="cover"
                      />
                      <TouchableOpacity
                        style={s.removeBtn}
                        onPress={() =>
                          setRefImages((p) => p.filter((_, idx) => idx !== i))
                        }
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

            <Text style={s.labelRed}>What do you want created? *</Text>
            <TextInput
              style={s.descInput}
              value={subject}
              onChangeText={setSubject}
              placeholder="Example: A digital portrait of my two dogs"
              placeholderTextColor="#999"
            />
            <Text style={s.labelRed}>Extra instructions (optional):</Text>
            <TextInput
              style={s.instructionsInput}
              multiline
              value={instructions}
              onChangeText={setInstructions}
              placeholder="Add colors, dimensions, mood, reference details, or ask the artist to message you first."
              placeholderTextColor="#999"
            />
            <View style={s.redDividerBottom} />
          </View>

          {/* RIGHT COLUMN: ART COMMISSION DETAILS */}
          <View style={s.column}>
            <Text style={s.headingRed}>ART COMMISSION DETAILS</Text>

            <View style={s.fieldRow}>
              <Text style={s.labelRedInline}>Type of Art:</Text>
              <View style={s.pillGroup}>
                <TouchableOpacity
                  style={[
                    s.outlinePill,
                    artType === "Physical" && s.outlinePillActive,
                  ]}
                  onPress={() => setArtType("Physical")}
                >
                  <Text
                    style={[
                      s.outlinePillText,
                      artType === "Physical" && s.outlinePillTextActive,
                    ]}
                  >
                    Physical
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.outlinePill,
                    artType === "Digital" && s.outlinePillActive,
                  ]}
                  onPress={() => setArtType("Digital")}
                >
                  <Text
                    style={[
                      s.outlinePillText,
                      artType === "Digital" && s.outlinePillTextActive,
                    ]}
                  >
                    Digital
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={s.fieldRow}>
              <Text style={s.labelRedInline}>Preferred style: *</Text>
              <View style={s.stylePills}>
                {STYLE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[s.stylePill, style === option && s.stylePillActive]}
                    onPress={() => setStyle(option)}
                  >
                    <Text
                      style={[
                        s.stylePillText,
                        style === option && s.stylePillTextActive,
                      ]}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={s.guidanceBox}>
              <Text style={s.guidanceTitle}>Clear request tags</Text>
              <Text style={s.guidanceText}>
                Tags are created from your selected style, art type, and subject
                — not guessed from vague chat messages.
              </Text>
              <View style={s.generatedTags}>
                {requestTags.map((tag, index) => (
                  <View key={`${tag}-${index}`} style={s.generatedTag}>
                    <Text style={s.generatedTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text style={s.labelRed}>Proposed budget (PHP): *</Text>
            <TextInput
              style={s.budgetInput}
              accessibilityLabel="Proposed budget in PHP"
              value={proposedBudget}
              onChangeText={setProposedBudget}
              keyboardType="decimal-pad"
              placeholder="Example: 1,000.00"
              placeholderTextColor="#999"
            />

            <View style={s.redDivider} />

            <Text style={s.headingRedSmall}>PREFERRED COMPLETION DATE</Text>
            {!!rawArtistId && <AvailabilityCalendar artistId={String(rawArtistId)} selectedDate={manilaDate(targetDate)}
              onAvailability={handleAvailability} onSelect={date => {
                setTargetDate(new Date(`${date}T17:00:00+08:00`));
              }} />}
            <View style={s.dateRow}>
              <Text style={s.labelRedInline}>When do you need it?</Text>

              <View style={s.dateBadgeWrapper}>
                <View style={s.dateBadge}>
                  <Text style={s.dateText}>{formattedDate}</Text>
                </View>
              </View>

              <View style={s.dateBadgeWrapper}>
                {Platform.OS === "web" && (
                  <input
                    type="time"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      opacity: 0,
                      width: "100%",
                      height: "100%",
                      cursor: "pointer",
                      zIndex: 2,
                    }}
                    value={targetDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false })}
                    onChange={(e) => {
                      if (e.target.value) {
                        setTargetDate(new Date(`${manilaDate(targetDate)}T${e.target.value}:00+08:00`));
                      }
                    }}
                  />
                )}
                <View style={s.dateBadge}>
                  <Text style={s.dateText}>{formattedTime}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[s.rushBtn, isRush && s.rushBtnActive]}
              onPress={toggleRushJob}
              activeOpacity={0.8}
            >
              <Text style={[s.rushBtnText, isRush && s.rushBtnTextActive]}>
                {isRush ? "Rush request (Urgent)" : "Mark as rush request"}
              </Text>
            </TouchableOpacity>

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FAF6ED" },
  backBtn: { paddingHorizontal: 20, paddingTop: 12 },
  content: { padding: 24, maxWidth: 1100, alignSelf: "center", width: "100%" },
  formRow: { gap: 36 },
  formRowDesktop: { flexDirection: "row", alignItems: "flex-start" },
  formRowMobile: { flexDirection: "column" },
  column: { flex: 1, width: "100%" },

  headingRed: {
    color: "#B84A4A",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headingRedSmall: {
    color: "#B84A4A",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 8,
  },
  labelRed: {
    color: "#B84A4A",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 14,
    marginBottom: 8,
  },
  labelRedInline: {
    color: "#B84A4A",
    fontSize: 13,
    fontWeight: "600",
    marginRight: 12,
  },
  redDivider: {
    height: 1.5,
    backgroundColor: "#C15656",
    marginVertical: 10,
    opacity: 0.7,
  },
  redDividerBottom: {
    height: 1.5,
    backgroundColor: "#C15656",
    marginTop: 24,
    opacity: 0.7,
  },

  slotsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 16,
  },
  slotBox: {
    width: 72,
    height: 64,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#CCC",
    backgroundColor: "#FFF",
  },
  slotImage: { width: "100%", height: "100%" },
  uploadActiveBox: {
    borderColor: "#C15656",
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: { borderColor: "#DDD", borderStyle: "dashed" },
  removeBtn: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "rgba(184, 74, 74, 0.85)",
    borderRadius: 10,
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },

  descInput: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#B84A4A",
    borderRadius: 8,
    minHeight: 50,
    padding: 12,
    fontSize: 13,
    color: "#333",
    textAlignVertical: "top",
  },
  instructionsInput: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#D8C9C3",
    borderRadius: 8,
    minHeight: 105,
    padding: 12,
    fontSize: 13,
    color: "#333",
    textAlignVertical: "top",
  },

  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 8,
    flexWrap: "wrap",
    gap: 6,
  },
  pillGroup: { flexDirection: "row", gap: 10 },
  outlinePill: {
    borderWidth: 1,
    borderColor: "#C15656",
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: "#FFF",
  },
  outlinePillActive: { backgroundColor: "#C15656" },
  outlinePillText: { color: "#C15656", fontSize: 13, fontWeight: "600" },
  outlinePillTextActive: { color: "#FFF" },

  tagInput: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 8,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    color: "#333",
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  solidTag: {
    backgroundColor: "#B84A4A",
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 16,
  },
  solidTagText: { color: "#FFF", fontSize: 12, fontWeight: "600" },
  stylePills: { flexDirection: "row", flexWrap: "wrap", gap: 7, flex: 1 },
  stylePill: {
    borderWidth: 1,
    borderColor: "#D8C9C3",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#FFF",
  },
  stylePillActive: { backgroundColor: "#C15656", borderColor: "#C15656" },
  stylePillText: { color: "#7A625C", fontSize: 11, fontWeight: "700" },
  stylePillTextActive: { color: "#FFF" },
  guidanceBox: {
    backgroundColor: "#FFF6D9",
    borderRadius: 8,
    padding: 11,
    marginTop: 4,
    marginBottom: 12,
  },
  guidanceTitle: { color: "#8C6619", fontSize: 12, fontWeight: "800" },
  guidanceText: {
    color: "#7E7058",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
  generatedTags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  generatedTag: {
    backgroundColor: "#F2E1B7",
    borderRadius: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  generatedTagText: { color: "#795C1D", fontSize: 10, fontWeight: "700" },
  budgetInput: {
    borderWidth: 1,
    borderColor: "#B84A4A",
    borderRadius: 8,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: "#333",
    fontSize: 13,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginVertical: 8,
    flexWrap: "wrap",
  },
  dateBadgeWrapper: { position: "relative" },
  dateBadge: {
    backgroundColor: "#ECECEC",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
  },
  dateText: { fontSize: 13, color: "#333", fontWeight: "500" },

  rushBtn: {
    backgroundColor: "#E2E2E2",
    alignSelf: "flex-start",
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  rushBtnActive: { backgroundColor: "#C15656" },
  rushBtnText: { color: "#777", fontSize: 13, fontWeight: "700" },
  rushBtnTextActive: { color: "#FFF" },

  nextBtn: {
    backgroundColor: "#C15656",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
  },
  nextBtnText: { color: "#FFF", fontSize: 16, fontWeight: "800" },
});
