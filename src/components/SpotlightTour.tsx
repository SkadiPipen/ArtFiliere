export type TourStep = { target: string; instruction: string; closeOnActivate?: boolean };

export type SpotlightTourProps = {
  label: string;
  steps: readonly TourStep[];
  step: number;
  onNext: () => void;
  onClose: () => void;
};

export default function SpotlightTour(_props: SpotlightTourProps) {
  return null;
}
