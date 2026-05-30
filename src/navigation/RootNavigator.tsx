import { View, ActivityIndicator } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuthStore } from '../store/authStore';
import TabNavigator from './TabNavigator';
import SignInScreen from '../screens/SignIn';
import CreateClubScreen from '../screens/CreateClub';
import ClubRulesAdminScreen from '../screens/ClubRulesAdmin';

export type RootStackParamList = {
  SignIn: undefined;
  Tabs: undefined;
  CreateClub: undefined;
  ClubRulesAdmin: { clubId: string };
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
        </>
      ) : (
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
      )}
    </Stack.Navigator>
  );
}
