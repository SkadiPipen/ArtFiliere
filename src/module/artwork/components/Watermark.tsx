import ProductImage from '@/components/ProductImage';

interface WatermarkProps { uri: string; height?: number; onImageError?: () => void }
export function Watermark({ uri, height = 400, onImageError }: WatermarkProps) {
  return <ProductImage source={{ uri }} style={{ width: '100%', height }} resizeMode="cover" onError={onImageError} />;
}
