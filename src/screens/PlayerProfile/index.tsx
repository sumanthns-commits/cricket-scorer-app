import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import PlayerProfileView from '../../components/PlayerProfileView';
import { useAuthStore } from '../../store/authStore';
import { getClubMember } from '../../services/clubService';

type Route = RouteProp<RootStackParamList, 'PlayerProfile'>;

export default function PlayerProfileScreen() {
  const { params } = useRoute<Route>();
  const uid = useAuthStore((s) => s.user?.uid);

  // Admins can edit any player's editable fields; everyone else only their own.
  const { data: me } = useQuery({
    queryKey: ['clubMember', params.clubId, uid],
    queryFn: () => getClubMember(params.clubId, uid!),
    enabled: !!uid,
  });
  const isAdmin = me?.role === 'admin';
  const canEdit = !!uid && (isAdmin || params.playerId === uid);

  return (
    <PlayerProfileView
      clubId={params.clubId}
      playerId={params.playerId}
      canEdit={canEdit}
      isAdmin={isAdmin}
    />
  );
}
