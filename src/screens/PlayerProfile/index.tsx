import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import PlayerProfileView from '../../components/PlayerProfileView';

type Route = RouteProp<RootStackParamList, 'PlayerProfile'>;

export default function PlayerProfileScreen() {
  const { params } = useRoute<Route>();
  return <PlayerProfileView clubId={params.clubId} playerId={params.playerId} />;
}
