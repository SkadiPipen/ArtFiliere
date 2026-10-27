import { StyleSheet } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

/** Lightweight artwork that stays behind the card copy. */
export default function PromoArtwork({ variant }: { variant: 'paint' | 'botanical' }) {
  return <Svg pointerEvents="none" aria-hidden viewBox="0 0 420 230" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
    {variant === 'paint' ? <G>
      <G opacity="0.5">
        <Path d="M328 3l7 5 8-2 2 8 8 5-5 6 1 7-9 1-6 6-5-8-9-2 4-8-3-8z" fill="#6C8792" />
        <Path d="M347 63l5-5 5 4 7-1 1 7 5 4-4 6-1 6-8-1-6 5-4-7-7-2 3-7-2-5z" fill="#B56D85" />
        <Path d="M410 91l8-5 9 5 4 10-8 9-11-3-7-7z" fill="#B56D85" />
        <Path d="M13 192l7-6 5 5 7-1 2 8 6 3-4 7-1 8-8-2-6 5-5-8-9-2 5-8z" fill="#698C91" />
      </G>
      <G fill="#8E6C66" opacity="0.55">
        <Circle cx="308" cy="13" r="2" /><Circle cx="320" cy="43" r="1.5" /><Circle cx="360" cy="30" r="2.5" />
        <Circle cx="374" cy="82" r="1.6" /><Circle cx="390" cy="63" r="2" /><Circle cx="395" cy="116" r="1.2" />
        <Circle cx="8" cy="174" r="1.5" /><Circle cx="43" cy="212" r="2.6" /><Circle cx="56" cy="222" r="1.5" />
        <Circle cx="8" cy="223" r="2" /><Circle cx="34" cy="174" r="1.2" /><Circle cx="378" cy="111" r="1" />
      </G>
      <Path d="M298 0l14 9M403 148l12 8M0 213l8 6" stroke="#B99563" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
    </G> : <G fill="none" stroke="#777F74" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.23">
      <Path d="M325 244c-5-39 15-58 12-88s-22-39-10-70 31-34 25-73M337 160c23-20 40-19 49-43M331 186c-24-15-35-30-37-49M332 112c-27-11-34-30-33-49M345 64c24-7 31-20 33-40" />
      <Path d="M351 23c-24 1-28-16-25-28 16 6 23 13 25 28zM346 51c-1-22 15-29 26-29-1 15-12 25-26 29zM330 100c-27-2-39-19-36-33 20 5 31 14 36 33zM333 128c4-22 24-28 39-25-9 17-22 24-39 25zM337 159c-24-9-34-25-29-38 17 9 28 22 29 38zM351 147c5-24 24-31 38-31-4 19-18 29-38 31zM325 192c-27-2-38-14-40-30 20 2 33 14 40 30zM329 214c7-25 23-35 40-33-5 18-17 29-40 33z" />
      <Path d="M393 222c-2-29 14-45 12-65M404 180c-17-11-18-22-15-31 11 7 16 18 15 31zM401 199c18-10 21-22 19-33-12 5-18 18-19 33zM271 17l15 7 12-8 13 10M290 24l3 16" />
      <Circle cx="271" cy="17" r="2" /><Circle cx="298" cy="16" r="2" /><Circle cx="311" cy="26" r="2" />
    </G>}
  </Svg>;
}
