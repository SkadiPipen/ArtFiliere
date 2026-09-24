// ========================================
// FILE: src/components/artworks/AITagSuggestions.tsx
// PURPOSE: UI component for AI tag suggestions
// ========================================

import { Plus, Sparkles, X } from 'lucide-react-native';
import { useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface AITagSuggestionsProps {
  title: string;
  description: string;
  existingTags: string[];
  onAddTag: (tag: string) => void;
  onAddAll: (tags: string[]) => void;
  onClose: () => void;
  isLoading?: boolean;
  suggestedTags?: string[];
}

export default function AITagSuggestions({
  title,
  description,
  existingTags,
  onAddTag,
  onAddAll,
  onClose,
  isLoading = false,
  suggestedTags = [],
}: AITagSuggestionsProps) {
  const [fadeAnim] = useState(new Animated.Value(1));

  // Filter out tags already added
  const filteredTags = suggestedTags.filter(tag => !existingTags.includes(tag));

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Sparkles size={16} color="#D48C62" />
            <Text style={styles.headerTitle}>Analyzing your artwork...</Text>
          </View>
          <ActivityIndicator size="small" color="#D48C62" />
        </View>
      </View>
    );
  }

  if (filteredTags.length === 0) {
    return null;
  }

  const handleAddAll = () => {
    onAddAll(filteredTags);
  };

  const handleClose = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={16} color="#D48C62" />
          <Text style={styles.headerTitle}>AI Suggested Tags</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{filteredTags.length}</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleAddAll} style={styles.addAllButton}>
            <Text style={styles.addAllText}>Add All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={18} color="#8E8E93" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tagsContainer}>
        {filteredTags.map((tag, index) => (
          <TouchableOpacity
            key={index}
            style={styles.suggestionTag}
            onPress={() => onAddTag(tag)}
          >
            <Sparkles size={12} color="#D48C62" />
            <Text style={styles.suggestionTagText}>{tag}</Text>
            <Plus size={12} color="#D48C62" />
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.hint}>Tap a tag to add it, or use "Add All"</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FDF6F0',
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8D5C8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#D48C62',
  },
  badge: {
    backgroundColor: '#D48C62',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  addAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#D48C62',
    borderRadius: 12,
  },
  addAllText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  closeButton: {
    padding: 2,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  suggestionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D48C62',
    gap: 4,
  },
  suggestionTagText: {
    fontSize: 12,
    color: '#D48C62',
    fontWeight: '500',
  },
  hint: {
    fontSize: 11,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
});