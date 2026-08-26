export interface PortfolioItem {
  id: string;
  imageUri: string;
  /** Portable data URL retained for HR review after the applicant leaves their device. */
  imageDataUri?: string;
  title: string;
  description: string;
}

export interface DocumentFile {
  name: string;
  uri: string;
}

export interface ArtistRegistrationData {
  userId: string;
  hourly_rate: string;
  tinNum: string;
  bio: string;
  birCertificate: string;
  swornDeclaration: string;
  portfolio: PortfolioItem[];
  status: 'pending_approval' | 'approved' | 'rejected';
  submittedAt: string;
}
