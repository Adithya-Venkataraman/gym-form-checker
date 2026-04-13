// src/screens/ResultsScreen.tsx
// Post-workout results dashboard: form score, reps, mistakes, suggestions

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

interface Mistake {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  timestamp_seconds?: number[];
}

const SEVERITY_COLORS = {
  high: { bg: '#2A1414', text: '#EF4444', label: 'Critical' },
  medium: { bg: '#2A2214', text: '#F59E0B', label: 'Moderate' },
  low: { bg: '#14211A', text: '#22C55E', label: 'Minor' },
};

function FormScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';
  const label = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Needs Work' : 'Poor';

  return (
    <View style={ringStyles.container}>
      <View style={[ringStyles.ring, { borderColor: color }]}>
        <Text style={[ringStyles.score, { color }]}>{score}</Text>
        <Text style={ringStyles.outOf}>/100</Text>
      </View>
      <Text style={[ringStyles.label, { color }]}>{label}</Text>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 8 },
  ring: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E1E2E' },
  score: { fontSize: 36, fontWeight: '700' },
  outOf: { color: '#6B7280', fontSize: 13 },
  label: { fontSize: 16, fontWeight: '600' },
});

export default function ResultsScreen() {
  const params = useLocalSearchParams<{
    exercise: string;
    reps: string;
    formScore: string;
    duration: string;
    source: string;
    mistakesJson?: string;
    suggestionsJson?: string;
  }>();

  const insets = useSafeAreaInsets();
  const router = useRouter();

  const exercise = params.exercise ?? 'Unknown';
  const reps = parseInt(params.reps ?? '0');
  const formScore = parseInt(params.formScore ?? '0');
  const duration = parseInt(params.duration ?? '0');
  const source = params.source ?? 'live';

  let mistakes: Mistake[] = [];
  let suggestions: string[] = [];

  try {
    if (params.mistakesJson) mistakes = JSON.parse(params.mistakesJson);
    if (params.suggestionsJson) suggestions = JSON.parse(params.suggestionsJson);
  } catch {}

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}m ${s % 60}s`;

  const exerciseName = exercise.charAt(0).toUpperCase() + exercise.slice(1).replace(/_/g, ' ');

  const handleShare = async () => {
    await Share.share({
      message: `I just did ${reps} ${exerciseName} reps with a form score of ${formScore}/100! 💪 #GymFormChecker`,
    });
  };

  // Group mistakes by type, keep most severe
  const uniqueMistakes = Object.values(
    mistakes.reduce((acc, m) => {
      if (!acc[m.type] || SEVERITY_COLORS[acc[m.type].severity] < SEVERITY_COLORS[m.severity]) {
        acc[m.type] = m;
      }
      return acc;
    }, {} as Record<string, Mistake>)
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/')} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Workout Results</Text>
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Ionicons name="share-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Exercise + source badge */}
        <View style={styles.exerciseBadge}>
          <Text style={styles.exerciseName}>{exerciseName}</Text>
          <View style={[styles.badge, source === 'upload' ? styles.badgeUpload : styles.badgeLive]}>
            <Ionicons name={source === 'upload' ? 'cloud-done' : 'camera'} size={12} color="#fff" />
            <Text style={styles.badgeText}>{source === 'upload' ? 'Video Analysis' : 'Live Session'}</Text>
          </View>
        </View>

        {/* Form score */}
        <View style={styles.scoreSection}>
          <FormScoreRing score={formScore} />
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{reps}</Text>
            <Text style={styles.statLabel}>Reps</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{formatTime(duration)}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{reps > 0 ? Math.round(duration / reps) : '-'}s</Text>
            <Text style={styles.statLabel}>Avg Rep</Text>
          </View>
        </View>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Suggestions</Text>
            {suggestions.map((s, i) => (
              <View key={i} style={styles.suggestionRow}>
                <Ionicons name="bulb-outline" size={18} color="#6366F1" />
                <Text style={styles.suggestionText}>{s}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Mistakes */}
        {uniqueMistakes.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Form Issues ({uniqueMistakes.length})
            </Text>
            {uniqueMistakes.map((m, i) => {
              const colors = SEVERITY_COLORS[m.severity];
              return (
                <View key={i} style={[styles.mistakeCard, { backgroundColor: colors.bg }]}>
                  <View style={styles.mistakeHeader}>
                    <View style={[styles.severityBadge, { backgroundColor: colors.text + '22' }]}>
                      <Text style={[styles.severityLabel, { color: colors.text }]}>
                        {colors.label}
                      </Text>
                    </View>
                    <Text style={styles.mistakeJoint}>
                      {m.type.replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Text style={styles.mistakeDescription}>{m.description}</Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.perfectBox}>
            <Ionicons name="checkmark-circle" size={48} color="#22C55E" />
            <Text style={styles.perfectTitle}>Perfect Form!</Text>
            <Text style={styles.perfectSubtext}>No form issues detected. Great work!</Text>
          </View>
        )}

        {/* CTA buttons */}
        <View style={styles.ctaRow}>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.replace('/')}
          >
            <Ionicons name="camera" size={20} color="#6366F1" />
            <Text style={styles.ctaBtnText}>New Workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push('/history')}
          >
            <Ionicons name="time-outline" size={20} color="#6366F1" />
            <Text style={styles.ctaBtnText}>History</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F12' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  shareBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },

  exerciseBadge: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  exerciseName: { color: '#fff', fontSize: 26, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeLive: { backgroundColor: '#6366F1' },
  badgeUpload: { backgroundColor: '#0EA5E9' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  scoreSection: { alignItems: 'center', paddingVertical: 24 },

  statsRow: { flexDirection: 'row', marginHorizontal: 16, gap: 10, marginBottom: 24 },
  statCard: { flex: 1, backgroundColor: '#1E1E2E', borderRadius: 12, padding: 16, alignItems: 'center', gap: 4 },
  statValue: { color: '#fff', fontSize: 22, fontWeight: '700' },
  statLabel: { color: '#6B7280', fontSize: 12 },

  section: { marginHorizontal: 16, marginBottom: 24 },
  sectionTitle: { color: '#E5E7EB', fontSize: 17, fontWeight: '600', marginBottom: 12 },

  suggestionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  suggestionText: { color: '#D1D5DB', fontSize: 14, flex: 1, lineHeight: 20 },

  mistakeCard: { borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  mistakeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  severityBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  severityLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  mistakeJoint: { color: '#D1D5DB', fontSize: 13, fontWeight: '500', textTransform: 'capitalize' },
  mistakeDescription: { color: '#9CA3AF', fontSize: 13, lineHeight: 18 },

  perfectBox: { alignItems: 'center', gap: 8, padding: 32 },
  perfectTitle: { color: '#22C55E', fontSize: 24, fontWeight: '700' },
  perfectSubtext: { color: '#9CA3AF', fontSize: 14 },

  ctaRow: { flexDirection: 'row', marginHorizontal: 16, gap: 12 },
  ctaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#1E1E2E', borderRadius: 12, paddingVertical: 14, borderWidth: 1, borderColor: '#374151' },
  ctaBtnText: { color: '#6366F1', fontWeight: '600', fontSize: 15 },
});