import { createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootNavigator';

// Lets code outside the component tree (the notification tap handler, and the
// deep-link URL handler for shared match-poll links) drive navigation — this
// app has no React Navigation `linking` config; both kinds of tap are routed
// manually through the pendingNotificationStore queue instead, since
// RootNavigator only registers its full screen set once signed in.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
