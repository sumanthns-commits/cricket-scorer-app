import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import TabNavigator from './TabNavigator';
import SignInScreen from '../screens/SignIn';
import CreateClubScreen from '../screens/CreateClub';
import ClubRulesAdminScreen from '../screens/ClubRulesAdmin';
import ScheduleMatchScreen from '../screens/ScheduleMatch';
import TeamBuilderScreen from '../screens/TeamBuilder';
import TossScreen from '../screens/Toss';
import PlayerProfileScreen from '../screens/PlayerProfile';

export type RootStackParamList = {
  SignIn: undefined;
  Tabs: undefined;
  CreateClub: undefined;
  ClubRulesAdmin: { clubId: string };
  ScheduleMatch: { clubId: string };
  TeamBuilder: { clubId: string; matchId: string };
  Toss: { clubId: string; matchId: string };
  PlayerProfile: { clubId: string; playerId: string };
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
          <Stack.Screen name="ClubRulesAdmin" component={ClubRulesAdminScreen} options={{ title: 'Club Rules' }} />
          <Stack.Screen name="ScheduleMatch" component={ScheduleMatchScreen} options={{ title: 'Schedule Match' }} />
          <Stack.Screen name="TeamBuilder" component={TeamBuilderScreen} options={{ title: 'Build Teams' }} />
          <Stack.Screen name="Toss" component={TossScreen} options={{ title: 'Toss' }} />
          <Stack.Screen name="PlayerProfile" component={PlayerProfileScreen} options={{ title: 'Player' }} />
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
