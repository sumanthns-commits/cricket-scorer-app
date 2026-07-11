import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

// Lets code outside the component tree (the notification tap handler) drive
// navigation — this app has no React Navigation `linking` config, so taps
// are routed manually instead of through URL-based deep linking.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
