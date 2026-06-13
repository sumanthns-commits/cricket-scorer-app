import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function withTopInset<T extends object>(Screen: React.ComponentType<T>) {
  return function SafeTopScreen(props: T) {
    const insets = useSafeAreaInsets();
    const theme = useThemeStore((s) => s.theme);
    return (
      <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.bg }}>
        <Screen {...props} />
      </View>
    );
  };
}

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
        headerShown: false,
        tabBarStyle: { backgroundColor: theme.bg, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={withTopInset(HomeScreen)} />
      <Tab.Screen
        name="Matches"
        component={withTopInset(MatchesScreen)}
        options={{ tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen
        name="Squad"
        component={withTopInset(SquadScreen)}
        options={{ tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen
        name="Assistant"
        component={withTopInset(AIAssistantScreen)}
        options={{ tabBarButton: hideWhenNoClub }}
      />
      <Tab.Screen name="Profile" component={withTopInset(ProfileScreen)} />
    </Tab.Navigator>
  );
}
