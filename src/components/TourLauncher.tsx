import type { TourStep } from '@/components/SpotlightTour';

export type TourLauncherProps = {
  label: string;
  steps: readonly TourStep[];
  bottom?: number;
  right?: number;
  size?: number;
  controller?: { step: number | null; onStep: (step: number | null) => void };
};

export default function TourLauncher(_props: TourLauncherProps) {
  return null;
}
