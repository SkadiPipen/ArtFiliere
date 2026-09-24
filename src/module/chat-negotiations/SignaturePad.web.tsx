import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

export type Strokes = number[][][];

export default function SignaturePad({ onChange, onDrawing }: { onChange: (strokes: Strokes) => void; onDrawing: (drawing: boolean) => void }) {
  const strokes = useRef<Strokes>([]);
  const pointer = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const callbacks = useRef({ onChange, onDrawing });
  callbacks.current = { onChange, onDrawing };
  const [rendered, setRendered] = useState<Strokes>([]);
  const redraw = () => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setRendered(strokes.current.map(stroke => [...stroke]));
    });
  };
  const append = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const stroke = strokes.current[strokes.current.length - 1];
    if (!stroke) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() || [];
    for (const sample of samples.length ? samples : [event.nativeEvent]) {
      const point = [Math.max(0, Math.min(1, (sample.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (sample.clientY - rect.top) / rect.height))];
      const last = stroke[stroke.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) stroke.push(point);
    }
    redraw();
  };
  const finish = () => {
    if (pointer.current === null) return;
    pointer.current = null;
    strokes.current = strokes.current.filter(stroke => stroke.length > 1);
    redraw();
    callbacks.current.onChange(strokes.current.map(stroke => stroke.map(point => [...point])));
    callbacks.current.onDrawing(false);
  };
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => {
      window.removeEventListener('blur', finish);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (pointer.current !== null) callbacks.current.onDrawing(false);
    };
  }, []);
  return <View>
    <Text>Draw your signature below</Text>
    <div style={{ border: '1px solid #999', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
      <div aria-label="Signature drawing pad" style={{ height: 180, touchAction: 'none', userSelect: 'none', cursor: 'crosshair' }}
        onPointerDown={event => {
          if (pointer.current !== null || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          pointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          strokes.current.push([]);
          callbacks.current.onDrawing(true);
          append(event);
        }}
        onPointerMove={event => {
          if (pointer.current !== event.pointerId) return;
          if (event.pointerType === 'mouse' && !(event.buttons & 1)) { finish(); return; }
          event.preventDefault(); append(event);
        }}
        onPointerUp={event => {
          if (pointer.current !== event.pointerId) return;
          append(event); finish();
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={finish} onLostPointerCapture={finish}>
        <svg width="100%" height="180" viewBox="0 0 600 180" preserveAspectRatio="none" style={{ display: 'block', pointerEvents: 'none' }}>
          {rendered.map((stroke, index) => <polyline key={index} points={stroke.map(point => `${point[0] * 600},${point[1] * 180}`).join(' ')} stroke="#191919" strokeWidth={2} vectorEffect="non-scaling-stroke" fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
        </svg>
      </div>
    </div>
    <TouchableOpacity onPress={() => { pointer.current = null; strokes.current = []; redraw(); onChange([]); onDrawing(false); }}><Text style={{ color: '#C15656', padding: 8 }}>Clear signature</Text></TouchableOpacity>
  </View>;
}
