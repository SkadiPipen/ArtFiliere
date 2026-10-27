import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

const coral = '#D45156';

/** Decorative overlay; it never intercepts card presses or changes the artwork. */
export default function ArtworkBorder({ artType, imageHeight }: { artType?: string; imageHeight: number }) {
  const digital = artType?.toLowerCase() === 'digital';
  return <View pointerEvents="none" aria-hidden style={styles.overlay}>
    <View style={styles.outline} />
    <View style={[styles.emblem, digital && styles.penAlignment]}>
      <Svg width="54" height="54" viewBox="0 0 80 80">
        {digital ? <G>
          <Path d="M6 20C0 40 0 55 14 66C30 80 52 80 66 66" fill="none" stroke={coral} strokeWidth="2" />
          <G transform="rotate(45 40 40)">
            <Path d="M25 34h30l5 19-20 24-20-24z" fill={coral} stroke="white" strokeWidth="2" strokeLinejoin="round" />
            <Path d="M40 49v26" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <Circle cx="40" cy="47" r="5.5" fill="white" />
            <Path d="M25 5h30v19H25z" fill="white" stroke={coral} strokeWidth="2.5" strokeLinejoin="round" />
            <Path d="M23 26h34v8H23z" fill="white" stroke={coral} strokeWidth="2.5" strokeLinejoin="round" />
          </G>
          <Path d="M6 15l5 5-5 5-5-5zM14 61l5 5-5 5-5-5zM66 61l5 5-5 5-5-5z" fill={coral} />
        </G> : <G>
          <Path d="M40 11C18 11 5 28 6 48c1 18 14 28 29 27 13-1 8-9 8-15 0-8 8-9 15-10 13-2 15-15 7-25-6-9-15-14-25-14z" fill={coral} stroke="white" strokeWidth="2" />
          <Circle cx="24" cy="30" r="5.5" fill="white" />
          <Circle cx="42" cy="23" r="5.5" fill="white" />
          <Circle cx="18" cy="48" r="5.5" fill="white" />
          <Circle cx="29" cy="63" r="5.5" fill="white" />
          <Path d="M55 52C59 38 70 12 76 9c6-2-3 23-15 43z" fill={coral} stroke="white" strokeWidth="2" />
          <Path d="M55 49l8 4-5 8-7-4z" fill="white" stroke={coral} strokeWidth="1.5" />
          <Path d="M51 57c-9 1-3 13-10 18 13-1 21-11 10-18z" fill={coral} stroke="white" strokeWidth="2" />
        </G>}
      </Svg>
    </View>
    <Svg width="42" height="90" viewBox="0 0 60 130" style={[styles.sparkles, { top: Math.max(0, imageHeight - 166) }]}>
      <Path d="M28 0C26 36 21 47 0 54c21 6 26 19 28 53 3-34 8-47 31-53C36 47 31 36 28 0z" fill={coral} />
      <Path d="M40 78c-2 18-5 24-18 28 13 4 16 10 18 24 2-14 5-20 18-24-13-4-16-10-18-28z" fill={coral} />
    </Svg>
  </View>;
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 5, overflow: 'visible' },
  outline: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderWidth: 1.5, borderColor: coral, borderRadius: 20 },
  emblem: { position: 'absolute', top: -19, right: -12, width: 56, height: 56 },
  penAlignment: { top: -21, right: -23 },
  sparkles: { position: 'absolute', left: -20 },
});
