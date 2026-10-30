import { goBackOr } from '@/services/navigation';
import MyPurchases from '@/module/profile/MyPurchases';
export default function PurchasesPage() { return <MyPurchases onClose={() => goBackOr('/(home)/profile')} />; }
