import ProductImage from '@/components/ProductImage';
import { Text } from '@/components/Typography';
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/** A clipped, watermarked preview with mouse magnification and touch inspection. */
export default function ZoomableArtwork({ uri, height, interactive = false, onOpen }: {
  uri: string; height: number; interactive?: boolean; onOpen?: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height });
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [hovering, setHovering] = useState(false);
  const current = useRef(zoom);
  const gesture = useRef({ scale: 1, x: 0, y: 0, distance: 0, midX: 0, midY: 0 });
  const update = (scale: number, x: number, y: number) => {
    const next = {
      scale: Math.max(1, Math.min(4, scale)),
      x: clamp(x, size.width * (scale - 1) / 2),
      y: clamp(y, size.height * (scale - 1) / 2),
    };
    current.current = next;
    setZoom(next);
  };
  const reset = () => { setHovering(false); update(1, 0, 0); };
  const latest = useRef({ interactive, update });
  latest.current = { interactive, update };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: event => latest.current.interactive && (event.nativeEvent.touches.length > 1 || current.current.scale > 1),
    onMoveShouldSetPanResponder: event => latest.current.interactive && (event.nativeEvent.touches.length > 1 || current.current.scale > 1),
    onPanResponderGrant: event => {
      const [a, b] = event.nativeEvent.touches;
      gesture.current = {
        ...current.current,
        distance: b ? Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY) : 0,
        midX: b ? (a.pageX + b.pageX) / 2 : a.pageX,
        midY: b ? (a.pageY + b.pageY) / 2 : a.pageY,
      };
    },
    onPanResponderMove: event => {
      const [a, b] = event.nativeEvent.touches;
      if (!a) return;
      const start = gesture.current;
      const distance = b ? Math.hypot(b.pageX - a.pageX, b.pageY - a.pageY) : 0;
      // Rebase when a second finger is added or lifted to avoid a jump.
      if (Boolean(distance) !== Boolean(start.distance)) {
        gesture.current = { ...current.current, distance, midX: b ? (a.pageX + b.pageX) / 2 : a.pageX, midY: b ? (a.pageY + b.pageY) / 2 : a.pageY };
        return;
      }
      const scale = Math.max(1, Math.min(4, start.distance ? start.scale * distance / start.distance : start.scale));
      latest.current.update(scale, start.x + (b ? (a.pageX + b.pageX) / 2 : a.pageX) - start.midX,
        start.y + (b ? (a.pageY + b.pageY) / 2 : a.pageY) - start.midY);
    },
    onPanResponderTerminationRequest: () => false,
  }), []);
  const movePointer: NonNullable<React.ComponentProps<typeof View>['onPointerMove']> = event => {
    if (Platform.OS !== 'web' || event.nativeEvent.pointerType !== 'mouse') return;
    const target = event.currentTarget as unknown as { getBoundingClientRect: () => { left: number; top: number; width: number; height: number } };
    const bounds = target.getBoundingClientRect();
    const pointer = event.nativeEvent as unknown as { clientX: number; clientY: number };
    setHovering(true);
    update(2.5, (0.5 - (pointer.clientX - bounds.left) / bounds.width) * size.width * 1.5,
      (0.5 - (pointer.clientY - bounds.top) / bounds.height) * size.height * 1.5);
  };
  return <View>
    <View
      {...responder.panHandlers}
      onLayout={event => { setSize(event.nativeEvent.layout); reset(); }}
      onPointerMove={movePointer}
      onPointerLeave={() => { if (hovering) reset(); }}
      style={[styles.viewport, { height }, Platform.OS === 'web' && interactive ? { touchAction: 'none' } as any : undefined]}
    >
      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined}
        accessibilityLabel={onOpen ? 'Open artwork for a closer look' : 'Artwork preview'} style={styles.fill}>
        <View pointerEvents="none" style={[styles.fill, { transform: [{ translateX: zoom.x }, { translateY: zoom.y }, { scale: zoom.scale }] }]}>
          <ProductImage source={{ uri }} resizeMode="contain" style={styles.fill} />
        </View>
      </Pressable>
    </View>
    <View style={styles.toolbar}>
      <Text style={styles.hint}>{interactive ? (Platform.OS === 'web' ? 'Hover or pinch to zoom · Drag to explore' : 'Pinch to zoom · Drag to explore') : (Platform.OS === 'web' ? 'Hover to zoom · Tap to view larger' : 'Tap to view larger')}</Text>
      {interactive && <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom out" onPress={() => update(Math.max(1, zoom.scale - 0.5), zoom.x, zoom.y)} style={styles.control}><Text style={styles.label}>−</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Reset artwork zoom" onPress={reset} style={styles.control}><Text style={styles.label}>{Math.round(zoom.scale * 100)}%</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Zoom in" onPress={() => update(Math.min(4, zoom.scale + 0.5), zoom.x, zoom.y)} style={styles.control}><Text style={styles.label}>+</Text></Pressable>
      </View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  viewport: { width: '100%', overflow: 'hidden', backgroundColor: '#181616' },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  toolbar: { padding: 10, backgroundColor: '#292323', gap: 8, alignItems: 'center' },
  hint: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 10 },
  control: { minWidth: 44, minHeight: 44, paddingHorizontal: 12, backgroundColor: '#494040', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFFFFF', fontSize: 16 },
});
