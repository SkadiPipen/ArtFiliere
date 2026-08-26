import * as ImagePicker from 'expo-image-picker';
import { Edit2, HelpCircle, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PortfolioItem } from '@/module/artist-registration/types';

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
  const [currentArtworkUri, setCurrentArtworkUri] = useState<string | null>(null);
  const [artworkTitle, setArtworkTitle] = useState('');
  const [artworkDesc, setArtworkDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const pickArtworkImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled) {
      const asset = result.assets[0];
      if (!asset.base64) {
        Alert.alert('Image unavailable', 'Please choose the image again so it can be included with your application.');
        return;
      }
      setCurrentArtworkUri(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    }
  };

  const handleAddPortfolio = () => {
    if (!currentArtworkUri || !artworkTitle.trim()) {
      Alert.alert('Required', 'Please select an artwork image and enter a title.');
      return;
    }

    if (editingId) {
      setPortfolioList((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? { ...item, imageUri: currentArtworkUri, imageDataUri: currentArtworkUri, title: artworkTitle, description: artworkDesc }
            : item
        )
      );
      setEditingId(null);
    } else {
      const newItem: PortfolioItem = {
        id: Date.now().toString(),
        imageUri: currentArtworkUri,
        imageDataUri: currentArtworkUri,
        title: artworkTitle,
        description: artworkDesc,
      };
      setPortfolioList((prev) => [...prev, newItem]);
    }

    setCurrentArtworkUri(null);
    setArtworkTitle('');
    setArtworkDesc('');
  };

  const handleEditPortfolio = (item: PortfolioItem) => {
    setEditingId(item.id);
    setCurrentArtworkUri(item.imageUri);
    setArtworkTitle(item.title);
    setArtworkDesc(item.description);
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
        <TouchableOpacity style={styles.artworkPickerBox} onPress={pickArtworkImage}>
          {currentArtworkUri ? (
            <Image source={{ uri: currentArtworkUri }} style={styles.artworkPreviewImg} />
          ) : (
            <Plus size={40} color="#C15656" />
          )}
        </TouchableOpacity>

        <View style={styles.artworkInputsRight}>
          <Text style={styles.subLabelText}>Artwork Title</Text>
          <TextInput
            style={styles.inputBoxSingleLine}
            placeholder="Name of your artwork"
            placeholderTextColor="#aaa"
            value={artworkTitle}
            onChangeText={setArtworkTitle}
          />

        </View>
      </View>

      {showHelp && (
        <View style={styles.helpPanel}>
          <Text style={styles.helpText}>Add at least one original artwork before submitting. Choose pieces that show your style and the commissions you can accept.</Text>
        </View>
      )}

      <Text style={styles.requirementText}>Add at least one original artwork to submit your artist application.</Text>

      <Text style={styles.subLabelText}>Artwork Description</Text>
      <TextInput
        style={styles.bioTextAreaInput}
        multiline
        numberOfLines={3}
        value={artworkDesc}
        onChangeText={setArtworkDesc}
        placeholder="Briefly describe this piece..."
        placeholderTextColor="#aaa"
      />

      <TouchableOpacity style={styles.secondaryAddBtn} onPress={handleAddPortfolio}>
        <Text style={styles.secondaryAddBtnText}>{editingId ? 'Update Item' : 'Add to List'}</Text>
      </TouchableOpacity>

      <Text style={[styles.labelTitle, { marginTop: 25 }]}>Portfolio Pieces ({portfolioList.length})</Text>
      <View style={styles.portfolioCardsGrid}>
        {portfolioList.map((item) => (
          <View key={item.id} style={styles.portfolioCardElement}>
            <Image source={{ uri: item.imageUri }} style={styles.portfolioCardThumbnail} />
            <Text style={styles.portfolioCardTitle} numberOfLines={1}>{item.title}</Text>
            <View style={styles.cardActionControls}>
              <TouchableOpacity onPress={() => handleEditPortfolio(item)}>
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
  stepContainer: { width: '100%' },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  mainTitleText: { fontSize: 22, fontWeight: 'bold', color: '#C15656' },
  labelTitle: { fontSize: 13, fontWeight: 'bold', color: '#C15656', marginTop: 12, marginBottom: 6 },
  artworkDraftRow: { flexDirection: 'row', gap: 15, marginTop: 10 },
  artworkPickerBox: { width: 110, height: 110, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  artworkPreviewImg: { width: '100%', height: '100%' },
  artworkInputsRight: { flex: 1 },
  subLabelText: { fontSize: 12, fontWeight: 'bold', color: '#C15656', marginTop: 4, marginBottom: 4 },
  inputBoxSingleLine: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, height: 38, paddingHorizontal: 10, fontSize: 12, marginBottom: 6 },
  bioTextAreaInput: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, padding: 10, textAlignVertical: 'top', fontSize: 13, color: '#000', minHeight: 70 },
  requirementText: { color: '#7B6A65', fontSize: 12, lineHeight: 17, marginTop: 14, paddingHorizontal: 2 },
  helpPanel: { backgroundColor: '#FFF6E8', borderLeftWidth: 3, borderLeftColor: '#C15656', borderRadius: 6, padding: 12, marginBottom: 8 },
  helpText: { color: '#6F625D', fontSize: 12, lineHeight: 18 },
  secondaryAddBtn: { backgroundColor: '#C15656', borderRadius: 8, height: 40, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  secondaryAddBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  portfolioCardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  portfolioCardElement: { width: '30%', height: 90, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  portfolioCardThumbnail: { width: '100%', height: '55%' },
  portfolioCardTitle: { height: '18%', paddingHorizontal: 6, paddingTop: 3, color: '#3D3330', fontSize: 10, fontWeight: '700' },
  cardActionControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: '27%', backgroundColor: '#F9F9F9' },
  primaryRedButton: { backgroundColor: '#C15656', borderRadius: 8, height: 46, justifyContent: 'center', alignItems: 'center' },
  primaryBtnLabel: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
