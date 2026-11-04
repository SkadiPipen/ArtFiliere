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
  dataUri: string;
  mimeType?: string;
}

export interface ArtistRegistrationData {
  userId: string;
  hourly_rate: string;
  tinNum: string;
  bio: string;
  birCertificate: string;
  swornDeclaration: string;
  portfolio: PortfolioItem[];
  status: "pending_approval" | "approved" | "rejected";
  submittedAt: string;
}

export type DocumentDetails = {
  registered_name: string;
  rdo_code: string;
  registration_date: string;
  taxable_year: string;
  notarized_date: string;
  bir_received_date: string;
  remittance_status: '' | 'not_exceed_500000' | 'exceed_500000';
  confirmed: boolean;
};
