import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { useAuthStore } from '../store/authStore';
import TabNavigator, { type TabParamList } from './TabNavigator';
import SignInScreen from '../screens/SignIn';
import CreateClubScreen from '../screens/CreateClub';
import EditClubScreen from '../screens/EditClub';
import ClubRulesAdminScreen from '../screens/ClubRulesAdmin';
import ScheduleMatchScreen from '../screens/ScheduleMatch';
import TeamBuilderScreen from '../screens/TeamBuilder';
import TossScreen from '../screens/Toss';
import LiveScoringScreen from '../screens/LiveScoring';
import PlayerProfileScreen from '../screens/PlayerProfile';
import MatchScorecardScreen from '../screens/MatchScorecard';
import LeaderboardScreen from '../screens/Leaderboard';
import FindClubsScreen from '../screens/FindClubs';
import JoinRequestsScreen from '../screens/JoinRequests';
import RequesterProfileScreen from '../screens/RequesterProfile';
import EditProfileScreen from '../screens/EditProfile';

export type RootStackParamList = {
  SignIn: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  CreateClub: undefined;
  EditClub: { clubId: string };
  ClubRulesAdmin: { clubId: string };
  ScheduleMatch: { clubId: string };
  TeamBuilder: { clubId: string; matchId: string };
  Toss: { clubId: string; matchId: string };
  LiveScoring: { clubId: string; matchId: string };
  PlayerProfile: { clubId: string; playerId: string };
  MatchScorecard: { clubId: string; matchId: string };
  Leaderboard: { clubId: string };
  FindClubs: undefined;
  JoinRequests: { clubId: string };
  RequesterProfile: { clubId: string; uid: string; displayName: string };
  EditProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a1628', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#4ade80" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a1628' },
        headerTintColor: '#ffffff',
        contentStyle: { backgroundColor: '#0a1628' },
      }}
    >
      {user ? (
        <>
          <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
          <Stack.Screen name="CreateClub" component={CreateClubScreen} options={{ title: 'New Club' }} />
          <Stack.Screen name="EditClub" component={EditClubScreen} options={{ title: 'Edit Club' }} />
          <Stack.Screen name="ClubRulesAdmin" component={ClubRulesAdminScreen} options={{ title: 'Club Rules' }} />
          <Stack.Screen name="ScheduleMatch" component={ScheduleMatchScreen} options={{ title: 'Schedule Match' }} />
          <Stack.Screen name="TeamBuilder" component={TeamBuilderScreen} options={{ title: 'Build Teams' }} />
          <Stack.Screen name="Toss" component={TossScreen} options={{ title: 'Toss' }} />
          <Stack.Screen name="LiveScoring" component={LiveScoringScreen} options={{ title: 'Live Scoring' }} />
          <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen} options={{ title: 'Player' }} />
          <Stack.Screen name="MatchScorecard" component={MatchScorecardScreen} options={{ title: 'Scorecard' }} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
          <Stack.Screen name="FindClubs" component={FindClubsScreen} options={{ title: 'Find Clubs' }} />
          <Stack.Screen name="JoinRequests" component={JoinRequestsScreen} options={{ title: 'Join Requests' }} />
          <Stack.Screen name="RequesterProfile" component={RequesterProfileScreen} options={{ title: 'Player' }} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
