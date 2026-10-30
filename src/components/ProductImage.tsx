import { useId, useState } from 'react';
import { Image, Platform, StyleSheet, View, type ImageProps, type ImageStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect, Text as SvgText } from 'react-native-svg';

/** Watermarks displayed artwork previews. The source file and download remain unchanged. */
export default function ProductImage({ style, onLayout, resizeMode = 'cover', ...imageProps }: ImageProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const patternId = `artfilier-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const flat = StyleSheet.flatten(style) || {};
  const small = Math.min(size.width, size.height);
  const fontSize = Math.max(10, Math.min(25, small * 0.11));
  const tileWidth = fontSize * 7.8;
  const tileHeight = fontSize * 3.4;
  return <View style={[style as ViewStyle, s.frame]} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    onLayout?.(event);
  }}>
    <Image {...imageProps} resizeMode={resizeMode} style={[StyleSheet.absoluteFill, { borderRadius: flat.borderRadius } as ImageStyle]} />
    {size.width > 0 && size.height > 0 && <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width="100%" height="100%" {...(Platform.OS === 'web' ? { 'aria-hidden': true, focusable: false } : { accessible: false })}>
        <Defs><Pattern id={patternId} width={tileWidth} height={tileHeight} patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">
          <SvgText x={4} y={fontSize * 1.7} fontSize={fontSize} fontWeight="700" letterSpacing={1.5} fill="rgba(255,255,255,0.38)" stroke="rgba(40,24,24,0.24)" strokeWidth={0.5}>ARTFILIER</SvgText>
        </Pattern></Defs>
        <Rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </Svg>

    </View>}
  </View>;
}
const s = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
