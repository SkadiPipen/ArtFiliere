import type { ReactNode } from 'react';

export default function RegistrationFieldGrid({ children }: { children: ReactNode }) {
  return <div style={{ width: '100%', minWidth: 0, containerType: 'inline-size' }}>
    <style>{'.hr-registration-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; width: 100%; } .hr-registration-fields > * { min-width: 0; } @container (max-width: 519px) { .hr-registration-fields { grid-template-columns: minmax(0, 1fr); } }'}</style>
    <div className="hr-registration-fields">{children}</div>
  </div>;
}
