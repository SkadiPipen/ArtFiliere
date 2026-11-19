import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import { auth } from "@/firebase/config";
import { getSignupPasswordError } from "@/services/signupPassword";

//register
export async function registerUser(email: string, password: string) {
  const passwordError = getSignupPasswordError(password);
  if (passwordError) throw new Error(passwordError);

  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );

  return credential.user;
}

//login
export async function loginUser(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  return credential.user;
}

//logout
export async function logOut() {
  await signOut(auth);
}
