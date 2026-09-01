import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './firebase';

function getProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
}

// Called once, at module scope, so importing this file anywhere (App.tsx)
// registers the foreground-display handler exactly once.
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

// Requests notification permission (if not already granted) and saves the
// device's Expo push token onto users/{uid}.expoPushTokens. Every step fails
// silently — this must never block sign-in.
export async function registerForPushNotificationsAsync(uid: string): Promise<void> {
  try {
    if (!Device.isDevice) return; // simulators/emulators without push support

    if (Platform.OS === 'android') {
      // Channel id bumped from 'default' to 'default-v2': Android channels are
      // immutable once created — a device that got the 'default' channel
      // before this DEFAULT-importance call existed (or with a lower
      // importance for any other reason) keeps that setting forever; this
      // call becomes a permanent no-op on it. A new channel id forces every
      // device, old installs included, to create it fresh with the importance
      // set here (status bar icon is suppressed to a plain dot for
      // below-DEFAULT-importance channels, which is what motivated this).
      // Display name changed from 'default' to 'General' too — otherwise
      // this and the orphaned old 'default' channel would show up as two
      // identically-labelled entries in the system notification settings.
      await Notifications.setNotificationChannelAsync('default-v2', {
        name: 'General',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return;

    const projectId = getProjectId();
    if (!projectId) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await updateDoc(doc(db, 'users', uid), {
      expoPushTokens: arrayUnion(token),
    });
  } catch {
    // best-effort — a device without push support/permission just won't
    // receive notifications, nothing else in the app depends on this
  }
}

// Removes this device's token from users/{uid}.expoPushTokens on sign-out.
// Without this, a shared/reused device (this app's real usage pattern — a
// scorer's phone passed between club volunteers) would leave the previous
// account's token registered forever, so the next signed-in account keeps
// receiving the prior account's notifications indefinitely (tokens are only
// otherwise pruned reactively, on a DeviceNotRegistered send failure after
// uninstall). Must run BEFORE firebaseSignOut — the Firestore write needs
// the still-valid auth session for `request.auth.uid == uid`.
export async function unregisterPushTokenAsync(uid: string): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const projectId = getProjectId();
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await updateDoc(doc(db, 'users', uid), {
      expoPushTokens: arrayRemove(token),
    });
  } catch {
    // best-effort — worst case the token lingers until DeviceNotRegistered
    // prunes it later
  }
}
