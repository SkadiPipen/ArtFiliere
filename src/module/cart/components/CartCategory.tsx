import { Text } from '@/components/Typography';
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { FilterType } from "@/module/cart/types";

interface Props {
  activeFilter: FilterType;
  onSelectFilter: (filter: FilterType) => void;
}

export default function CartCategory({ activeFilter, onSelectFilter }: Props) {
  const filters: FilterType[] = ["All", "Direct Sell", "Auction", "Commission"];

  return (
    <View style={styles.filterTabsContainer}>
      {filters.map((filter) => (
        <TouchableOpacity
          key={filter}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeFilter === filter }}
          style={[
            styles.filter,
            activeFilter === filter
              ? styles.filterActive
              : styles.filterInactive,
          ]}
          onPress={() => onSelectFilter(filter)}
        >
          <Text
            style={[
              styles.filterText,
              activeFilter === filter
                ? styles.filterTextActive
                : styles.filterTextInactive,
            ]}
          >
            {filter}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filterTabsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginVertical: 20,
    gap: 10, flexWrap: 'wrap',
  },
  filter: {
    flex: 1, minWidth: 110, minHeight: 48, borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  filterActive: { backgroundColor: "#FFF0E4", borderColor: '#E68A50' },
  filterInactive: { backgroundColor: "#FFFFFF", borderColor: '#E5DAD3' },
  filterText: { fontWeight: "600", fontSize: 13 },
  filterTextActive: { color: "#70482F" },
  filterTextInactive: { color: "#70482F" },
});
