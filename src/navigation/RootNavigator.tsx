import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { ClubRules, MatchFormat } from '../types';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
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
import MatchStatsScreen from '../screens/MatchStats';
import LeaderboardScreen from '../screens/Leaderboard';
import FindClubsScreen from '../screens/FindClubs';
import JoinRequestsScreen from '../screens/JoinRequests';
import RequesterProfileScreen from '../screens/RequesterProfile';
import EditProfileScreen from '../screens/EditProfile';
import ClubDetailScreen from '../screens/ClubDetail';

// All match-setup data collected before the match exists in Firestore.
// Passed through ScheduleMatch → TeamBuilder → Toss; the Toss screen
// creates the match doc when the user confirms the toss.
export type MatchDraft = {
  homeTeam: string;
  awayTeam: string;
  venue: string;
  dateMs: number;       // Date.getTime() — JSON-serializable
  format: MatchFormat;
  rules: ClubRules;
  squad: string[];
  teamA?: string[];
  teamB?: string[];
  captainA?: string;
  captainB?: string;
};

export type RootStackParamList = {
  SignIn: undefined;
  Tabs: NavigatorScreenParams<TabParamList>;
  CreateClub: undefined;
  EditClub: { clubId: string };
  ClubRulesAdmin: { clubId: string };
  ScheduleMatch: { clubId: string };
  // matchId: editing an existing match's teams; matchDraft: new match setup in progress
  TeamBuilder: { clubId: string; matchId?: string; returnTo?: 'LiveScoring'; matchDraft?: MatchDraft };
  // matchId: existing match; matchDraft: new match (created at toss time)
  Toss: { clubId: string; matchId?: string; matchDraft?: MatchDraft };
  LiveScoring: { clubId: string; matchId: string };
  PlayerProfile: { clubId: string; playerId: string };
  MatchScorecard: { clubId: string; matchId: string };
  MatchStats: { clubId: string; matchId: string };
  Leaderboard: { clubId: string };
  FindClubs: undefined;
  ClubDetail: { clubId: string };
  JoinRequests: { clubId: string };
  RequesterProfile: { clubId: string; uid: string; displayName: string };
  EditProfile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const theme = useThemeStore((s) => s.theme);

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#ffffff', fontSize: 48, fontWeight: '800', letterSpacing: 2 }}>Crease</Text>
        <ActivityIndicator color="rgba(255,255,255,0.6)" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.bg },
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
          <Stack.Screen
            name="MatchScorecard"
            component={MatchScorecardScreen}
            options={({ navigation, route }) => ({
              title: 'Scorecard',
              headerRight: () => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('MatchStats', route.params)}
                  style={{ padding: 4 }}
                  hitSlop={8}
                >
                  <Ionicons name="stats-chart-outline" size={22} color={theme.text} />
                </TouchableOpacity>
              ),
            })}
          />
          <Stack.Screen name="MatchStats" component={MatchStatsScreen} options={{ title: 'Stats' }} />
          <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ title: 'Leaderboard' }} />
          <Stack.Screen name="FindClubs" component={FindClubsScreen} options={{ title: 'Find Clubs' }} />
          <Stack.Screen name="ClubDetail" component={ClubDetailScreen} options={{ title: 'Club' }} />
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
