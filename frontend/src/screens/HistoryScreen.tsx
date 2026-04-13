// src/screens/HistoryScreen.tsx
// Workout history with stats, progress trends, and per-session detail

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { workoutStorage, LocalWorkout, WorkoutStats } from '../services/workoutStorage';

function StatCard({ label, value, icon, color = '#6366F1' }: {
  label: string; value: string; icon: string; color?: string;
}) {
  return (
    <View style={statStyles.card}>
      <Ionicons name={icon as any} size={22} color={color} />
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#1E1E2E', borderRadius: 12, padding: 14, alignItems: 'center', gap: 6, minWidth: 80 },
  value: { color: '#fff', fontSize: 18, fontWeight: '700' },
  label: { color: '#6B7280', fontSize: 11, textAlign: 'center' },
});

function WorkoutRow({ workout }: { workout: LocalWorkout }) {
  const date = new Date(workout.created_at);
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const scoreColor = workout.form_score >= 80 ? '#22C55E' : workout.form_score >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <View style={rowStyles.container}>
      <View style={rowStyles.left}>
        <Text style={rowStyles.exercise}>
          {workout.exercise.charAt(0).toUpperCase() + workout.exercise.slice(1)}
        </Text>
        <Text style={rowStyles.meta}>
          {dateStr} · {timeStr} · {Math.round(workout.duration_seconds / 60)}min
        </Text>
      </View>
      <View style={rowStyles.right}>
        <Text style={[rowStyles.score, { color: scoreColor }]}>{Math.round(workout.form_score)}</Text>
        <Text style={rowStyles.scoreLabel}>score</Text>
      </View>
      <View style={rowStyles.right}>
        <Text style={rowStyles.reps}>{workout.rep_count}</Text>
        <Text style={rowStyles.scoreLabel}>reps</Text>
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E2E', borderRadius: 12, padding: 14, marginBottom: 8 },
  left: { flex: 1 },
  exercise: { color: '#E5E7EB', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  meta: { color: '#6B7280', fontSize: 12 },
  right: { alignItems: 'center', marginLeft: 16, minWidth: 44 },
  score: { fontSize: 20, fontWeight: '700' },
  reps: { fontSize: 20, fontWeight: '700', color: '#fff' },
  scoreLabel: { color: '#6B7280', fontSize: 10 },
});

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [workouts, setWorkouts] = useState<LocalWorkout[]>([]);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [ws, st] = await Promise.all([
      workoutStorage.getWorkouts(50),
      workoutStorage.getStats(),
    ]);
    setWorkouts(ws);
    setStats(st);
  }, []);

  // Reload when screen comes into focus
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>History</Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
      >

        {/* Stats */}
        {stats && stats.totalWorkouts > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All-time Stats</Text>
            <View style={styles.statsGrid}>
              <StatCard label="Workouts" value={String(stats.totalWorkouts)} icon="barbell-outline" />
              <StatCard label="Total Reps" value={String(stats.totalReps)} icon="repeat-outline" />
              <StatCard label="Avg Score" value={`${stats.avgFormScore}`} icon="star-outline" color="#F59E0B" />
              <StatCard label="Best Score" value={`${stats.bestFormScore}`} icon="trophy-outline" color="#22C55E" />
            </View>

            {stats.recentImprovement !== 0 && (
              <View style={[styles.improvementBanner,
                { backgroundColor: stats.recentImprovement >= 0 ? '#0D1F12' : '#1F0D0D' }]}>
                <Ionicons
                  name={stats.recentImprovement >= 0 ? 'trending-up' : 'trending-down'}
                  size={20}
                  color={stats.recentImprovement >= 0 ? '#22C55E' : '#EF4444'}
                />
                <Text style={[styles.improvementText,
                  { color: stats.recentImprovement >= 0 ? '#22C55E' : '#EF4444' }]}>
                  {Math.abs(stats.recentImprovement)}% {stats.recentImprovement >= 0 ? 'improvement' : 'decline'} in recent sessions
                </Text>
              </View>
            )}

            <Text style={styles.favoriteText}>
              Most frequent: <Text style={{ color: '#6366F1' }}>{stats.mostFrequentExercise}</Text>
            </Text>
          </View>
        )}

        {/* Workout list */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Recent Sessions ({workouts.length})
          </Text>

          {workouts.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="barbell-outline" size={48} color="#374151" />
              <Text style={styles.emptyTitle}>No workouts yet</Text>
              <Text style={styles.emptySubtext}>
                Start a live session or upload a video to see your history here.
              </Text>
            </View>
          ) : (
            workouts.map((w, i) => <WorkoutRow key={w.id ?? i} workout={w} />)
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F12' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', paddingHorizontal: 20, paddingTop: 16, marginBottom: 4 },
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '600', marginBottom: 12, marginTop: 16 },
  statsGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  improvementBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, marginBottom: 10 },
  improvementText: { fontSize: 13, fontWeight: '500', flex: 1 },
  favoriteText: { color: '#9CA3AF', fontSize: 13 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  emptyTitle: { color: '#6B7280', fontSize: 18, fontWeight: '600' },
  emptySubtext: { color: '#4B5563', fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 18 },
});