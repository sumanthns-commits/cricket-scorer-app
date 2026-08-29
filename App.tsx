import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { useAuthListener } from './src/hooks/useAuthListener';
import { configureNotificationHandler } from './src/services/pushTokenService';
import {
  handleNotificationResponse,
  handleDeepLinkUrl,
  replayPendingNavigation,
} from './src/services/notificationNavigation';

const queryClient = new QueryClient();
configureNotificationHandler();

function AppInner() {
  useAuthListener();

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    // Cold start: the app was launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleNotificationResponse(response);
    });
    return () => sub.remove();
  }, []);

  // Shared match-poll links (universal/app links + the custom scheme, both
  // registered in app.json) — deliberately NOT wired through
  // NavigationContainer's `linking` prop: RootNavigator swaps its entire
  // screen set on sign-in/out (see navigationRef.ts), which would silently
  // drop a `linking`-driven navigation that arrives while signed out. Routing
  // through the same pending-nav queue as notification taps means it's
  // replayed once auth resolves, exactly like every other deep entry point.
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLinkUrl(url));
    // Cold start: the app was launched by tapping the link.
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLinkUrl(url);
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer ref={navigationRef} onReady={replayPendingNavigation}>
        <AppInner />
      </NavigationContainer>
    </QueryClientProvider>
  );
}
