// src/components/RepCounter.tsx
// Animated rep counter overlay for live camera screen

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface Props {
  count: number;
  phase?: string;
}

export default function RepCounter({ count, phase }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const prevCount = useRef(count);

  useEffect(() => {
    if (count !== prevCount.current) {
      prevCount.current = count;
      Animated.sequence([
        Animated.spring(scale, { toValue: 1.35, useNativeDriver: true, tension: 200 }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120 }),
      ]).start();
    }
  }, [count]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>REPS</Text>
      <Animated.Text style={[styles.count, { transform: [{ scale }] }]}>
        {count}
      </Animated.Text>
      {phase && phase !== 'idle' && (
        <View style={[styles.phasePill, { backgroundColor: phaseColor(phase) }]}>
          <Text style={styles.phaseText}>{phase.replace('_', ' ')}</Text>
        </View>
      )}
    </View>
  );
}

function phaseColor(phase: string): string {
  switch (phase) {
    case 'bottom': return '#6366F1';
    case 'top': return '#22C55E';
    case 'going_down': return '#F59E0B';
    case 'going_up': return '#0EA5E9';
    default: return '#374151';
  }
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 120,
    left: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    minWidth: 72,
  },
  label: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  count: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 48,
  },
  phasePill: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  phaseText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
});