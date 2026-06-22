import { useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform, Pressable, Alert, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import type { TabParamList } from '../../navigation/TabNavigator';
import { useClubStore } from '../../store/clubStore';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { getClubSquad, type SquadEntry } from '../../services/squadService';
import { computeSkillRating, createGhostPlayer } from '../../services/playerProfileService';
import { getClubMember } from '../../services/clubService';
import PlayerAvatar from '../../components/PlayerAvatar';
import type { BattingHand, BowlingStyle, PlayerType, WicketKeepingAbility } from '../../types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList>,
  NativeStackNavigationProp<RootStackParamList>
>;

const TYPE_DOT: Record<PlayerType, string> = {
  ghost: '#a78bfa',
  registered: '#16a34a',
  linked: '#2563eb',
};

function SquadRow({ entry, onPress }: { entry: SquadEntry; onPress: () => void }) {
  const theme = useThemeStore((s) => s.theme);
  const { player, role } = entry;
  // TODO: route through statsResolver when claim lifecycle is implemented
  const rating = player.skillRating ?? computeSkillRating(player.careerStats);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.border,
        gap: 12,
      }}
    >
      <PlayerAvatar name={player.displayName} photoURL={player.photoURL} seed={player.id} size={44} />

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '700' }}>{player.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: TYPE_DOT[player.type] }} />
            <Text style={{ color: TYPE_DOT[player.type], fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
              {player.type}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <View
            style={{
              backgroundColor: role === 'admin' ? '#ede9fe' : theme.surfaceAlt,
              borderRadius: 5,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderWidth: 1,
              borderColor: role === 'admin' ? '#a78bfa' : theme.border,
            }}
          >
            <Text
              style={{
                color: role === 'admin' ? '#7c3aed' : theme.textMuted,
                fontSize: 10,
                fontWeight: '700',
                textTransform: 'uppercase',
              }}
            >
              {role}
            </Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {/* TODO: use statsResolver when claim lifecycle is implemented */}
            {player.careerStats.matchesPlayed} matches
          </Text>
        </View>
      </View>

      <View style={{ alignItems: 'center', minWidth: 44 }}>
        <Text style={{ color: theme.accent, fontSize: 20, fontWeight: '800' }}>{rating}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '600' }}>RATING</Text>
      </View>
    </TouchableOpacity>
  );
}

function ChipSelector<T extends string>({
  label,
  options,
  value,
  onChange,
  theme,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
  theme: ReturnType<typeof useThemeStore.getState>['theme'];
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>{label}</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(selected ? null : opt.value)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                borderWidth: 1.5,
                borderColor: selected ? theme.accent : theme.border,
                backgroundColor: selected ? theme.accentDim : theme.surfaceAlt,
              }}
            >
              <Text style={{ color: selected ? theme.accent : theme.textSecondary, fontSize: 13, fontWeight: selected ? '700' : '500' }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function SquadScreen() {
  const navigation = useNavigation<Nav>();
  const activeClubId = useClubStore((s) => s.activeClubId);
  const uid = useAuthStore((s) => s.user?.uid);
  const theme = useThemeStore((s) => s.theme);
  const queryClient = useQueryClient();

  const { data: squad, isLoading, refetch } = useQuery({
    queryKey: ['clubSquad', activeClubId],
    queryFn: () => getClubSquad(activeClubId!),
    enabled: !!activeClubId,
  });

  const { data: me } = useQuery({
    queryKey: ['clubMember', activeClubId, uid],
    queryFn: () => getClubMember(activeClubId!, uid!),
    enabled: !!activeClubId && !!uid,
  });
  const isAdmin = me?.role === 'admin';

  const [modalVisible, setModalVisible] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [battingHand, setBattingHand] = useState<BattingHand | null>(null);
  const [bowlingStyle, setBowlingStyle] = useState<BowlingStyle | null>(null);
  const [keepingAbility, setKeepingAbility] = useState<WicketKeepingAbility | null>(null);
  const [saving, setSaving] = useState(false);

  function openModal() {
    setDisplayName('');
    setBattingHand(null);
    setBowlingStyle(null);
    setKeepingAbility(null);
    setModalVisible(true);
  }

  async function handleCreate() {
    const name = displayName.trim();
    if (!name || !activeClubId) return;
    setSaving(true);
    try {
      await createGhostPlayer(activeClubId, name, {
        battingHand: battingHand ?? undefined,
        bowlingStyle: bowlingStyle ?? undefined,
        wicketKeeping: keepingAbility ?? undefined,
      });
      setModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['clubSquad', activeClubId] });
    } catch {
      Alert.alert('Error', 'Failed to create player. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!activeClubId) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 20, marginBottom: 8 }}>No club selected</Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center' }}>
          Go to Home and tap a club to view its squad.
        </Text>
      </View>
    );
  }

  const inputStyle = {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    padding: 12,
    color: theme.text,
    fontSize: 15,
    marginBottom: 16,
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '700', marginBottom: 16 }}>
        Squad{squad ? ` · ${squad.length}` : ''}
      </Text>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : squad && squad.length > 0 ? (
        <FlatList
          data={[...squad].sort((a, b) => a.player.displayName.localeCompare(b.player.displayName))}
          keyExtractor={(item) => item.player.id}
          renderItem={({ item }) => (
            <SquadRow
              entry={item}
              onPress={() =>
                navigation.navigate('PlayerProfile', { clubId: activeClubId, playerId: item.player.id })
              }
            />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: theme.textMuted, fontSize: 16, textAlign: 'center' }}>
            No players yet.
          </Text>
        </View>
      )}

      {isAdmin && (
        <TouchableOpacity
          onPress={openModal}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 4,
            elevation: 5,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32, fontWeight: '300' }}>+</Text>
        </TouchableOpacity>
      )}

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          onPress={() => setModalVisible(false)}
        >
          <Pressable>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  padding: 24,
                  paddingBottom: Platform.OS === 'ios' ? 40 : 24,
                  borderTopWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700', marginBottom: 20 }}>
                  Add Ghost Player
                </Text>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>
                    PLAYER NAME *
                  </Text>
                  <TextInput
                    value={displayName}
                    onChangeText={setDisplayName}
                    placeholder="Full name"
                    placeholderTextColor={theme.textMuted}
                    autoFocus
                    style={inputStyle}
                  />

                  <ChipSelector
                    label="BATTING HAND"
                    options={[
                      { value: 'RHB', label: 'Right hand' },
                      { value: 'LHB', label: 'Left hand' },
                    ]}
                    value={battingHand}
                    onChange={(v) => setBattingHand(v as BattingHand | null)}
                    theme={theme}
                  />

                  <ChipSelector
                    label="BOWLING STYLE"
                    options={[
                      { value: 'fast', label: 'Fast' },
                      { value: 'medium', label: 'Medium' },
                      { value: 'spin', label: 'Spin' },
                    ]}
                    value={bowlingStyle}
                    onChange={(v) => setBowlingStyle(v as BowlingStyle | null)}
                    theme={theme}
                  />

                  <ChipSelector
                    label="WICKET KEEPING"
                    options={[
                      { value: 'keeper', label: 'Keeper' },
                      { value: 'can-keep', label: 'Can keep' },
                    ]}
                    value={keepingAbility}
                    onChange={(v) => setKeepingAbility(v as WicketKeepingAbility | null)}
                    theme={theme}
                  />

                  <TouchableOpacity
                    onPress={handleCreate}
                    disabled={!displayName.trim() || saving}
                    style={{
                      backgroundColor: displayName.trim() ? theme.accent : theme.border,
                      borderRadius: 12,
                      padding: 14,
                      alignItems: 'center',
                      marginTop: 4,
                    }}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Create Player</Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
