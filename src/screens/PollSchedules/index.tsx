import { useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Switch, Alert } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { useAuthStore } from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import { getClubMember } from '../../services/clubService';
import { getPollSchedules, setPollScheduleEnabled, deletePollSchedule } from '../../services/pollScheduleService';
import { formatDayOfWeek, formatTime } from '../../components/TimePicker';
import type { PollSchedule } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'PollSchedules'>;

function summaryFor(schedule: PollSchedule): string {
  const fires = `Fires ${formatDayOfWeek(schedule.createDayOfWeek)}s`;
  const events = schedule.eventDaysOfWeek.map(formatDayOfWeek).join(' & ');
  return `${fires} · asks about ${events} ${formatTime(schedule.eventHour, schedule.eventMinute)}`;
}

function ScheduleCard({
  schedule,
  onEdit,
  onToggle,
  onDelete,
}: {
  schedule: PollSchedule;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
}) {
  const theme = useThemeStore((s) => s.theme);
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: theme.border,
        opacity: schedule.enabled ? 1 : 0.6,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <TouchableOpacity onPress={onEdit} style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{schedule.question}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>
            {schedule.template === 'multiDate' ? 'Multiple dates' : 'Yes / No'}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 4 }}>{summaryFor(schedule)}</Text>
        </TouchableOpacity>
        <View
          style={{
            backgroundColor: schedule.enabled ? 'rgba(22,163,74,0.1)' : 'rgba(100,116,139,0.15)',
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: schedule.enabled ? '#16a34a' : '#64748b',
          }}
        >
          <Text style={{ color: schedule.enabled ? '#16a34a' : '#64748b', fontSize: 11, fontWeight: '700' }}>
            {schedule.enabled ? 'Active' : 'Disabled'}
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>Enabled</Text>
          <Switch
            value={schedule.enabled}
            onValueChange={onToggle}
            trackColor={{ false: theme.border, true: theme.accentDim }}
            thumbColor={schedule.enabled ? theme.accent : theme.textMuted}
          />
        </View>
        <TouchableOpacity onPress={onDelete} hitSlop={8}>
          <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '700' }}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PollSchedulesScreen() {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Route>();
  const { clubId } = params;
  const user = useAuthStore((s) => s.user);
  const theme = useThemeStore((s) => s.theme);
  const queryClient = useQueryClient();

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ['clubMember', clubId, user?.uid],
    queryFn: () => getClubMember(clubId, user!.uid),
    enabled: !!clubId && !!user,
  });
  const isAdmin = member?.role === 'admin';

  const { data: schedules, isLoading, refetch } = useQuery({
    queryKey: ['pollSchedules', clubId],
    queryFn: () => getPollSchedules(clubId),
    enabled: !!clubId && isAdmin,
  });

  useFocusEffect(
    useCallback(() => {
      if (isAdmin) refetch();
    }, [isAdmin, refetch]),
  );

  const handleToggle = async (scheduleId: string, enabled: boolean) => {
    queryClient.setQueryData<PollSchedule[]>(['pollSchedules', clubId], (prev) =>
      prev?.map((s) => (s.id === scheduleId ? { ...s, enabled } : s)),
    );
    await setPollScheduleEnabled(clubId, scheduleId, enabled);
  };

  const handleDelete = (scheduleId: string) => {
    Alert.alert('Delete schedule?', 'Polls already created by this schedule are not affected.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          queryClient.setQueryData<PollSchedule[]>(['pollSchedules', clubId], (prev) =>
            prev?.filter((s) => s.id !== scheduleId),
          );
          await deletePollSchedule(clubId, scheduleId);
        },
      },
    ]);
  };

  if (memberLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: 'center' }}>
          Only club admins can manage recurring polls.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>Recurring Polls</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('EditPollSchedule', { clubId })}
          style={{ backgroundColor: theme.accent, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 }}
        >
          <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>+ New Schedule</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : schedules && schedules.length > 0 ? (
        <FlatList
          data={schedules}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ScheduleCard
              schedule={item}
              onEdit={() => navigation.navigate('EditPollSchedule', { clubId, scheduleId: item.id })}
              onToggle={(enabled) => handleToggle(item.id, enabled)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          onRefresh={refetch}
          refreshing={isLoading}
        />
      ) : (
        <View style={{ alignItems: 'center', marginTop: 60 }}>
          <Text style={{ color: theme.textMuted, fontSize: 16, textAlign: 'center' }}>
            No recurring polls yet.{'\n'}Set one up to auto-create a poll every week.
          </Text>
        </View>
      )}
    </View>
  );
}
