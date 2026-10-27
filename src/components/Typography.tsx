import { createContext, forwardRef, useContext } from 'react';
import {
  Text as NativeText, TextInput as NativeTextInput, StyleSheet,
  type TextProps, type TextInputProps, type TextStyle,
} from 'react-native';

export const appFonts = {
  Lora: require('../../assets/fonts/Lora_400Regular.ttf'),
  LoraSemiBold: require('../../assets/fonts/Lora_600SemiBold.ttf'),
  NunitoSans: require('../../assets/fonts/NunitoSans_400Regular.ttf'),
  NunitoSansSemiBold: require('../../assets/fonts/NunitoSans_600SemiBold.ttf'),
  NunitoSansBold: require('../../assets/fonts/NunitoSans_700Bold.ttf'),
};

const FontContext = createContext<string | undefined>(undefined);

function fontFor(style: TextStyle, heading = false) {
  const weight = style.fontWeight === 'bold' ? 700 : Number(style.fontWeight || 400);
  return heading
    ? weight >= 500 ? 'LoraSemiBold' : 'Lora'
    : weight >= 700 ? 'NunitoSansBold' : weight >= 500 ? 'NunitoSansSemiBold' : 'NunitoSans';
}

// Use real font weights on every platform; explicit fonts (e.g. code) still win.
export type Text = NativeText;
export const Text = forwardRef<NativeText, TextProps>(function Text({ style, children, ...props }, ref) {
  const inherited = useContext(FontContext);
  const flat = StyleSheet.flatten(style) || {};
  const heading = (flat.fontSize || 0) >= 20;
  const family = flat.fontFamily || (!flat.fontSize && !flat.fontWeight && inherited) || fontFor(flat, heading);
  const fontStyle: TextStyle = flat.fontFamily ? {} : { fontFamily: family, fontWeight: 'normal' };
  return <FontContext.Provider value={family}>
    <NativeText ref={ref} {...props} style={[style, fontStyle]}>{children}</NativeText>
  </FontContext.Provider>;
});

export type TextInput = NativeTextInput;
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  const flat = StyleSheet.flatten(style) || {};
  return <NativeTextInput ref={ref} {...props} style={[style, !flat.fontFamily && { fontFamily: fontFor(flat), fontWeight: 'normal' }]} />;
});
