import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type { AddressOption } from "@/constants/addresses";

type DropdownProps = {
  placeholder: string;
  value: string;
  options: AddressOption[];
  onSelect: (name: string) => void;
  disabled?: boolean;
};

export default function Dropdown({
  placeholder,
  value,
  options,
  onSelect,
  disabled,
}: DropdownProps) {
  const [open, setOpen] = useState(false);

  return (
    <View style={{ marginBottom: 14 }}>
      <Pressable
        onPress={() => !disabled && setOpen((prev) => !prev)}
        style={{
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: disabled ? COLORS.border : COLORS.creamLight,
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: value ? COLORS.textDark : COLORS.textMuted,
            fontSize: 15,
          }}
        >
          {value || placeholder}
        </Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={COLORS.textMuted}
        />
      </Pressable>

      {open && (
        <View
          style={{
            borderWidth: 1,
            borderColor: COLORS.border,
            borderRadius: 8,
            marginTop: 4,
            maxHeight: 160,
            backgroundColor: COLORS.white,
          }}
        >
          <ScrollView>
            {options.map((option) => (
              <Pressable
                key={option.code}
                onPress={() => {
                  onSelect(option.name);
                  setOpen(false);
                }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: COLORS.border,
                }}
              >
                <Text style={{ color: COLORS.textDark, fontSize: 14 }}>
                  {option.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
