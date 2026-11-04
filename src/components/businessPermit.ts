import * as DocumentPicker from 'expo-document-picker';
import { Platform } from 'react-native';

export type PermitDocument = { name: string; data_uri: string };

export async function pickDocument(): Promise<PermitDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = result.assets[0];
  if ((file.size || 0) > 5 * 1024 * 1024) throw Error('Choose a document up to 5 MB.');
  let data: string;
  if (Platform.OS === 'web') {
    const blob = file.file || await (await fetch(file.uri)).blob();
    data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(Error('Could not read this document.'));
      reader.readAsDataURL(blob);
    });
  } else {
    const files = await import('expo-file-system/legacy');
    const content = await files.readAsStringAsync(file.uri, { encoding: files.EncodingType.Base64 });
    data = 'data:' + (file.mimeType || 'application/pdf') + ';base64,' + content;
  }
  return { name: file.name, data_uri: data };
}
