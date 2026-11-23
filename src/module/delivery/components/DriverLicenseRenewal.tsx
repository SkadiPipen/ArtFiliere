import { pickDocument, type PermitDocument } from '@/components/businessPermit';
import CalendarDateField from '@/components/CalendarDateField';
import { Text } from '@/components/Typography';
import { purchaseRequest } from '@/services/purchases';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button, View } from 'react-native';

const path = 'users/driver-license-renewals/';
type RenewalState = {
  current_expiry: string | null;
  latest: { status: string; expires_on: string; note: string } | null;
};

export default function DriverLicenseRenewal() {
  const [record, setRecord] = useState<RenewalState | null>(null);
  const [document, setDocument] = useState<PermitDocument | null>(null);
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRecord(await purchaseRequest(path));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load license renewal.');
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const latest = await purchaseRequest(path, 'POST', { expires_on: expiry, document });
      setRecord(current => current && { ...current, latest });
      setDocument(null);
      setExpiry('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit the renewal.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={{ gap: 10 }}>
    <Text>License renewal</Text>
    {!!error && <Text accessibilityRole="alert">{error}</Text>}
    {record && <>
      <Text>Approved expiry date: {record.current_expiry ?? 'Date not recorded'}</Text>
      {record.latest && <Text>
        {record.latest.status === 'pending' ? 'Awaiting review' : `Renewal ${record.latest.status}`} · {record.latest.expires_on}
        {record.latest.note ? ` · ${record.latest.note}` : ''}
      </Text>}
      {record.latest?.status !== 'pending' && <>
        <CalendarDateField label="New expiry date" value={expiry} onChange={setExpiry} disabled={busy} />
        <Button title={document?.name ?? 'Choose renewed license'} color="#B65150" disabled={busy} onPress={async () => {
          try {
            const file = await pickDocument();
            if (file) setDocument(file);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to open the document picker.');
          }
        }} />
        <Button title="Submit for review" color="#B65150" disabled={busy || !document || !expiry} onPress={submit} />
      </>}
    </>}
  </View>;
}
