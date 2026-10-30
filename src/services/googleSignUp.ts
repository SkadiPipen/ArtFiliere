import Constants from 'expo-constants';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '@/firebase/config';

export async function googleSignUp() {
  if (Constants.executionEnvironment === 'storeClient') {
    throw Error('Google sign-up requires an ArtFiliere development build. In Expo Go, use email sign-up or open ArtFiliere in your browser.');
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) throw Error('Google sign-up needs EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID configured for this build.');
  const { GoogleSignin, isSuccessResponse } = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  GoogleSignin.configure({ webClientId, iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID });
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;
  const token = response.data.idToken;
  if (!token) throw Error('Google did not return an identity token. Check your Google client configuration.');
  return (await signInWithCredential(auth, GoogleAuthProvider.credential(token))).user;
}
