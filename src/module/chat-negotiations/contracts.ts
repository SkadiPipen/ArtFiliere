import { auth } from '@/firebase/config';
import API_URL from '@/services/api';

export type Contract = {
  fully_signed?: boolean;
  unread_count?: number;
  delivery_details?: { route_id?: number; delivery_address?: string };
  delivery_fee?: string;
  is_proposer: boolean;
  buyer_uid: string; artist_uid: string; created_at: string;
  id: number; artwork_id: number; title: string; buyer: string; artist: string;
  price: string; terms: string; status: string;
  buyer_accepted: boolean; artist_accepted: boolean; my_accepted: boolean;
};
export type ContractResponse = {
  artwork: { id: number; title: string; price: string; artist: string; artist_uid: string; buyer_uid: string; buyer_name: string; image_url: string; art_type: 'digital' | 'physical'; can_propose: boolean } | null;
  contracts: Contract[];
};
export const isAgreed = (contract: Contract) => contract.status === 'accepted' && contract.buyer_accepted && contract.artist_accepted;
export async function readApiResponse(response: Response) {
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    const hint = response.status === 404
      ? 'The requested API route was not found. Restart Django and check that the artwork is still available.'
      : response.status >= 500
        ? 'The backend returned a server error. Check the Django terminal for the traceback.'
        : 'The backend returned an HTML page instead of API data. Check the API address and restart Django.';
    throw new Error(`${hint} (HTTP ${response.status})`);
  }
  if (!response.ok) throw new Error(data.error || data.detail || `Request failed (HTTP ${response.status}).`);
  return data;
}
export async function contractRequest(path = '', method = 'GET', body?: object) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Please log in again.');
  const response = await fetch(`${API_URL}/api/users/contracts/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return readApiResponse(response);
}
