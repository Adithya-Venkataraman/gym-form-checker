// src/screens/SettingsScreen.tsx
// User preferences: calibration, difficulty, voice, API URL

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, Switch, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCalibration } from '../hooks/useCalibration';
import { workoutStorage } from '../services/workoutStorage';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { calibration, updateCalibration, resetCalibration } = useCalibration();

  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [heightInput, setHeightInput] = useState(String(calibration.heightCm));
  const [apiUrl, setApiUrl] = useState(
    process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
  );

  const handleHeightSave = () => {
    const cm = parseInt(heightInput);
    if (isNaN(cm) || cm < 100 || cm > 250) {
      Alert.alert('Invalid height', 'Please enter a height between 100 and 250 cm.');
      return;
    }
    updateCalibration({ heightCm: cm });
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Workout History',
      'This will permanently delete all saved workouts. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            await workoutStorage.clearAll();
            Alert.alert('Done', 'Workout history cleared.');
          },
        },
      ]
    );
  };

  const LimbRatioSlider = ({ label, value, field }: {
    label: string;
    value: number;
    field: 'femurRatio' | 'torsoRatio' | 'armRatio';
  }) => {
    const options = [
      { label: 'Short', value: 0.85 },
      { label: 'Average', value: 1.0 },
      { label: 'Long', value: 1.15 },
    ];
    return (
      <View style={styles.ratioRow}>
        <Text style={styles.ratioLabel}>{label}</Text>
        <View style={styles.ratioOptions}>
          {options.map(opt => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.ratioBtn,
                Math.abs(value - opt.value) < 0.05 && styles.ratioBtnActive,
              ]}
              onPress={() => updateCalibration({ [field]: opt.value } as any)}
            >
              <Text style={[
                styles.ratioBtnText,
                Math.abs(value - opt.value) < 0.05 && styles.ratioBtnTextActive,
              ]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Settings</Text>

      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Difficulty */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Difficulty</Text>
          <Text style={styles.sectionHint}>
            Affects how strictly your form is evaluated
          </Text>
          <View style={styles.diffRow}>
            {(['beginner', 'intermediate', 'advanced'] as const).map(d => (
              <TouchableOpacity
                key={d}
                style={[styles.diffBtn, calibration.difficulty === d && styles.diffBtnActive]}
                onPress={() => updateCalibration({ difficulty: d })}
              >
                <Text style={[styles.diffText, calibration.difficulty === d && styles.diffTextActive]}>
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Body Calibration */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Body Calibration</Text>
          <Text style={styles.sectionHint}>
            Personalizes angle thresholds for your body proportions
          </Text>

          <View style={styles.heightRow}>
            <Text style={styles.fieldLabel}>Height (cm)</Text>
            <View style={styles.heightInput}>
              <TextInput
                style={styles.input}
                value={heightInput}
                onChangeText={setHeightInput}
                onBlur={handleHeightSave}
                keyboardType="number-pad"
                maxLength={3}
                placeholderTextColor="#6B7280"
              />
              <Text style={styles.inputUnit}>cm</Text>
            </View>
          </View>

          <LimbRatioSlider label="Femur length" value={calibration.femurRatio} field="femurRatio" />
          <LimbRatioSlider label="Torso length" value={calibration.torsoRatio} field="torsoRatio" />
          <LimbRatioSlider label="Arm length" value={calibration.armRatio} field="armRatio" />

          {/* Show computed adjustments */}
          <View style={styles.adjustmentsBox}>
            <Text style={styles.adjustmentsTitle}>Active adjustments</Text>
            {Object.entries(calibration.angleAdjustments).map(([key, val]) => (
              val !== 0 && (
                <Text key={key} style={styles.adjustmentRow}>
                  {key.replace(/_/g, ' ')}: {val > 0 ? '+' : ''}{val}°
                </Text>
              )
            ))}
            {Object.values(calibration.angleAdjustments).every(v => v === 0) && (
              <Text style={styles.adjustmentRow}>No adjustments (average proportions)</Text>
            )}
          </View>

          <TouchableOpacity style={styles.resetBtn} onPress={resetCalibration}>
            <Text style={styles.resetBtnText}>Reset to defaults</Text>
          </TouchableOpacity>
        </View>

        {/* Feedback */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Feedback</Text>
          <View style={styles.toggleRow}>
            <View>
              <Text style={styles.fieldLabel}>Voice feedback</Text>
              <Text style={styles.fieldHint}>Read out form cues during workout</Text>
            </View>
            <Switch
              value={voiceEnabled}
              onValueChange={setVoiceEnabled}
              trackColor={{ false: '#374151', true: '#6366F1' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Backend */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backend URL</Text>
          <Text style={styles.sectionHint}>
            Required only for video upload analysis
          </Text>
          <TextInput
            style={[styles.input, styles.urlInput]}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder="https://your-api.onrender.com"
            placeholderTextColor="#6B7280"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>

        {/* Danger zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <TouchableOpacity style={styles.dangerBtn} onPress={handleClearHistory}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.dangerBtnText}>Clear Workout History</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F12' },
  title: { color: '#fff', fontSize: 28, fontWeight: '700', paddingHorizontal: 20, paddingTop: 16, marginBottom: 8 },
  section: { marginHorizontal: 16, marginBottom: 28 },
  sectionTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '600', marginBottom: 4, marginTop: 16 },
  sectionHint: { color: '#6B7280', fontSize: 12, marginBottom: 14, lineHeight: 16 },
  diffRow: { flexDirection: 'row', gap: 10 },
  diffBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#374151', alignItems: 'center', backgroundColor: '#1E1E2E' },
  diffBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  diffText: { color: '#9CA3AF', fontSize: 13, fontWeight: '500' },
  diffTextActive: { color: '#fff', fontWeight: '700' },
  heightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heightInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E2E', borderRadius: 10, borderWidth: 1, borderColor: '#374151', paddingHorizontal: 12 },
  input: { color: '#fff', fontSize: 16, paddingVertical: 10, minWidth: 60, textAlign: 'center' },
  inputUnit: { color: '#6B7280', fontSize: 14, marginLeft: 4 },
  fieldLabel: { color: '#D1D5DB', fontSize: 14, fontWeight: '500' },
  fieldHint: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  ratioRow: { marginBottom: 14 },
  ratioLabel: { color: '#9CA3AF', fontSize: 13, marginBottom: 8 },
  ratioOptions: { flexDirection: 'row', gap: 8 },
  ratioBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#374151', alignItems: 'center', backgroundColor: '#1E1E2E' },
  ratioBtnActive: { backgroundColor: '#4338CA', borderColor: '#6366F1' },
  ratioBtnText: { color: '#9CA3AF', fontSize: 12 },
  ratioBtnTextActive: { color: '#fff', fontWeight: '600' },
  adjustmentsBox: { backgroundColor: '#1E1E2E', borderRadius: 10, padding: 12, marginTop: 8, marginBottom: 12 },
  adjustmentsTitle: { color: '#9CA3AF', fontSize: 12, marginBottom: 6 },
  adjustmentRow: { color: '#6B7280', fontSize: 12, lineHeight: 20 },
  resetBtn: { alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#374151' },
  resetBtnText: { color: '#9CA3AF', fontSize: 13 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1E1E2E', borderRadius: 12, padding: 16 },
  urlInput: { backgroundColor: '#1E1E2E', borderRadius: 10, borderWidth: 1, borderColor: '#374151', paddingHorizontal: 14, paddingVertical: 12, minWidth: '100%', fontSize: 13 },
  dangerBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#7F1D1D', backgroundColor: '#1A0A0A', padding: 14, borderRadius: 12 },
  dangerBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});