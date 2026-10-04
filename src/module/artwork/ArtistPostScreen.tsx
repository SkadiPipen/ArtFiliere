import Toast from "@/components/Toast";
import { auth } from "@/firebase/config";
import API_URL from "@/services/api";
import AgreementPaper from '@/module/messages/components/AgreementPaper';
import SignaturePad, { Strokes } from '@/module/chat-negotiations/SignaturePad';
import { purchaseRequest } from '@/services/purchases';
import AgreementDocument, {
  type AgreementTerms,
} from "@/module/messages/components/AgreementDocument";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { ArrowLeft, ImagePlus, Plus, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ART_TYPES = ["Physical", "Digital"];

type ToastState = {
  visible: boolean;
  message: string;
  type: "success" | "error";
};

export default function ArtistPostScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [imageData, setImageData] = useState("");
  const [additionalImages, setAdditionalImages] = useState<string[]>([
    "",
    "",
    "",
  ]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Painting");
  const [hours, setHours] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [materials, setMaterials] = useState("0");
  const [artType, setArtType] = useState("Physical");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [selectedAiTags, setSelectedAiTags] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [generatingTags, setGeneratingTags] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: "",
    type: "success",
  });
  const [saleType, setSaleType] = useState<"Auction" | "Direct Sell">(
    "Auction",
  );

  useEffect(() => {
    let active = true;
    const loadDefaultHourlyRate = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const response = await fetch(`${API_URL}/auth/me/`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        const data = await response.json();
        if (active && response.ok && data.default_hourly_rate) {
          setHourlyRate(
            (current) => current || String(data.default_hourly_rate),
          );
        }
      } catch {
        // The artist can still enter a rate manually if the saved default is unavailable.
      }
    };
    loadDefaultHourlyRate();
    return () => {
      active = false;
    };
  }, []);

  // Auction config states
  const [bidIncrement, setBidIncrement] = useState("100.00");
  const [startingTime, setStartingTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [auctionDateError, setAuctionDateError] = useState("");
  const [customStartingBid, setCustomStartingBid] = useState("");
  const [auctionLicenseType, setAuctionLicenseType] = useState("personal");
  const [auctionExclusivity, setAuctionExclusivity] = useState("non_exclusive");
  const [auctionDeliveryType, setAuctionDeliveryType] = useState("physical");
  const [auctionTerms, setAuctionTerms] = useState("");
  const [auctionTemplateId, setAuctionTemplateId] = useState<number | null>(null);
  const [auctionTermsOpen, setAuctionTermsOpen] = useState(false);
  const [auctionTermsConfirmed, setAuctionTermsConfirmed] = useState(false);
  const [loadingAuctionTerms, setLoadingAuctionTerms] = useState(false);
  const [auctionDocument, setAuctionDocument] = useState<{ document: string; document_hash: string } | null>(null);
  const [auctionSignatureName, setAuctionSignatureName] = useState('');
  const [auctionStrokes, setAuctionStrokes] = useState<Strokes>([]);
  const [auctionSignatureImage, setAuctionSignatureImage] = useState('');
  const [auctionDrawing, setAuctionDrawing] = useState(false);
  const [signatureRevision, setSignatureRevision] = useState(0);
  const [preparingDocument, setPreparingDocument] = useState(false);
  useEffect(() => {
    setAuctionDocument(null); setAuctionTermsConfirmed(false); setAuctionStrokes([]); setAuctionSignatureImage(''); setSignatureRevision(value => value + 1);
  }, [title, auctionTerms, auctionTemplateId, auctionLicenseType, auctionExclusivity, auctionDeliveryType]);
  const prepareAuctionDocument = async () => {
    setPreparingDocument(true);
    try {
      const result = await purchaseRequest('users/artworks/auction-agreement-preview/', 'POST', {
        title, art_type: artType.toLowerCase(), auction_agreement_template_id: auctionTemplateId, auction_terms: auctionTerms,
        auction_license_type: auctionLicenseType, auction_exclusivity: auctionExclusivity, auction_delivery_type: auctionDeliveryType,
      });
      setAuctionDocument(result); setAuctionTermsConfirmed(false); setAuctionStrokes([]); setAuctionSignatureImage(''); setSignatureRevision(value => value + 1);
    } catch (e: any) { showToast(e.message || 'Unable to prepare the agreement.', 'error'); }
    finally { setPreparingDocument(false); }
  };
  const uploadAuctionSignature = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 1 });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64?.startsWith('iVBOR') || (asset.mimeType && asset.mimeType !== 'image/png')) throw new Error('Choose a transparent PNG signature.');
      setAuctionSignatureImage(`data:image/png;base64,${asset.base64}`);
      setAuctionTermsConfirmed(false);
      setAuctionStrokes([]); setSignatureRevision(value => value + 1);
    } catch (e: any) { showToast(e.message, 'error'); }
  };

  useEffect(() => {
    let active = true;
    const loadAuctionAgreement = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        setLoadingAuctionTerms(true);
        const response = await fetch(
          `${API_URL}/api/users/artworks/auction-agreement-defaults/`,
          { headers: { Authorization: `Bearer ${await user.getIdToken()}` } },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load the platform agreement.");
        if (active) {
          setAuctionTemplateId(data.id);
          setAuctionTerms((current) => current || data.body || "");
        }
      } catch (error: any) {
        if (active) showToast(error.message || "Unable to load the platform agreement.", "error");
      } finally {
        if (active) setLoadingAuctionTerms(false);
      }
    };
    loadAuctionAgreement();
    return () => {
      active = false;
    };
  }, []);

  const auctionAgreement: AgreementTerms = {
    terms: auctionTerms,
    licenseType: auctionLicenseType,
    exclusivity: auctionExclusivity,
    deliveryType: auctionDeliveryType,
    compensationType: "one_time",
  };

  const updateAuctionAgreement = (next: AgreementTerms) => {
    setAuctionTerms(next.terms);
    setAuctionLicenseType(next.licenseType);
    setAuctionExclusivity(next.exclusivity);
    setAuctionDeliveryType(next.deliveryType);
    setArtType(next.deliveryType === 'physical' ? 'Physical' : 'Digital');
    setAuctionTermsConfirmed(false);
  };

  const calculatedPrice = (
    (Number(hours) * Number(hourlyRate) +
      (artType.toLowerCase() === "physical" ? Number(materials) : 0)) *
    1.1
  ).toFixed(2);
  const price =
    saleType === "Auction"
      ? customStartingBid
      : calculatedPrice;
  const todayLocal = new Date().toLocaleDateString("en-CA");

  const validateAuctionDates = (start = startingTime, end = endTime) => {
    if (!start || !end) return "Choose both an auction start and end date.";
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return "Enter valid auction dates.";
    }
    if (start.slice(0, 10) < todayLocal) return "The auction start date cannot be before today.";
    if (endDate <= startDate) return "The auction end date must be later than the start date.";
    return "";
  };

  const showToast = (
    message: string,
    type: "success" | "error" = "success",
  ) => {
    setToast({ visible: true, message, type });
  };

  const hideToast = () => setToast((prev) => ({ ...prev, visible: false }));

  const pickImage = async (gallerySlot?: number) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      const selectedImage = `data:${result.assets[0].mimeType || "image/jpeg"};base64,${result.assets[0].base64}`;
      if (gallerySlot === undefined) {
        setImageData(selectedImage);
      } else {
        setAdditionalImages((current) =>
          current.map((image, index) =>
            index === gallerySlot ? selectedImage : image,
          ),
        );
      }
    }
  };

  const generateTags = async () => {
    if (description.trim().length < 20 || generatingTags) return;
    try {
      setGeneratingTags(true);
      const user = auth.currentUser;
      if (!user) return;
      const response = await fetch(
        `${API_URL}/api/users/artworks/suggest-tags/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ description }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const nextSuggestions = Array.isArray(data.tags) ? data.tags : [];
      setSuggestedTags(nextSuggestions);
      setSelectedAiTags(
        nextSuggestions.slice(0, Math.max(0, 5 - customTags.length)),
      );
    } catch (error: any) {
      showToast(error.message || "Unable to generate tags right now.", "error");
    } finally {
      setGeneratingTags(false);
    }
  };

  const selectedTagCount = selectedAiTags.length + customTags.length;

  const toggleSuggestedTag = (tag: string) => {
    if (selectedAiTags.includes(tag)) {
      setSelectedAiTags((current) => current.filter((item) => item !== tag));
      return;
    }
    if (selectedTagCount >= 5) {
      showToast("Choose up to 5 tags in total.", "error");
      return;
    }
    setSelectedAiTags((current) => [...current, tag]);
  };

  const addCustomTag = () => {
    const normalized = customTagInput
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (
      !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(normalized) ||
      normalized.length < 2 ||
      normalized.length > 40
    ) {
      return showToast(
        "Use 2–40 letters or numbers for a manual tag.",
        "error",
      );
    }
    if (customTags.length >= 3) {
      return showToast("You can add up to 3 manual tags.", "error");
    }
    if (selectedTagCount >= 5) {
      return showToast("Choose up to 5 tags in total.", "error");
    }
    if (
      customTags.includes(normalized) ||
      selectedAiTags.includes(normalized)
    ) {
      return showToast("That tag is already selected.", "error");
    }
    setCustomTags((current) => [...current, normalized]);
    setCustomTagInput("");
  };

  const submit = async () => {
    if (!imageData || !title.trim() || !description.trim()) {
      return showToast(
        "Add an image, artwork name, and description.",
        "error",
      );
    }

    if (saleType === "Direct Sell") {
      if (Number(hours) <= 0 || Number(hourlyRate) <= 0) {
        return showToast(
          "Enter valid hours worked and an hourly rate to calculate the listing price.",
          "error",
        );
      }
    } else if (Number(price) <= 0) {
      return showToast("Enter a valid starting bid.", "error");
    }

    if (saleType === "Auction" && (!auctionTemplateId || !auctionTermsConfirmed)) {
      return showToast(
        "Review and confirm the auction Terms & Agreements before submitting.",
        "error",
      );
    }
    if (saleType === 'Auction' && (!auctionDocument || auctionSignatureName.trim().length < 2 || (!auctionStrokes.length && !auctionSignatureImage))) {
      return showToast('Open the auction agreement, review the full document and sign before submitting.', 'error');
    }

    if (saleType === "Auction") {
      const dateError = validateAuctionDates();
      setAuctionDateError(dateError);
      if (dateError) return showToast(dateError, "error");
    }

    // Auction incrementation and time duration
    if (saleType === "Auction") {
      if (!bidIncrement || parseFloat(bidIncrement) <= 0) {
        return showToast("Please provide a valid bid increment.", "error");
      }
    }

    try {
      setSaving(true);
      const user = auth.currentUser;
      if (!user) throw new Error("Please log in again.");
      const token = await user.getIdToken();

      // Payload
      const payload: any = {
        image_data: imageData,
        additional_images: additionalImages.filter(Boolean),
        title,
        description,
        category: category.trim(),
        selected_ai_tags: selectedAiTags,
        custom_tags: customTags,
        price,
        sale_type: saleType,
        hours,
        hourly_rate: hourlyRate,
        material_cost: materials,
        art_type: artType.toLowerCase(),
        auction_license_type: auctionLicenseType,
        auction_exclusivity: auctionExclusivity,
        auction_delivery_type: auctionDeliveryType,
        auction_terms: auctionTerms.trim(),
        auction_agreement_template_id: auctionTemplateId,
        auction_terms_confirmed: auctionTermsConfirmed,
        auction_document_hash: auctionDocument?.document_hash,
        auction_signature_name: auctionSignatureName.trim(),
        auction_signature_consent: auctionTermsConfirmed,
        ...(auctionSignatureImage ? { signature_image: auctionSignatureImage } : { signature_strokes: auctionStrokes }),
      };

      // Appended custom auction if artist chose auc
      if (saleType === "Auction") {
        payload.starting_bid = price || customStartingBid;
        payload.starting_price = price || customStartingBid;
        payload.bid_increment = bidIncrement;
        if (startingTime)
          payload.starting_time = new Date(startingTime).toISOString();
        if (endTime) payload.end_time = new Date(endTime).toISOString();
      }

      const response = await fetch(`${API_URL}/api/users/artworks/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      showToast(
        data.similarity_review_required
          ? "Submitted and held for similarity review before approval."
          : "Sent to the Creative Moderator for review.",
        "success",
      );
      setTimeout(() => router.replace("/(home)"), 500);
    } catch (error: any) {
      showToast(error.message || "Please try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(home)" as any);
    }
  };

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <ArrowLeft color="#D75B5C" size={24} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create a post</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.card, width < 700 && styles.cardMobile]}>
          <View style={[styles.assetsPanel, width < 700 && styles.panelMobile]}>
            <Text style={styles.panelTitle}>ASSET PHOTOS</Text>
            <Text style={styles.label}>Upload Asset Images:</Text>
            <View style={styles.photoRow}>
              <TouchableOpacity
                style={styles.primaryPhoto}
                onPress={() => pickImage()}
              >
                {imageData ? (
                  <Image
                    source={{ uri: imageData }}
                    style={styles.selectedImage}
                  />
                ) : (
                  <Plus size={38} color="#D75B5C" />
                )}
              </TouchableOpacity>
              {[0, 1, 2].map((slot) => (
                <TouchableOpacity
                  key={slot}
                  style={styles.emptyPhoto}
                  onPress={() => pickImage(slot)}
                >
                  {additionalImages[slot] ? (
                    <Image
                      source={{ uri: additionalImages[slot] }}
                      style={styles.selectedImage}
                    />
                  ) : (
                    <ImagePlus size={18} color="#D8C9A9" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.helper}>
              Your first image is used as the artwork cover.
            </Text>
            <View style={styles.rule} />
            <Text style={styles.soldTitle}>SOLD VIA</Text>
            <View style={styles.saleRow}>
              <TouchableOpacity
                onPress={() => setSaleType("Auction")}
                style={
                  saleType === "Auction"
                    ? styles.saleSelected
                    : styles.saleOption
                }
              >
                <Text
                  style={
                    saleType === "Auction"
                      ? styles.saleSelectedText
                      : styles.saleOptionText
                  }
                >
                  Auction
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSaleType("Direct Sell")}
                style={
                  saleType === "Direct Sell"
                    ? styles.saleSelected
                    : styles.saleOption
                }
              >
                <Text
                  style={
                    saleType === "Direct Sell"
                      ? styles.saleSelectedText
                      : styles.saleOptionText
                  }
                >
                  Sell & Buy
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View
            style={[styles.detailsPanel, width < 700 && styles.panelMobile]}
          >
            <Text style={styles.panelTitle}>ASSET DETAILS</Text>
            <Text style={styles.label}>Art Piece Name:</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Name your artwork"
            />
            <Text style={styles.label}>Type of Art:</Text>
            <View style={styles.pillRow}>
              {ART_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => {
                    setArtType(type);
                    if (saleType === "Auction") {
                      setAuctionDeliveryType(type.toLowerCase());
                      setAuctionTermsConfirmed(false);
                    }
                  }}
                  style={[
                    styles.typePill,
                    artType === type && styles.typePillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.typeText,
                      artType === type && styles.typeTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.tagHeader}>
              <Text style={styles.label}>AI tag suggestions:</Text>
              {generatingTags && (
                <ActivityIndicator size="small" color="#D75B5C" />
              )}
            </View>
            <Text style={styles.tagHint}>
              Choose the suggestions that truly fit your artwork. You can remove
              any suggestion.
            </Text>
            <View style={styles.tagRow}>
              {suggestedTags.length ? (
                suggestedTags.map((tag) => {
                  const selected = selectedAiTags.includes(tag);
                  return (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => toggleSuggestedTag(tag)}
                      style={[styles.tag, selected && styles.tagActive]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          selected && styles.tagTextActive,
                        ]}
                      >
                        {selected ? "✓ " : ""}
                        {tag.replace(/_/g, " ")}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.tagHint}>
                  Write a description to generate suggestions.
                </Text>
              )}
            </View>
            <Text style={styles.label}>Manual tags:</Text>
            <Text style={styles.tagHint}>
              Add terms the AI missed, such as a specific subject or technique.
            </Text>
            <View style={styles.tagRow}>
              {customTags.map((tag) => (
                <TouchableOpacity
                  key={tag}
                  onPress={() =>
                    setCustomTags((current) =>
                      current.filter((item) => item !== tag),
                    )
                  }
                  style={[styles.tag, styles.customTag]}
                >
                  <Text style={styles.tagText}>{tag.replace(/_/g, " ")} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customTagInputRow}>
              <TextInput
                style={[styles.input, styles.customTagInput]}
                value={customTagInput}
                onChangeText={setCustomTagInput}
                onSubmitEditing={addCustomTag}
                placeholder="e.g. watercolor"
                maxLength={40}
              />
              <TouchableOpacity
                style={styles.addTagButton}
                onPress={addCustomTag}
              >
                <Text style={styles.addTagText}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.tagCounter}>
              {selectedTagCount}/5 selected · up to 3 manual tags
            </Text>
            <Text style={styles.label}>Description:</Text>
            <TextInput
              style={[styles.input, styles.description]}
              value={description}
              onChangeText={setDescription}
              onEndEditing={generateTags}
              multiline
              placeholder="Tell buyers about this piece..."
            />
            <TouchableOpacity
              style={styles.generateButton}
              onPress={generateTags}
              disabled={generatingTags || description.trim().length < 20}
            >
              <Sparkles size={14} color="#D75B5C" />
              <Text style={styles.generateText}>
                {generatingTags ? "Generating tags..." : "Generate tags"}
              </Text>
            </TouchableOpacity>

            {/* Conditional Auction (shown only if artist choose auction in sold via) */}
            {saleType === "Auction" && (
              <View style={styles.auctionBox}>
                <Text style={styles.auctionHeaderTitle}>
                  SET AUCTION DETAILS
                </Text>
                <Text style={styles.label}>Bid Increment (Php):</Text>
                <TextInput
                  style={styles.input}
                  value={bidIncrement}
                  onChangeText={setBidIncrement}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 100.00"
                />
                <Text style={styles.label}>Starting Date & Time:</Text>
                {Platform.OS === "web" ? (
                  <input
                    type="datetime-local"
                    value={startingTime}
                    min={`${todayLocal}T00:00`}
                    onChange={(e: any) => {
                      const next = e.target.value;
                      setStartingTime(next);
                      setAuctionDateError(validateAuctionDates(next, endTime));
                    }}
                    style={{
                      height: 44,
                      borderRadius: 8,
                      border: "1px solid #D8C989",
                      padding: "0 12px",
                      fontSize: 14,
                      marginBottom: 12,
                      backgroundColor: "#FAFAF8",
                      color: "#333",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={startingTime}
                    onChangeText={(next) => {
                      setStartingTime(next);
                      setAuctionDateError(validateAuctionDates(next, endTime));
                    }}
                    placeholder={`YYYY-MM-DDTHH:MM (${todayLocal} or later)`}
                  />
                )}

                {Platform.OS === "web" ? (
                  <input
                    type="datetime-local"
                    value={endTime}
                    min={startingTime || `${todayLocal}T00:00`}
                    onChange={(e: any) => {
                      const next = e.target.value;
                      setEndTime(next);
                      setAuctionDateError(validateAuctionDates(startingTime, next));
                    }}
                    style={{
                      height: 44,
                      borderRadius: 8,
                      border: "1px solid #D8C989",
                      padding: "0 12px",
                      fontSize: 14,
                      marginBottom: 12,
                      backgroundColor: "#FAFAF8",
                      color: "#333",
                      outline: "none",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <TextInput
                    style={styles.input}
                    value={endTime}
                    onChangeText={(next) => {
                      setEndTime(next);
                      setAuctionDateError(validateAuctionDates(startingTime, next));
                    }}
                    placeholder="YYYY-MM-DDTHH:MM (after the start)"
                  />
                )}
                {!!auctionDateError && <Text style={styles.dateError}>{auctionDateError}</Text>}
              </View>
            )}

            <View style={styles.rule} />
            <Text style={styles.pricingTitle}>PRICING</Text>
            <Text style={styles.label}>Category:</Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="Painting, Photography..."
            />

            {saleType === "Auction" && (
              <>
                <Text style={styles.label}>Starting Bid (PHP):</Text>
                <TextInput
                  style={styles.input}
                  value={customStartingBid}
                  onChangeText={setCustomStartingBid}
                  keyboardType="decimal-pad"
                  placeholder="Enter starting bid (e.g. 100.00)"
                />
                <View style={styles.agreementSummary}>
                  <Text style={styles.agreementTitle}>TERMS & AGREEMENTS</Text>
                  <Text style={styles.agreementCopy}>
                    Start with the platform document, set the license details for this artwork, and confirm it before publishing. Bidders will see these fixed terms before bidding.
                  </Text>
                  <TouchableOpacity
                    style={styles.agreementButton}
                    onPress={() => setAuctionTermsOpen(true)}
                  >
                    <Text style={styles.agreementButtonText}>
                      {loadingAuctionTerms
                        ? "Loading agreement…"
                        : auctionTermsConfirmed
                          ? "Review confirmed agreement"
                          : "Review and customize agreement"}
                    </Text>
                  </TouchableOpacity>
                  {auctionTermsConfirmed ? (
                    <Text style={styles.agreementConfirmed}>✓ Agreement reviewed and confirmed</Text>
                  ) : (
                    <Text style={styles.agreementRequired}>Review and confirmation are required for an auction.</Text>
                  )}
                </View>
              </>
            )}
            {saleType === "Direct Sell" && (
              <>
                <Text style={styles.label}>Hours worked</Text>
                <TextInput
                  style={styles.input}
                  value={hours}
                  onChangeText={setHours}
                  keyboardType="decimal-pad"
                />
                <Text style={styles.label}>Hourly rate (PHP)</Text>
                <TextInput
                  style={styles.input}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  keyboardType="decimal-pad"
                />
                {artType.toLowerCase() === "physical" && (
                  <>
                    <Text style={styles.label}>Material cost (PHP)</Text>
                    <TextInput
                      style={styles.input}
                      value={materials}
                      onChangeText={setMaterials}
                      keyboardType="decimal-pad"
                    />
                  </>
                )}
                <Text>
                  Includes 10% platform fee, before license and exclusivity
                  adjustments.
                </Text>
              </>
            )}
            {saleType === "Auction" && (
              <Text style={styles.pricingHint}>
                The starting bid is set by you. Platform fees are calculated
                only after a successful auction payment.
              </Text>
            )}
            <Text style={styles.pricePreview}>
              {saleType === "Auction"
                ? "Starting bid"
                : "Calculated listing price"}:
              Php. {price || "0000.00"}
            </Text>

            <TouchableOpacity
              style={styles.submit}
              disabled={saving}
              onPress={submit}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Submit for review</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <Modal
        visible={auctionTermsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAuctionTermsOpen(false)}
      >
        <Pressable style={styles.agreementOverlay} onPress={() => setAuctionTermsOpen(false)}>
          <Pressable style={styles.agreementModal} onPress={(event) => event.stopPropagation()}>
            <ScrollView scrollEnabled={!auctionDrawing} contentContainerStyle={styles.agreementScroll}>
              <Text style={styles.agreementModalHeading}>Auction Terms & Agreements</Text>
              <Text style={styles.agreementModalHint}>
                Choose the license options, then review and sign the complete document. Approved auction license terms remain fixed; the winner signs after the auction ends.
              </Text>
              <AgreementDocument
                editable
                terms={auctionAgreement}
                onChange={updateAuctionAgreement}
              />
              <TouchableOpacity style={styles.confirmAgreement} disabled={preparingDocument} onPress={prepareAuctionDocument}><Text style={styles.confirmAgreementText}>{preparingDocument ? 'Preparing document…' : 'Review full agreement and sign'}</Text></TouchableOpacity>
              {auctionDocument && <>
                <AgreementPaper document={auctionDocument.document} />
                <TextInput accessibilityLabel="Artist full name for auction signature" placeholder="Your full name" value={auctionSignatureName} onChangeText={value => { setAuctionSignatureName(value); setAuctionTermsConfirmed(false); }} style={{ borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12 }} />
                <SignaturePad key={signatureRevision} onDrawing={setAuctionDrawing} onChange={strokes => { setAuctionStrokes(strokes); setAuctionSignatureImage(''); setAuctionTermsConfirmed(false); }} />
                <TouchableOpacity style={styles.confirmAgreement} onPress={uploadAuctionSignature}><Text style={styles.confirmAgreementText}>Or upload a transparent PNG signature</Text></TouchableOpacity>
                {!!auctionSignatureImage && <Image source={{ uri: auctionSignatureImage }} style={{ width: '100%', height: 90 }} resizeMode="contain" />}
              </>}
              <TouchableOpacity
                style={[
                  styles.confirmAgreement,
                  auctionTermsConfirmed && styles.confirmAgreementActive,
                ]}
                onPress={() => {
                  if (!auctionDocument || auctionSignatureName.trim().length < 2 || (!auctionStrokes.length && !auctionSignatureImage)) {
                    showToast("Review the full document, enter your name and draw or upload your signature.", "error");
                    return;
                  }
                  setAuctionTermsConfirmed((current) => !current);
                }}
              >
                <Text style={styles.confirmAgreementText}>
                  {auctionTermsConfirmed ? "✓ Signed terms confirmed" : "I reviewed this agreement and consent to sign it"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.closeAgreement}
                onPress={() => setAuctionTermsOpen(false)}
              >
                <Text style={styles.closeAgreementText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#FFFCF0" },
  header: {
    height: 58,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: "#E7D8D0",
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#382D29" },
  scroll: { padding: 18, alignItems: "center" },
  card: {
    width: "100%",
    maxWidth: 940,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    shadowColor: "#5A4438",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  cardMobile: { flexDirection: "column" },
  assetsPanel: {
    width: "43%",
    minWidth: 280,
    backgroundColor: "#FFF7C7",
    padding: 28,
  },
  detailsPanel: { flex: 1, padding: 28, minWidth: 310 },
  panelMobile: { width: "100%", minWidth: 0 },
  panelTitle: {
    color: "#D75B5C",
    fontWeight: "900",
    fontSize: 18,
    marginBottom: 13,
  },
  label: {
    color: "#E97878",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 6,
    marginTop: 8,
  },
  photoRow: { flexDirection: "row", gap: 9, alignItems: "center" },
  primaryPhoto: {
    width: 72,
    height: 72,
    backgroundColor: "#FFF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#DCCFB4",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  emptyPhoto: {
    width: 50,
    height: 50,
    backgroundColor: "#FFF",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#DCCFB4",
    alignItems: "center",
    justifyContent: "center",
  },
  selectedImage: { width: "100%", height: "100%" },
  helper: { color: "#8D7D70", fontSize: 11, marginTop: 9 },
  rule: {
    height: 1,
    backgroundColor: "#E77171",
    marginTop: 24,
    marginBottom: 10,
  },
  soldTitle: { color: "#D75B5C", fontWeight: "900", fontSize: 17 },
  saleRow: { flexDirection: "row", gap: 12, marginTop: 14 },
  saleSelected: {
    backgroundColor: "#D75B5C",
    borderRadius: 16,
    paddingHorizontal: 25,
    paddingVertical: 6,
  },
  saleOption: {
    borderColor: "#E0D5D1",
    borderWidth: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 25,
    paddingVertical: 6,
  },
  saleSelectedText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  saleOptionText: { color: "#D75B5C", fontSize: 12, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#DDD4CF",
    borderRadius: 6,
    paddingHorizontal: 10,
    minHeight: 35,
    color: "#3D302D",
    backgroundColor: "#FFF",
  },
  pillRow: { flexDirection: "row", gap: 8 },
  typePill: {
    borderWidth: 1,
    borderColor: "#D8CFCA",
    borderRadius: 18,
    paddingVertical: 5,
    paddingHorizontal: 22,
  },
  typePillActive: { backgroundColor: "#FFF3F1", borderColor: "#D75B5C" },
  typeText: { color: "#A98F89", fontSize: 12 },
  typeTextActive: { color: "#D75B5C", fontWeight: "800" },
  tagHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  tag: {
    backgroundColor: "#F5E5E1",
    borderRadius: 16,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  tagActive: { backgroundColor: "#D75B5C" },
  customTag: {
    borderWidth: 1,
    borderColor: "#D8A86B",
    backgroundColor: "#FFF7DF",
  },
  tagText: { color: "#B46A65", fontSize: 12, fontWeight: "700" },
  tagTextActive: { color: "#FFF" },
  tagHint: { color: "#A8958E", fontSize: 11, marginTop: 2, lineHeight: 16 },
  tagCounter: { color: "#8D7D70", fontSize: 11, marginTop: 6 },
  customTagInputRow: { flexDirection: "row", gap: 8, marginTop: 7 },
  customTagInput: { flex: 1 },
  addTagButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 15,
    borderRadius: 6,
    backgroundColor: "#FFF3F1",
    borderWidth: 1,
    borderColor: "#D75B5C",
  },
  addTagText: { color: "#D75B5C", fontWeight: "800", fontSize: 12 },
  generateButton: {
    flexDirection: "row",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 8,
    paddingVertical: 5,
  },
  generateText: { color: "#D75B5C", fontSize: 12, fontWeight: "800" },
  description: { minHeight: 72, textAlignVertical: "top" },
  pricingTitle: { color: "#D75B5C", fontSize: 17, fontWeight: "900" },
  pricePreview: {
    color: "#D75B5C",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 12,
  },
  pricingHint: {
    color: "#8D7D70",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
  },
  agreementSummary: {
    marginTop: 14,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E8D2CD",
    backgroundColor: "#FFF9F6",
  },
  agreementTitle: { color: "#D75B5C", fontSize: 13, fontWeight: "900" },
  agreementCopy: { color: "#766B66", fontSize: 12, lineHeight: 17, marginTop: 5 },
  agreementButton: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 7,
    backgroundColor: "#D75B5C",
  },
  agreementButtonText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  agreementConfirmed: { color: "#4D8A61", fontSize: 12, fontWeight: "700", marginTop: 8 },
  agreementRequired: { color: "#B46A65", fontSize: 12, marginTop: 8 },
  agreementOverlay: { flex: 1, backgroundColor: "rgba(45, 35, 31, 0.55)", alignItems: "center", justifyContent: "center", padding: 16 },
  agreementModal: { width: "100%", maxWidth: 650, maxHeight: "92%", backgroundColor: "#FFFDF8", borderRadius: 16, overflow: "hidden" },
  agreementScroll: { padding: 18 },
  agreementModalHeading: { color: "#D75B5C", fontSize: 19, fontWeight: "900", textAlign: "center" },
  agreementModalHint: { color: "#766B66", fontSize: 12, lineHeight: 17, textAlign: "center", marginVertical: 10 },
  confirmAgreement: { marginTop: 14, padding: 12, borderWidth: 1, borderColor: "#D75B5C", borderRadius: 8, backgroundColor: "#FFF" },
  confirmAgreementActive: { backgroundColor: "#E8F3E9", borderColor: "#5A986A" },
  confirmAgreementText: { color: "#D75B5C", textAlign: "center", fontWeight: "800" },
  closeAgreement: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 22 },
  closeAgreementText: { color: "#766B66", fontWeight: "800" },
  submit: {
    alignSelf: "flex-end",
    backgroundColor: "#D75B5C",
    borderRadius: 7,
    paddingVertical: 10,
    paddingHorizontal: 25,
    marginTop: 12,
  },
  submitText: { color: "#FFF", fontWeight: "800" },
  auctionBox: {
    marginTop: 10,
    marginBottom: 6,
    padding: 14,
    backgroundColor: "#FFF8F6",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F5C6CB",
  },
  auctionHeaderTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#D75B5C",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dateError: { color: "#B94B50", fontSize: 12, fontWeight: "700", marginBottom: 8 },
});
