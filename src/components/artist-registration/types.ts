export interface PortfolioItem {
  id: string;
  imageUri: string;
  title: string;
  dateMade: string;
  description: string;
}

export interface DocumentFile {
  name: string;
  uri: string;
}

export interface ArtistRegistrationData {
  userId: string;
  age: string;
  hourly_rate: string;
  tinNum: string;
  bio: string;
  birCertificate: string;
  swornDeclaration: string;
  portfolio: PortfolioItem[];
  status: 'pending_approval' | 'approved' | 'rejected';
  submittedAt: string;
}