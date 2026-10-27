import { useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

type ScrollTarget = { scrollToEnd: (options?: { animated?: boolean }) => void };

export default function useChatAutoScroll<T extends ScrollTarget>(conversationKey: string | number) {
  const ref = useRef<T>(null);
  const following = useRef(true);
  const initial = useRef(true);
  const frame = useRef<number | null>(null);
  const [atLatest, setAtLatest] = useState(true);
  const schedule = (animated: boolean) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      ref.current?.scrollToEnd({ animated });
      initial.current = false;
    });
  };
  useEffect(() => {
    following.current = true; initial.current = true; setAtLatest(true);
    schedule(false);
    return () => { if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, [conversationKey]);
  const onContentSizeChange = () => { if (following.current) schedule(!initial.current); };
  const onScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (initial.current) return;
    const nearBottom = nativeEvent.contentSize.height - nativeEvent.layoutMeasurement.height - nativeEvent.contentOffset.y < 140;
    following.current = nearBottom;
    setAtLatest(nearBottom);
  };
  const scrollToLatest = () => { following.current = true; setAtLatest(true); schedule(true); };
  return { ref, atLatest, onScroll, onContentSizeChange, onLayout: onContentSizeChange, scrollToLatest };
}
