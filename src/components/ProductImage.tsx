import { useCallback, useEffect, useId, useState } from 'react';
import { Image, Platform, StyleSheet, View, type ImageProps, type ImageStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Pattern, Rect, Text as SvgText } from 'react-native-svg';

/** Watermarks displayed artwork previews. The source file and download remain unchanged. */
export default function ProductImage({ style, onLayout, onLoad, resizeMode = 'cover', ...imageProps }: ImageProps) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [intrinsic, setIntrinsic] = useState({ width: 0, height: 0 });
  const source = imageProps.source;
  const uri = source && typeof source === 'object' ? (Array.isArray(source) ? source[0]?.uri : source.uri) : undefined;
  useEffect(() => {
    let active = true;
    setIntrinsic({ width: 0, height: 0 });
    // React Native Web's load event may omit source dimensions (especially for
    // cached/data-URI purchases). Resolve them independently to clip the overlay.
    if (uri) Image.getSize(uri, (width, height) => {
      if (active && width > 0 && height > 0) setIntrinsic({ width, height });
    }, () => {});
    return () => { active = false; };
  }, [uri]);
  const handleLoad = useCallback<NonNullable<ImageProps['onLoad']>>(event => {
    // Web forwards a browser event; native provides source dimensions.
    const browserEvent = event as unknown as {
      nativeEvent?: { target?: { naturalWidth?: number; naturalHeight?: number } };
      target?: { naturalWidth?: number; naturalHeight?: number };
    };
    const target = browserEvent.nativeEvent?.target || browserEvent.target;
    const width = event.nativeEvent?.source?.width || target?.naturalWidth || 0;
    const height = event.nativeEvent?.source?.height || target?.naturalHeight || 0;
    if (width > 0 && height > 0) setIntrinsic(previous => previous.width === width && previous.height === height ? previous : { width, height });
    onLoad?.(event);
  }, [onLoad]);
  const patternId = `artfilier-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const flat = StyleSheet.flatten(style) || {};
  const small = Math.min(size.width, size.height);
  const fontSize = Math.max(10, Math.min(25, small * 0.11));
  const tileWidth = fontSize * 7.8;
  const tileHeight = fontSize * 3.4;
  const scale = intrinsic.width && intrinsic.height ? Math.min(size.width / intrinsic.width, size.height / intrinsic.height) : 0;
  const contained = resizeMode === 'contain';
  const watermarkBounds = contained ? {
    width: intrinsic.width * scale, height: intrinsic.height * scale,
    left: (size.width - intrinsic.width * scale) / 2,
    top: (size.height - intrinsic.height * scale) / 2,
  } : { top: 0, right: 0, bottom: 0, left: 0 };
  return <View style={[style as ViewStyle, s.frame]} onLayout={event => {
    const { width, height } = event.nativeEvent.layout;
    setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    onLayout?.(event);
  }}>
    <Image {...imageProps} onLoad={handleLoad} resizeMode={resizeMode} style={[StyleSheet.absoluteFill, { borderRadius: flat.borderRadius } as ImageStyle]} />
    {size.width > 0 && size.height > 0 && (!contained || scale > 0) && <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', overflow: 'hidden' }, watermarkBounds, { pointerEvents: 'none' }]}>
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
