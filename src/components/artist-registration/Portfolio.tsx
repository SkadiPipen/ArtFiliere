import * as ImagePicker from 'expo-image-picker';
import { Calendar, Edit2, HelpCircle, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { PortfolioItem } from './types';

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
  const [dateMade, setDateMade] = useState('');
  const [artworkDesc, setArtworkDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const pickArtworkImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      quality: 0.7,
    });

    if (!result.canceled) {
      setCurrentArtworkUri(result.assets[0].uri);
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
            ? { ...item, imageUri: currentArtworkUri, title: artworkTitle, dateMade, description: artworkDesc }
            : item
        )
      );
      setEditingId(null);
    } else {
      const newItem: PortfolioItem = {
        id: Date.now().toString(),
        imageUri: currentArtworkUri,
        title: artworkTitle,
        dateMade,
        description: artworkDesc,
      };
      setPortfolioList((prev) => [...prev, newItem]);
    }

    setCurrentArtworkUri(null);
    setArtworkTitle('');
    setDateMade('');
    setArtworkDesc('');
  };

  const handleEditPortfolio = (item: PortfolioItem) => {
    setEditingId(item.id);
    setCurrentArtworkUri(item.imageUri);
    setArtworkTitle(item.title);
    setDateMade(item.dateMade);
    setArtworkDesc(item.description);
  };

  const handleDeletePortfolio = (id: string) => {
    setPortfolioList((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <View style={styles.stepContainer}>
      <View style={styles.titleRow}>
        <Text style={styles.mainTitleText}>Build Portfolio</Text>
        <TouchableOpacity>
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

          <Text style={styles.subLabelText}>Date Made</Text>
          <View style={styles.datePickerInputRow}>
            <TextInput
              style={styles.innerInputText}
              placeholder="dd/mm/yyyy"
              placeholderTextColor="#aaa"
              value={dateMade}
              onChangeText={setDateMade}
            />
            <View style={styles.calendarIconSquare}>
              <Calendar size={18} color="#fff" />
            </View>
          </View>
        </View>
      </View>

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
  datePickerInputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, height: 38, paddingLeft: 10, overflow: 'hidden' },
  innerInputText: { flex: 1, fontSize: 12, color: '#000' },
  calendarIconSquare: { backgroundColor: '#C15656', height: '100%', width: 36, justifyContent: 'center', alignItems: 'center' },
  bioTextAreaInput: { borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, padding: 10, textAlignVertical: 'top', fontSize: 13, color: '#000', minHeight: 70 },
  secondaryAddBtn: { backgroundColor: '#C15656', borderRadius: 8, height: 40, justifyContent: 'center', alignItems: 'center', marginTop: 15 },
  secondaryAddBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  portfolioCardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  portfolioCardElement: { width: '30%', height: 90, borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  portfolioCardThumbnail: { width: '100%', height: '60%' },
  cardActionControls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: '40%', backgroundColor: '#F9F9F9' },
  primaryRedButton: { backgroundColor: '#C15656', borderRadius: 8, height: 46, justifyContent: 'center', alignItems: 'center' },
  primaryBtnLabel: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});