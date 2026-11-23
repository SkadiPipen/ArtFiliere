import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { auth } from '@/firebase/config';
import { uploadDeliveryProofApi } from './deliveryApi';

const KEY = 'artfiliere.pending-delivery-proof.v1';
const MAX_AGE = 60 * 60 * 1000;
type Photo = { uri: string; width: number; height: number };
export type PendingDeliveryProof = {
  id: string; uid: string; orderId: string; role: 'artist' | 'buyer'; createdAt: number;
  asset?: Photo; preparedUri?: string;
};
let busy = false;
const listeners = new Set<() => void>();
function setBusy(value: boolean) { busy = value; listeners.forEach(listener => listener()); }
export const proofCaptureIsBusy = () => busy;
export function useProofCaptureBusy() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, proofCaptureIsBusy, () => false);
}

export function validPendingProof(value: any, now = Date.now()): value is PendingDeliveryProof {
  return Boolean(value && typeof value.id === 'string' && typeof value.uid === 'string' && value.uid
    && typeof value.orderId === 'string' && /^(?:verified-)?[1-9]\d*$/.test(value.orderId)
    && ['artist', 'buyer'].includes(value.role) && Number.isFinite(value.createdAt)
    && now >= value.createdAt && now - value.createdAt < MAX_AGE);
}
export async function readPendingProof(): Promise<PendingDeliveryProof | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try { const value = JSON.parse(raw); if (validPendingProof(value)) return value; } catch { /* discard malformed recovery data */ }
  await AsyncStorage.removeItem(KEY);
  return null;
}
export async function clearPendingProof(id: string) {
  const pending = await readPendingProof();
  if (pending?.id === id) await AsyncStorage.removeItem(KEY);
}
function requireOwner(record: PendingDeliveryProof) {
  if (!validPendingProof(record) || auth.currentUser?.uid !== record.uid) throw new Error('Sign in with the driver account that captured this photo before uploading it.');
}
export async function beginProofCapture(orderId: string, role: PendingDeliveryProof['role']) {
  if (busy) throw new Error('A proof photo is already being processed.');
  await auth.authStateReady();
  const record: PendingDeliveryProof = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, uid: auth.currentUser?.uid || '', orderId, role, createdAt: Date.now() };
  requireOwner(record);
  // Claim synchronously before storage; other capture/recovery operations must wait.
  if (busy) throw new Error('A proof photo is already being processed.');
  setBusy(true);
  try { await AsyncStorage.setItem(KEY, JSON.stringify(record)); return record; }
  catch (error) { setBusy(false); throw error; }
}
export function endProofCapture() { setBusy(false); }

export function proofResize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('The camera did not return a valid image. Please retake it.');
  return width >= height ? { width: Math.min(1600, width) } : { height: Math.min(1600, height) };
}
async function preparePhoto(asset: Photo) {
  const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
  let image: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    context.resize(proofResize(asset.width, asset.height));
    image = await context.renderAsync();
    return await image.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, compress: 0.65, base64: Platform.OS === 'web' });
  } finally { image?.release(); context.release(); }
}
export async function uploadPendingProof(record: PendingDeliveryProof, asset?: Photo) {
  requireOwner(record);
  const stored = await readPendingProof();
  if (stored?.id !== record.id) throw new Error('This proof capture is no longer pending. Please reopen the delivery.');
  let pending = { ...stored, ...(asset ? { asset, preparedUri: undefined } : {}) };
  if (!pending.asset) throw new Error('The captured photo could not be recovered. Please retake it.');
  // Persist the file URI before decoding/compressing; never store a full Base64 photo.
  await AsyncStorage.setItem(KEY, JSON.stringify(pending));
  let base64: string | undefined;
  if (!pending.preparedUri || Platform.OS === 'web') {
    const prepared = await preparePhoto(pending.asset);
    pending = { ...pending, preparedUri: prepared.uri };
    base64 = prepared.base64 || undefined;
    requireOwner(pending);
    await AsyncStorage.setItem(KEY, JSON.stringify(pending));
  }
  if (!base64) base64 = await FileSystem.readAsStringAsync(pending.preparedUri!, { encoding: FileSystem.EncodingType.Base64 });
  if (!base64 || base64.length > 6_800_000) throw new Error('The proof photo is too large. Please retake it at a lower camera resolution.');
  requireOwner(pending);
  await uploadDeliveryProofApi(pending.orderId, pending.role, `data:image/jpeg;base64,${base64}`, new Date(pending.createdAt).toISOString(), pending.role === 'artist' ? 'PICKUP' : 'DELIVERY', pending.uid);
  await clearPendingProof(pending.id);
  return { record: pending, uri: pending.preparedUri! };
}

export async function recoverProofCapture() {
  if (busy) return null;
  const pending = await readPendingProof();
  if (!pending || auth.currentUser?.uid !== pending.uid || busy) return null;
  setBusy(true);
  try {
    if (pending.asset) return await uploadPendingProof(pending);
    const result = Platform.OS === 'android' ? await ImagePicker.getPendingResultAsync() : null;
    if (result && 'assets' in result && !result.canceled && result.assets?.[0]) return await uploadPendingProof(pending, result.assets[0]);
    await clearPendingProof(pending.id);
    return { record: pending, uri: null };
  } finally { setBusy(false); }
}
