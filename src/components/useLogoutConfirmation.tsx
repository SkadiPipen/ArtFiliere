import { useState } from 'react';
import AppDialog from './AppDialog';

export default function useLogoutConfirmation() {
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);

  return {
    requestLogout: (action: () => void) => setConfirmAction(() => action),
    logoutConfirmation: <AppDialog
      visible={confirmAction !== null}
      title="Log out?"
      message="Are you sure you want to log out of ArtFilier?"
      secondaryLabel="Cancel"
      primaryLabel="Log Out"
      onClose={() => setConfirmAction(null)}
      onPrimary={confirmAction ?? undefined}
    />,
  };
}
