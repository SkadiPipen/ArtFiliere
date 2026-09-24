import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

type ToastType = "success" | "error";

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  duration?: number;
  onHide: () => void;
}

export default function Toast({
  visible,
  message,
  type = "success",
  duration = 1500,
  onHide,
}: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => onHide());
    }, duration);
    return () => clearTimeout(timer);
  }, [visible, duration]);

  if (!visible) return null;

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Animated.View
        style={[
          styles.container,
          type === "error" && styles.containerError,
          { opacity },
        ]}
      >
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 40,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
  },
  container: {
    backgroundColor: "#3EAA6D",
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    maxWidth: "90%",
  },
  containerError: {
    backgroundColor: "#D75B5C",
  },
  text: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
});
