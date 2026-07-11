import { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import RootNavigator from './src/navigation/RootNavigator';
import { navigationRef } from './src/navigation/navigationRef';
import { useAuthListener } from './src/hooks/useAuthListener';
import { configureNotificationHandler } from './src/services/pushTokenService';
import { handleNotificationResponse, replayPendingNavigation } from './src/services/notificationNavigation';

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
