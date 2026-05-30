import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from '../screens/Home';
import MatchesScreen from '../screens/Matches';
import LiveScoringScreen from '../screens/LiveScoring';
import SquadScreen from '../screens/Squad';
import ProfileScreen from '../screens/Profile';

export type TabParamList = {
  Home: undefined;
  Matches: undefined;
  Live: undefined;
  Squad: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0a1628' },
        headerTintColor: '#ffffff',
        tabBarStyle: { backgroundColor: '#0a1628' },
        tabBarActiveTintColor: '#4ade80',
        tabBarInactiveTintColor: '#6b7280',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen
        name="Live"
        component={LiveScoringScreen}
        options={{ title: 'Live Scoring' }}
      />
      <Tab.Screen name="Squad" component={SquadScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
