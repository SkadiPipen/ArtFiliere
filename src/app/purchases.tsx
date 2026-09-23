import { useRouter } from 'expo-router';
import MyPurchases from '@/module/profile/MyPurchases';
export default function PurchasesPage() { const router = useRouter(); return <MyPurchases onClose={() => router.canGoBack() ? router.back() : router.replace('/profile')} />; }
