# Google signup and optional profile photo

Signup connects Google identity in step 1, collects the required profile/address
and optional royalty application, then shows the optional profile photo after
the step 4 Create Account button. Upload and finish, or skip, creates the Django
account. Google authentication may create its Firebase identity earlier; it does
not create the platform user/address/royalty application until the final submit.
Email signup still works. Existing platform Google accounts must use Login.

## Firebase setup for web

Enable Google under Firebase Authentication > Sign-in method for the configured
project, and authorize the app's domain (including localhost for local testing).
The button uses Firebase's Google account chooser, not a client-supplied email.
Google Login is also available on the login screen.

## Android and iOS

Native Google authentication uses `@react-native-google-signin/google-signin`.
It requires a development or production build; Expo Go cannot load this native
module. Email signup and the photo/date pickers remain available in Expo Go.

Configure the Google/Firebase OAuth clients for the same Firebase project:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-oauth-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-ios-oauth-client-id.apps.googleusercontent.com
GOOGLE_IOS_URL_SCHEME=com.googleusercontent.apps.your-ios-client-id
```

These client IDs identify the public app; never place a Google client secret in
Expo variables. `app.config.ts` adds the Google sign-in config plugin when the
iOS URL scheme is supplied. Register the actual Android package name and signing
SHA-1 fingerprints, and the iOS bundle ID in Firebase/Google Cloud. Configure
`android.package` and `ios.bundleIdentifier` to those registered values before
building. Rebuild the native app after changing native OAuth configuration.
No production app IDs or OAuth client IDs are guessed by this change.

References:
- https://firebase.google.com/docs/auth/web/google-signin
- https://docs.expo.dev/guides/google-authentication/
- https://react-native-google-signin.github.io/docs/setting-up/expo

## Verification

Run `python manage.py test authentication.test_signup users.test_royalties` from
the backend virtual environment. `node scripts/test-signup-flow.cjs` verifies
that step 4 does not register, and the photo/skip choices submit the expected
payload. A real Google account chooser needs interactive testing in a configured
Firebase project and a configured native build.
