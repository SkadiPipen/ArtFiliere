import { Platform } from 'react-native';

export async function exportEarnings(csv: string) {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'artist-earnings.csv';
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    const fs = await import('expo-file-system/legacy');
    const sharing = await import('expo-sharing');
    if (!await sharing.isAvailableAsync()) throw Error('File sharing is unavailable on this device.');
    const uri = `${fs.cacheDirectory}artist-earnings.csv`;
    await fs.writeAsStringAsync(uri, '\uFEFF' + csv);
    await sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
  }
}
