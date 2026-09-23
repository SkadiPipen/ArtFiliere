import { usePreventScreenCapture } from 'expo-screen-capture';

/** Native capture protection while the application is mounted. */
export default function ContentProtection() {
  usePreventScreenCapture('artfiliere-content');
  return null;
}
