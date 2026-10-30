export type SignUpFormData = {
  profileImage: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  contactNumber: string;
  region: string;
  province: string;
  city: string;
  postalCode: string;
  barangay: string;
  street: string;
  wantsRoyalty: "yes" | "no" | null;
  royaltyFileName: string | null;
  businessPermitImage: string | null;
  permitExpiresOn: string;
};

export const INITIAL_SIGN_UP_FORM_DATA: SignUpFormData = {
  profileImage: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  contactNumber: "",
  region: "",
  province: "",
  city: "",
  postalCode: "",
  barangay: "",
  street: "",
  wantsRoyalty: null,
  royaltyFileName: null,
  businessPermitImage: null,
  permitExpiresOn: '',
};

export type UpdateSignUpField = <K extends keyof SignUpFormData>(
  key: K,
  value: SignUpFormData[K],
) => void;

// Maps camelCase client state to the snake_case field names Django expects
// (users.User: username, first_name, middle_name, last_name, date_of_birth,
// contact_number, wants_royalty; users.Address: region, province, city,
// postal_code, barangay, street).
export function toDjangoPayload(formData: SignUpFormData) {
  return {
    ...(formData.profileImage ? { profile_image: formData.profileImage } : {}),
    username: formData.username,
    email: formData.email,
    first_name: formData.firstName,
    middle_name: formData.middleName,
    last_name: formData.lastName,
    date_of_birth: formData.dateOfBirth,
    contact_number: formData.contactNumber,
    wants_royalty: formData.wantsRoyalty ?? "no",
    ...(formData.wantsRoyalty === 'yes' ? { business_permit_image: formData.businessPermitImage, permit_expires_on: formData.permitExpiresOn } : {}),
    address: {
      region: formData.region,
      province: formData.province,
      city: formData.city,
      postal_code: formData.postalCode,
      barangay: formData.barangay,
      street: formData.street,
    },
  };
}
