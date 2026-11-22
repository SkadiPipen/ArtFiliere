import { Text, TextInput } from '@/components/Typography';
import ArtworkSizeFields from '@/module/artwork/components/ArtworkSizeFields';
import ArtworkTagPills from '@/module/artwork/components/ArtworkTagPills';
import CategoryPicker from '@/module/artwork/components/CategoryPicker';
import { purchaseRequest } from '@/services/purchases';
import * as ImagePicker from "expo-image-picker";
import { Edit2, HelpCircle, Plus, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { PortfolioItem } from "@/module/artist-registration/types";

interface Props {
  portfolioList: PortfolioItem[];
  setPortfolioList: React.Dispatch<React.SetStateAction<PortfolioItem[]>>;
  onSubmit: () => void;
  submitting: boolean;
}

export default function Portfolio({
  portfolioList,
  setPortfolioList,
  onSubmit,
  submitting,
}: Props) {
  const [currentArtworkUri, setCurrentArtworkUri] = useState<string | null>(
    null,
  );
  const [artworkTitle, setArtworkTitle] = useState("");
  const [artworkDesc, setArtworkDesc] = useState("");
  const [artType, setArtType] = useState<PortfolioItem['art_type']>('digital');
  const [medium, setMedium] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const generateTags = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await purchaseRequest('users/artist-applications/suggest-tags/', 'POST', { description: artworkDesc });
      setSuggestions([...new Set<string>([...selectedTags, ...(result.tags || [])])]);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not generate tags. You can still add them manually.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) setSelectedTags(selectedTags.filter(value => value !== tag));
    else if (selectedTags.length + customTags.length < 5) setSelectedTags([...selectedTags, tag]);
    else setError('Choose up to five tags.');
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:[ _-][a-z0-9]+)*$/.test(tag) || tag.length < 2 || tag.length > 40) {
      setError('Enter 2–40 letters or numbers. Spaces, hyphens, and underscores are allowed.');
      return;
    }
    const normalized = tag.replace(/[\s-]+/g, '_');
    if (customTags.includes(normalized) || selectedTags.includes(normalized)) return;
    if (customTags.length >= 3 || selectedTags.length + customTags.length >= 5) {
      setError('Choose up to five tags, including up to three manual tags.');
      return;
    }
    setCustomTags([...customTags, normalized]);
    setTagInput('');
    setError('');
  };

  const pickArtworkImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert(
          "Image unavailable",
          "Please choose the image again so it can be included with your application.",
        );
        return;
      }
      setCurrentArtworkUri(
        `data:${asset.mimeType || "image/jpeg"};base64,${asset.base64}`,
      );
    }
  };

  const handleAddPortfolio = () => {
    if (!currentArtworkUri || !artworkTitle.trim() || !artworkDesc.trim() || !categories.length ||
        !dimensions.trim() || (artType === 'physical' && !medium.trim())) {
      setError('Add an image, title, description, category, dimensions, and a medium for physical artwork.');
      return;
    }
    const item: PortfolioItem = {
      id: editingId ?? Date.now().toString(),
      imageUri: currentArtworkUri,
      imageDataUri: currentArtworkUri,
      title: artworkTitle.trim(),
      description: artworkDesc.trim(),
      art_type: artType,
      medium: artType === 'digital' ? 'Digital' : medium.trim(),
      dimensions: dimensions.trim(),
      categories,
      selected_ai_tags: selectedTags,
      custom_tags: customTags,
    };
    setPortfolioList(previous => editingId ? previous.map(existing => existing.id === editingId ? item : existing) : [...previous, item]);
    setEditingId(null);
    setCurrentArtworkUri(null);
    setArtworkTitle("");
    setArtworkDesc("");
    setArtType('digital'); setMedium(''); setDimensions(''); setCategories([]);
    setSuggestions([]); setSelectedTags([]); setCustomTags([]); setTagInput(''); setError('');
  };

  const handleEditPortfolio = (item: PortfolioItem) => {
    setEditingId(item.id);
    setCurrentArtworkUri(item.imageUri);
    setArtworkTitle(item.title);
    setArtworkDesc(item.description);
    setArtType(item.art_type);
    setMedium(item.medium);
    setDimensions(item.dimensions);
    setCategories(item.categories);
    setSuggestions(item.selected_ai_tags);
    setSelectedTags(item.selected_ai_tags);
    setCustomTags(item.custom_tags);
    setTagInput(''); setError('');
  };

  const handleDeletePortfolio = (id: string) => {
    setPortfolioList((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.titleRow}>
        <Text style={styles.mainTitleText}>Build Portfolio</Text>
        <TouchableOpacity
          onPress={() => setShowHelp((visible) => !visible)}
          accessibilityLabel="Portfolio requirement"
        >
          <HelpCircle size={22} color="#C15656" />
        </TouchableOpacity>
      </View>

      <View style={styles.artworkDraftRow}>
        <TouchableOpacity
          style={styles.artworkPickerBox}
          onPress={pickArtworkImage}
        >
          {currentArtworkUri ? (
            <Image
              source={{ uri: currentArtworkUri }}
              style={styles.artworkPreviewImg}
            />
          ) : (
            <Plus size={40} color="#C15656" />
          )}
        </TouchableOpacity>

        <View style={styles.artworkInputsRight}>
          <Text style={styles.subLabelText}>Artwork Title</Text>
          <TextInput
            style={styles.inputBoxSingleLine}
            placeholder="Name of your artwork"
            maxLength={200}
            placeholderTextColor="#aaa"
            value={artworkTitle}
            onChangeText={setArtworkTitle}
          />
        </View>
      </View>

      {showHelp && (
        <View style={styles.helpPanel}>
          <Text style={styles.helpText}>
            Add at least one original artwork before submitting. Choose pieces
            that show your style and the commissions you can accept.
          </Text>
        </View>
      )}

      <Text style={styles.requirementText}>
        Add at least one original artwork to submit your artist application.
      </Text>
      <Text style={styles.requirementText}>Submitted images are checked for similarities to artwork already on ArtFilier so the reviewer can inspect potential matches.</Text>

      <Text style={styles.subLabelText}>Artwork Description</Text>
      <TextInput
        style={styles.bioTextAreaInput}
        multiline
        maxLength={4000}
        numberOfLines={3}
        value={artworkDesc}
        onChangeText={setArtworkDesc}
        placeholder="Briefly describe this piece..."
        placeholderTextColor="#aaa"
      />

      <Text style={styles.subLabelText}>Artwork type *</Text>
      <View style={styles.metadataRow}>
        {(['digital', 'physical'] as const).map(type => <TouchableOpacity key={type} accessibilityRole="button" accessibilityState={{ selected: artType === type }}
          onPress={() => setArtType(type)} style={[styles.tagButton, artType === type && styles.tagSelected]}>
          <Text style={styles.tagText}>{type === 'digital' ? 'Digital' : 'Physical'}</Text>
        </TouchableOpacity>)}
      </View>
      <ArtworkSizeFields digital={artType === 'digital'} medium={medium} dimensions={dimensions}
        onMediumChange={setMedium} onDimensionsChange={setDimensions} />
      <CategoryPicker value={categories} onChange={setCategories} />
      <Text style={styles.subLabelText}>Tags</Text>
      <Text style={styles.requirementText}>Choose up to five tags, including up to three manual tags.</Text>
      <TouchableOpacity accessibilityRole="button" disabled={generating || artworkDesc.trim().length < 20} onPress={() => void generateTags()} style={[styles.tagButton, { alignSelf: 'flex-start', opacity: generating || artworkDesc.trim().length < 20 ? 0.5 : 1 }]}>
        <Text style={styles.tagText}>{generating ? 'Generating…' : 'Generate tags from description'}</Text>
      </TouchableOpacity>
      <View style={styles.metadataRow}>
        {suggestions.map(tag => <TouchableOpacity key={tag} accessibilityRole="button" accessibilityState={{ selected: selectedTags.includes(tag) }} onPress={() => toggleTag(tag)} style={[styles.tagButton, selectedTags.includes(tag) && styles.tagSelected]}>
          <Text style={styles.tagText}>{tag.replace(/_/g, ' ')}</Text>
        </TouchableOpacity>)}
        {customTags.map(tag => <TouchableOpacity key={`custom-${tag}`} accessibilityRole="button" accessibilityLabel={`Remove tag ${tag}`} onPress={() => setCustomTags(customTags.filter(value => value !== tag))} style={[styles.tagButton, styles.tagSelected]}>
          <Text style={styles.tagText}>{tag.replace(/_/g, ' ')} ×</Text>
        </TouchableOpacity>)}
      </View>
      <View style={styles.metadataRow}>
        <TextInput accessibilityLabel="Manual tag" value={tagInput} onChangeText={setTagInput} maxLength={40}
          placeholder="e.g. watercolor" placeholderTextColor="#9B8E88" onSubmitEditing={addTag} style={[styles.inputBoxSingleLine, { flex: 1 }]} />
        <TouchableOpacity accessibilityRole="button" onPress={addTag} style={styles.tagButton}><Text style={styles.tagText}>Add tag</Text></TouchableOpacity>
      </View>
      {!!error && <Text accessibilityRole="alert" style={styles.tagText}>{error}</Text>}
      <TouchableOpacity
        style={styles.secondaryAddBtn}
        disabled={generating}
        onPress={handleAddPortfolio}
      >
        <Text style={styles.secondaryAddBtnText}>
          {editingId ? "Update Item" : "Add to List"}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.labelTitle, { marginTop: 25 }]}>
        Portfolio Pieces ({portfolioList.length})
      </Text>
      <View style={styles.portfolioCardsGrid}>
        {portfolioList.map((item) => (
          <View key={item.id} style={styles.portfolioCardElement}>
            <Image
              source={{ uri: item.imageUri }}
              style={styles.portfolioCardThumbnail}
            />
            <Text style={styles.portfolioCardTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <ArtworkTagPills tags={[...new Set([...item.selected_ai_tags, ...item.custom_tags])]} />
            <View style={styles.cardActionControls}>
              <TouchableOpacity disabled={generating} onPress={() => handleEditPortfolio(item)}>
                <Edit2 size={18} color="#C15656" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeletePortfolio(item.id)}>
                <Trash2 size={18} color="#C15656" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.primaryRedButton, { marginTop: 30 }]}
        onPress={onSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnLabel}>Submit Registration</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginVertical: 8 },
  tagButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#E4D3CB', backgroundColor: '#FFF' },
  tagSelected: { backgroundColor: '#F8ECE8', borderColor: '#C05A52' },
  tagText: { color: '#A6453E', fontWeight: '700', fontSize: 13 },
  stepContainer: { width: "100%", backgroundColor: "#FFF", borderRadius: 16, borderWidth: 1, borderColor: "#E8D8D0", padding: 20 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 15,
  },
  mainTitleText: { fontFamily: "LoraSemiBold", fontSize: 26, color: "#3A2D2A" },
  labelTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#674B40",
    marginTop: 12,
    marginBottom: 6,
  },
  artworkDraftRow: { flexDirection: "row", gap: 15, marginTop: 10 },
  artworkPickerBox: {
    width: 110,
    height: 110,
    borderWidth: 1,
    borderColor: "#E4D3CB",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  artworkPreviewImg: { width: "100%", height: "100%" },
  artworkInputsRight: { flex: 1 },
  subLabelText: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#674B40",
    marginTop: 4,
    marginBottom: 4,
  },
  inputBoxSingleLine: {
    borderWidth: 1,
    borderColor: "#E4D3CB",
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 10,
    fontSize: 14,
    marginBottom: 6,
  },
  bioTextAreaInput: {
    borderWidth: 1,
    borderColor: "#E4D3CB",
    borderRadius: 12,
    padding: 10,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#3A2D2A",
    minHeight: 70,
  },
  requirementText: {
    color: "#786862",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  helpPanel: {
    backgroundColor: "#F5E7E1",
    borderLeftWidth: 3,
    borderLeftColor: "#C15656",
    borderRadius: 6,
    padding: 12,
    marginBottom: 8,
  },
  helpText: { color: "#6F625D", fontSize: 14, lineHeight: 21 },
  secondaryAddBtn: {
    backgroundColor: "#C15656",
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 15,
  },
  secondaryAddBtnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  portfolioCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  portfolioCardElement: {
    width: 180,
    height: 170,
    borderWidth: 1,
    borderColor: "#E4D3CB",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  portfolioCardThumbnail: { width: "100%", height: "55%" },
  portfolioCardTitle: {
    height: "18%",
    paddingHorizontal: 6,
    paddingTop: 3,
    color: "#3D3330",
    fontSize: 14,
    fontWeight: "700",
  },
  cardActionControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    height: "27%",
    backgroundColor: "#FAF5F1",
  },
  primaryRedButton: {
    backgroundColor: "#C15656",
    borderRadius: 12,
    height: 46,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnLabel: { color: "#fff", fontSize: 15, fontWeight: "bold" },
});
