import type * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import type { PushNotificationData } from '../types';
import { navigationRef } from '../navigation/navigationRef';
import { usePendingNotificationStore, type PendingNav } from '../store/pendingNotificationStore';
import { useAuthStore } from '../store/authStore';

function targetFor(data: PushNotificationData): PendingNav {
  switch (data.type) {
    case 'join_request':
      return { screen: 'JoinRequests', params: { clubId: data.clubId } };
    case 'join_approved':
      return { screen: 'ClubDetail', params: { clubId: data.clubId } };
    case 'made_admin':
      // Lands on the club's members screen — where the new admin's own
      // "Make Admin"/"Revoke" controls live, so the tap is immediately useful.
      return { screen: 'EditClub', params: { clubId: data.clubId } };
    case 'match_live':
    case 'match_finished':
      // MatchScorecard already handles 'live' matches via real-time
      // listeners — no separate LiveScoring route needed for viewers.
      return { screen: 'MatchScorecard', params: { clubId: data.clubId, matchId: data.matchId } };
    case 'match_poll':
      return { screen: 'PollResponse', params: { clubId: data.clubId, pollId: data.pollId } };
  }
}

// Split into a per-case switch (rather than a single `.navigate(screen,
// params)` call) so TypeScript keeps `screen` and `params` correlated —
// destructuring a discriminated union into two separate arguments loses
// that correlation and widens `params` to the union of all three shapes.
export function navigateToPending(nav: PendingNav): void {
  switch (nav.screen) {
    case 'JoinRequests':
      navigationRef.navigate('JoinRequests', nav.params);
      break;
    case 'ClubDetail':
      navigationRef.navigate('ClubDetail', nav.params);
      break;
    case 'EditClub':
      navigationRef.navigate('EditClub', nav.params);
      break;
    case 'MatchScorecard':
      navigationRef.navigate('MatchScorecard', nav.params);
      break;
    case 'PollResponse':
      navigationRef.navigate('PollResponse', nav.params);
      break;
  }
}

// Single choke point for "is it safe to navigate right now" — called from
// every place that could plausibly be the moment navigation becomes
// possible (auth resolving, NavigationContainer's onReady), so a queued tap
// is never dependent on exactly one of those firing after the other. A tap
// that arrives when neither condition holds yet just leaves `pending` set;
// the next trigger picks it up.
export function replayPendingNavigation(): void {
  const pending = usePendingNotificationStore.getState().pending;
  if (!pending) return;
  const user = useAuthStore.getState().user;
  if (!user || !navigationRef.isReady()) return;
  navigateToPending(pending);
  usePendingNotificationStore.getState().clearPending();
}

export function handleNotificationResponse(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as unknown as Partial<PushNotificationData>;
  if (!data?.type) return;
  const target = targetFor(data as PushNotificationData);
  usePendingNotificationStore.getState().setPending(target);
  replayPendingNavigation();
}

// Universal/App Link (or the custom-scheme fallback) tap → queued the same
// way as a notification tap, via the same replayPendingNavigation() choke
// point. Only `poll/:clubId/:pollId` is recognised today; anything else is
// ignored rather than guessed at.
export function handleDeepLinkUrl(url: string): void {
  const { path } = Linking.parse(url);
  const segments = (path ?? '').split('/').filter(Boolean);
  if (segments[0] !== 'poll' || !segments[1] || !segments[2]) return;
  const [, clubId, pollId] = segments;
  usePendingNotificationStore.getState().setPending({ screen: 'PollResponse', params: { clubId, pollId } });
  replayPendingNavigation();
}
