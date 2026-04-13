// src/components/BodyGuidance.tsx
// Shows camera positioning guidance when body isn't fully visible

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  message: string;
}

export default function BodyGuidance({ message }: Props) {
  return (
    <View style={styles.container}>
      <Ionicons name="body-outline" size={20} color="#F59E0B" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.5)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: {
    color: '#FCD34D',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
});