import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
    paddingHorizontal: 15,
    marginVertical: 12,
    justifyContent: "space-around",
  },
  filter: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  filterActive: { backgroundColor: "#C15656" },
  filterInactive: { backgroundColor: "#FDF5E6" },
  filterText: { fontWeight: "600", fontSize: 13 },
  filterTextActive: { color: "#fff" },
  filterTextInactive: { color: "#C15656" },
});
