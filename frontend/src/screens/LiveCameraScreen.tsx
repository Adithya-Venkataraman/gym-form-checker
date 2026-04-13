// src/screens/LiveCameraScreen.tsx
// Main workout screen: live camera + pose detection + real-time feedback

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Dimensions, StatusBar,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import SkeletonOverlay from '../components/SkeletonOverlay';
import FeedbackBanner from '../components/FeedbackBanner';
import RepCounter from '../components/RepCounter';
import BodyGuidance from '../components/BodyGuidance';

import { usePoseDetection } from '../hooks/usePoseDetection';
import { useRepCounter } from '../hooks/useRepCounter';
import { useFormAnalysis } from '../hooks/useFormAnalysis';
import { useAutoExerciseDetection } from '../hooks/useAutoExerciseDetection';

import { voiceFeedback } from '../services/voiceFeedback';
import { workoutStorage } from '../services/workoutStorage';
import { EXERCISES, Difficulty, ExerciseConfig } from '../config/exercises';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type WorkoutState = 'idle' | 'detecting' | 'active' | 'paused';

export default function LiveCameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [workoutState, setWorkoutState] = useState<WorkoutState>('idle');
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate');
  const [currentExercise, setCurrentExercise] = useState<ExerciseConfig | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionMistakes, setSessionMistakes] = useState<any[]>([]);
  const [totalReps, setTotalReps] = useState(0);
  const [formScores, setFormScores] = useState<number[]>([]);

  // Hooks
  const { state: poseState, processFrame } = usePoseDetection({
    skipFrames: 1, // we control timing via interval now
    smoothing: 0.65,
    minConfidence: 0.3,
  });

  const { result: autoDetection, processFrame: detectExercise, reset: resetDetection } =
    useAutoExerciseDetection();

  const { processKeypoints, reset: resetReps } = useRepCounter(
    currentExercise?.repLogic ?? null
  );

  const { analyze } = useFormAnalysis(currentExercise, difficulty);

  const lastRepCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  // Session timer
  useEffect(() => {
    if (workoutState === 'active') {
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsedSeconds(elapsedRef.current);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [workoutState]);

  // Auto-detect exercise when in 'detecting' state
  useEffect(() => {
    if (workoutState === 'detecting' && autoDetection.detectedExercise) {
      setCurrentExercise(autoDetection.detectedExercise);
      setWorkoutState('active');
      voiceFeedback.speak(
        `${autoDetection.detectedExercise.name} detected. Let's go!`,
        'form'
      );
    }
  }, [autoDetection, workoutState]);

  // Process keypoints when they update
  useEffect(() => {
    const { keypoints } = poseState;
    if (!keypoints) return;

    if (workoutState === 'detecting') {
      detectExercise(keypoints);
      return;
    }

    if (workoutState !== 'active') return;

    // Count reps
    const repResult = processKeypoints(keypoints);
    if (repResult.count !== lastRepCount.current) {
      lastRepCount.current = repResult.count;
      setTotalReps(repResult.count);

      if (repResult.isRepComplete && voiceEnabled) {
        voiceFeedback.announceRep(repResult.count);
      }

      if (repResult.count > 0 && repResult.count % 5 === 0) {
        const msgs = currentExercise?.feedbackMessages.encouragement ?? ['Keep going!'];
        voiceFeedback.encouragement(msgs[Math.floor(Math.random() * msgs.length)]);
      }
    }

    // Analyze form
    const formResult = analyze(keypoints, repResult.phase);
    setFormScores(prev => [...prev.slice(-20), formResult.formScore]);

    if (formResult.feedback && voiceEnabled) {
      voiceFeedback.formFeedback(formResult.feedback);
    }
    if (formResult.safetyAlert && voiceEnabled) {
      voiceFeedback.safetyAlert(formResult.safetyAlert);
    }

    if (formResult.violations.length > 0) {
      setSessionMistakes(prev => [
        ...prev,
        ...formResult.violations.map(v => ({
          type: v.joint,
          severity: v.severity,
          description: v.feedback,
          frames: [],
          timestamp_seconds: [elapsedRef.current],
        })),
      ]);
    }
  }, [poseState.keypoints]);

  // Capture frames at ~5fps and send to backend
  const startCapturing = useCallback(() => {
    if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);

    captureIntervalRef.current = setInterval(async () => {
      if (!cameraRef.current) return;
      try {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.3,      // low quality = faster upload
          skipProcessing: true,
        });
        if (photo?.base64) {
          await processFrame(photo.base64);
        }
      } catch {
        // Camera might not be ready yet, ignore
      }
    }, 200); // 5fps — enough for form analysis
  }, [processFrame]);

  const stopCapturing = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
  }, []);

  const startWorkout = useCallback(() => {
    resetDetection();
    resetReps();
    setTotalReps(0);
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    setSessionMistakes([]);
    setFormScores([]);
    setCurrentExercise(null);
    lastRepCount.current = 0;
    setWorkoutState('detecting');
    startCapturing();
    voiceFeedback.speak('Start exercising to auto-detect your workout', 'form');
  }, [resetDetection, resetReps, startCapturing]);

  const stopWorkout = useCallback(async () => {
    stopCapturing();

    if (workoutState !== 'active') {
      setWorkoutState('idle');
      return;
    }

    setWorkoutState('idle');
    voiceFeedback.stop();

    const avgFormScore = formScores.length > 0
      ? Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length)
      : 0;

    if (currentExercise && totalReps > 0) {
      await workoutStorage.saveWorkout({
        exercise: currentExercise.id,
        rep_count: totalReps,
        form_score: avgFormScore,
        duration_seconds: elapsedRef.current,
        mistakes: sessionMistakes.slice(0, 20),
        created_at: new Date().toISOString(),
        synced: false,
      });

      router.push({
        pathname: '/results',
        params: {
          exercise: currentExercise.id,
          reps: totalReps,
          formScore: avgFormScore,
          duration: elapsedRef.current,
          source: 'live',
        },
      });
    }
  }, [workoutState, currentExercise, totalReps, formScores,
    sessionMistakes, router, stopCapturing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopCapturing();
  }, []);

  if (!permission) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Checking permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={64} color="#666" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionSubtext}>
          Gym Form Checker needs your camera to analyze exercise form in real time.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const avgScore = formScores.length > 0
    ? Math.round(formScores.reduce((a, b) => a + b, 0) / formScores.length)
    : 100;

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="front"
      />

      {/* Skeleton overlay */}
      {poseState.keypoints && (
        <SkeletonOverlay
          keypoints={poseState.keypoints}
          coloredJoints={undefined}
          frameWidth={640}
          frameHeight={480}
          canvasWidth={SCREEN_W}
          canvasHeight={SCREEN_H}
        />
      )}

      {/* Top HUD */}
      <View style={[styles.topHud, { paddingTop: insets.top + 8 }]}>
        <View style={styles.hudPill}>
          <View style={[styles.dot, {
            backgroundColor: poseState.isModelLoaded ? '#22C55E' : '#F59E0B'
          }]} />
          <Text style={styles.hudText}>
            {poseState.isModelLoaded ? `${poseState.fps} fps` : 'Connecting...'}
          </Text>
        </View>

        {currentExercise && (
          <View style={styles.hudPill}>
            <Text style={styles.hudText}>{currentExercise.name}</Text>
          </View>
        )}
        {workoutState === 'detecting' && (
          <View style={styles.hudPill}>
            <Text style={styles.hudText}>🔍 Detecting exercise...</Text>
          </View>
        )}
        {workoutState === 'active' && (
          <View style={styles.hudPill}>
            <Text style={styles.hudText}>{formatTime(elapsedSeconds)}</Text>
          </View>
        )}
      </View>

      {/* Error banner */}
      {poseState.error && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={16} color="#FFF" />
          <Text style={styles.errorText}>{poseState.error}</Text>
        </View>
      )}

      {/* Body visibility guidance */}
      {!poseState.bodyVisibility.isFullBody && poseState.bodyVisibility.guidance && (
        <BodyGuidance message={poseState.bodyVisibility.guidance} />
      )}

      {/* Camera view hint */}
      {poseState.cameraView.view === 'front' && currentExercise?.preferredView === 'side' && (
        <View style={styles.viewHint}>
          <Ionicons name="information-circle-outline" size={16} color="#F59E0B" />
          <Text style={styles.viewHintText}>
            {currentExercise.viewWarning ?? 'Side view recommended'}
          </Text>
        </View>
      )}

      {/* Form score */}
      {workoutState === 'active' && (
        <View style={styles.scoreBox}>
          <Text style={styles.scoreLabel}>Form</Text>
          <Text style={[styles.scoreValue, {
            color: avgScore >= 80 ? '#22C55E' : avgScore >= 60 ? '#F59E0B' : '#EF4444'
          }]}>
            {avgScore}
          </Text>
        </View>
      )}

      {/* Rep counter */}
      {workoutState === 'active' && <RepCounter count={totalReps} />}

      {/* Feedback banner */}
      <FeedbackBanner />

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 16 }]}>
        {/* Difficulty selector */}
        <View style={styles.difficultyRow}>
          {(['beginner', 'intermediate', 'advanced'] as Difficulty[]).map(d => (
            <TouchableOpacity
              key={d}
              style={[styles.diffBtn, difficulty === d && styles.diffBtnActive]}
              onPress={() => setDifficulty(d)}
            >
              <Text style={[styles.diffBtnText, difficulty === d && styles.diffBtnTextActive]}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              const next = !voiceEnabled;
              setVoiceEnabled(next);
              voiceFeedback.setEnabled(next);
            }}
          >
            <Ionicons
              name={voiceEnabled ? 'volume-high' : 'volume-mute'}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainBtn, workoutState !== 'idle' ? styles.stopBtn : styles.startBtn]}
            onPress={workoutState === 'idle' ? startWorkout : stopWorkout}
            disabled={!poseState.isModelLoaded}
          >
            <Ionicons
              name={workoutState === 'idle' ? 'play' : 'stop'}
              size={32}
              color="#fff"
            />
            <Text style={styles.mainBtnText}>
              {workoutState === 'idle' ? 'Start' :
               workoutState === 'detecting' ? 'Detecting...' :
               workoutState === 'active' ? 'Stop' : 'Resume'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/demo')}
          >
            <Ionicons name="play-circle-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  loadingText: { color: '#fff', fontSize: 16 },

  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#0F0F0F', gap: 16 },
  permissionTitle: { color: '#fff', fontSize: 24, fontWeight: '600', textAlign: 'center' },
  permissionSubtext: { color: '#9CA3AF', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  permissionBtn: { backgroundColor: '#6366F1', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  permissionBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },

  topHud: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', padding: 12, gap: 8, flexWrap: 'wrap' },
  hudPill: { backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
  hudText: { color: '#fff', fontSize: 13, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },

  errorBanner: { position: 'absolute', top: 100, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(239,68,68,0.85)', padding: 10, borderRadius: 10, gap: 8 },
  errorText: { color: '#fff', fontSize: 12, flex: 1 },

  viewHint: { position: 'absolute', top: 140, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 10, borderRadius: 10, gap: 8 },
  viewHintText: { color: '#F59E0B', fontSize: 13, flex: 1 },

  scoreBox: { position: 'absolute', top: 120, right: 16, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 12, borderRadius: 16, minWidth: 60 },
  scoreLabel: { color: '#9CA3AF', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  scoreValue: { fontSize: 32, fontWeight: '700' },

  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  difficultyRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  diffBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  diffBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  diffBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  diffBtnTextActive: { color: '#fff', fontWeight: '600' },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  iconBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  mainBtn: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', gap: 4 },
  startBtn: { backgroundColor: '#6366F1' },
  stopBtn: { backgroundColor: '#EF4444' },
  mainBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});