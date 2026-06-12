import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/Home';
import MatchesScreen from '../screens/Matches';
import SquadScreen from '../screens/Squad';
import ProfileScreen from '../screens/Profile';
import AIAssistantScreen from '../screens/AIAssistant';
import { useClubStore } from '../store/clubStore';
import { useThemeStore } from '../store/themeStore';

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
  const activeClubId = useClubStore((s) => s.activeClubId);
  const theme = useThemeStore((s) => s.theme);

  const hideWhenNoClub = activeClubId ? undefined : () => null;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="Matches"
        component={MatchesScreen}
        options={{ tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen
        name="Squad"
        component={SquadScreen}
        options={{ tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen
        name="Assistant"
        component={AIAssistantScreen}
        options={{ title: 'AI Assistant', tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
