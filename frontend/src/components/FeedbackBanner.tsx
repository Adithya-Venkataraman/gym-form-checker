// src/components/FeedbackBanner.tsx
// Animated banner showing real-time form feedback text

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  message?: string | null;
  severity?: 'low' | 'medium' | 'high' | 'safety';
}

const SEVERITY_STYLES = {
  low: { bg: 'rgba(34,197,94,0.85)', icon: 'checkmark-circle', color: '#fff' },
  medium: { bg: 'rgba(245,158,11,0.9)', icon: 'warning', color: '#fff' },
  high: { bg: 'rgba(239,68,68,0.92)', icon: 'alert-circle', color: '#fff' },
  safety: { bg: 'rgba(220,38,38,0.95)', icon: 'shield', color: '#fff' },
};

export default function FeedbackBanner({ message, severity = 'medium' }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const [displayed, setDisplayed] = useState<string | null>(null);
  const [displayedSeverity, setDisplayedSeverity] = useState(severity);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (message) {
      setDisplayed(message);
      setDisplayedSeverity(severity);

      // Animate in
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 80 }),
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 80 }),
      ]).start();

      // Auto-hide after 3s
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -20, duration: 400, useNativeDriver: true }),
        ]).start(() => setDisplayed(null));
      }, 3000);
    }

    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [message]);

  if (!displayed) return null;

  const style = SEVERITY_STYLES[displayedSeverity];

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: style.bg, opacity, transform: [{ translateY }] },
      ]}
    >
      <Ionicons name={style.icon as any} size={18} color={style.color} />
      <Text style={[styles.text, { color: style.color }]}>{displayed}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 180,
    left: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    lineHeight: 20,
  },
});