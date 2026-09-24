import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
export type Strokes = number[][][];
export default function SignaturePad({ onChange, onDrawing }: { onChange: (strokes: Strokes) => void; onDrawing: (drawing: boolean) => void }) {
  const strokes = useRef<Strokes>([]);
  const width = useRef(600);
  const [rendered, setRendered] = useState<Strokes>([]);
  const point = (e: any) => [Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)), Math.max(0, Math.min(1, e.nativeEvent.locationY / 180))];
  const update = () => { const copy = strokes.current.map(s => [...s]); setRendered(copy); onChange(copy.filter(s => s.length > 1)); };
  return <View>
    <Text>Draw your signature below</Text>
    <View accessibilityLabel="Signature drawing pad" style={{ height: 180, borderWidth: 1, borderColor: '#999', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden', touchAction: 'none' }} onLayout={e => { width.current = e.nativeEvent.layout.width; }}
      onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
      onResponderGrant={e => { onDrawing(true); strokes.current.push([point(e)]); update(); }}
      onResponderMove={e => { const stroke = strokes.current[strokes.current.length - 1]; if (stroke && stroke.length < 1000) { stroke.push(point(e)); update(); } }}
      onResponderRelease={() => onDrawing(false)} onResponderTerminate={() => onDrawing(false)}>
      <Svg width="100%" height="180" viewBox="0 0 600 180" preserveAspectRatio="none" pointerEvents="none">
        {rendered.map((stroke, i) => <Polyline key={i} points={stroke.map(p => `${p[0]*600},${p[1]*180}`).join(' ')} stroke="#191919" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      </Svg>
    </View>
    <TouchableOpacity onPress={() => { strokes.current = []; update(); }}><Text style={{ color: '#C15656', padding: 8 }}>Clear signature</Text></TouchableOpacity>
  </View>;
}
