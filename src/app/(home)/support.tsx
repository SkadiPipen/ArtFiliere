import { useLocalSearchParams } from 'expo-router';
import SupportScreen from '@/module/support/SupportScreen';

export default function SupportPage() {
  const { artworkId } = useLocalSearchParams<{ artworkId?: string }>();
  const id = Number(artworkId);
  return <SupportScreen initialArtworkId={Number.isSafeInteger(id) && id > 0 ? id : undefined} />;
}
