import type { ReactNode } from 'react';
import { Modal, type ModalProps } from 'react-native';

export type ContentModalProps = Omit<ModalProps, 'onRequestClose'> & { onRequestClose?: () => void };

export function ContentModalRegion({ children }: { children: ReactNode; enabled: boolean }) {
  return <>{children}</>;
}

export default function ContentModal(props: ContentModalProps) {
  return <Modal {...props} />;
}
