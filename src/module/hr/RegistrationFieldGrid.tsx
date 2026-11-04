import { Children, type ReactNode } from 'react';
import { View, useWindowDimensions } from 'react-native';

export default function RegistrationFieldGrid({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const columns = width >= 640 ? 2 : 1;
  const fields = Children.toArray(children);
  return <View style={{ gap: 16 }}>{Array.from({ length: Math.ceil(fields.length / columns) }, (_, row) => <View key={row} style={{ flexDirection: 'row', gap: 16 }}>{fields.slice(row * columns, (row + 1) * columns).map((field, column) => <View key={column} style={{ flex: 1, minWidth: 0 }}>{field}</View>)}</View>)}</View>;
}
