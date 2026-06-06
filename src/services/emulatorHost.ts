import Constants from 'expo-constants';

/**
 * Host the Firebase emulators are reachable at from the running device.
 *
 * On a simulator/web this is `localhost`. On a physical phone via Expo Go,
 * `localhost` is the phone itself, so we reuse the dev machine's LAN IP that
 * Expo already embeds in `hostUri` (e.g. "10.0.0.121:8081") to serve the bundle.
 */
export const EMULATOR_HOST =
  Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
