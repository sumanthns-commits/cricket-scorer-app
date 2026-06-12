import { View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { listPendingJoinRequests } from '../../services/joinRequestService';
import PlayerAvatar from '../../components/PlayerAvatar';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinRequests'>;

export default function JoinRequestsScreen({ route, navigation }: Props) {
  const { clubId } = route.params;

  const { data: requests, isLoading } = useQuery({
    queryKey: ['joinRequests', clubId],
    queryFn: () => listPendingJoinRequests(clubId),
  });

  return (
    <View style={{ flex: 1, backgroundColor: '#0a1628', padding: 16 }}>
      {isLoading ? (
        <ActivityIndicator color="#4ade80" style={{ marginTop: 40 }} />
      ) : requests && requests.length > 0 ? (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.uid}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('RequesterProfile', {
                  clubId,
                  uid: item.uid,
                  displayName: item.displayName,
                })
              }
              style={{
                backgroundColor: '#1e2d45',
                borderRadius: 12,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: '#2d3f58',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <PlayerAvatar name={item.displayName} photoURL={item.photoURL ?? undefined} size={40} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: '600' }}>
                  {item.displayName}
                </Text>
                <Text style={{ color: '#60a5fa', fontSize: 12, marginTop: 2 }}>
                  Review, link & approve ›
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: '#6b7280', fontSize: 16, textAlign: 'center' }}>
            No pending join requests.
          </Text>
        </View>
      )}
    </View>
  );
}
