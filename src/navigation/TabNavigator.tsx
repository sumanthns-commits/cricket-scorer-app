import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/Home';
import MatchesScreen from '../screens/Matches';
import SquadScreen from '../screens/Squad';
import ProfileScreen from '../screens/Profile';
import AIAssistantScreen from '../screens/AIAssistant';

export type TabParamList = {
  Home: undefined;
  Matches: undefined;
  Squad: undefined;
  Assistant: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home',
  Matches: 'calendar',
  Squad: 'people',
  Assistant: 'sparkles',
  Profile: 'person-circle',
};

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: '#0a1628' },
        headerTintColor: '#ffffff',
        tabBarStyle: { backgroundColor: '#0a1628' },
        tabBarActiveTintColor: '#4ade80',
        tabBarInactiveTintColor: '#6b7280',
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="Squad" component={SquadScreen} />
      <Tab.Screen
        name="Assistant"
        component={AIAssistantScreen}
        options={{ title: 'AI Assistant' }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
