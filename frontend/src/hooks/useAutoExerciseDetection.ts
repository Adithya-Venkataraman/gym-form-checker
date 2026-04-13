// src/hooks/useAutoExerciseDetection.ts
// Automatically identifies which exercise the user is doing
// by observing angle patterns over a short buffer window

import { useRef, useCallback, useState } from 'react';
import { EXERCISE_LIST, ExerciseConfig } from '../config/exercises';
import { KeypointMap, getAngleFromLandmarks } from '../utils/angleUtils';

interface AngleBuffer {
  exerciseId: string;
  angles: number[];
  minAngle: number;
  maxAngle: number;
  detectedMotion: boolean;
}

export interface AutoDetectionResult {
  detectedExercise: ExerciseConfig | null;
  confidence: number;
  isAnalyzing: boolean;
  framesAnalyzed: number;
}

const DETECTION_WINDOW = 60;   // frames to observe before deciding
const MIN_MOTION_RANGE = 30;   // minimum angle change to be "motion"
const INACTIVITY_TIMEOUT = 5000; // ms of inactivity before auto-stopping

export function useAutoExerciseDetection() {
  const buffers = useRef<AngleBuffer[]>(
    EXERCISE_LIST.map(ex => ({
      exerciseId: ex.id,
      angles: [],
      minAngle: Infinity,
      maxAngle: -Infinity,
      detectedMotion: false,
    }))
  );

  const frameCount = useRef(0);
  const lastMotionTime = useRef(Date.now());
  const [result, setResult] = useState<AutoDetectionResult>({
    detectedExercise: null,
    confidence: 0,
    isAnalyzing: false,
    framesAnalyzed: 0,
  });

  const processFrame = useCallback((kpMap: KeypointMap) => {
    frameCount.current++;

    // Update each exercise's angle buffer
    EXERCISE_LIST.forEach((exercise, idx) => {
      const { primaryJoint, landmarks } = exercise.autoDetectionPattern;
      const angle = getAngleFromLandmarks(kpMap, landmarks[0], landmarks[1], landmarks[2]);

      if (angle === null) return;

      const buf = buffers.current[idx];
      buf.angles.push(angle);
      if (buf.angles.length > DETECTION_WINDOW) buf.angles.shift();

      buf.minAngle = Math.min(buf.minAngle, angle);
      buf.maxAngle = Math.max(buf.maxAngle, angle);

      const range = buf.maxAngle - buf.minAngle;
      if (range >= MIN_MOTION_RANGE) {
        buf.detectedMotion = true;
        lastMotionTime.current = Date.now();
      }
    });

    // Don't evaluate until we have enough frames
    if (frameCount.current < DETECTION_WINDOW) {
      setResult(prev => ({
        ...prev,
        isAnalyzing: true,
        framesAnalyzed: frameCount.current,
      }));
      return;
    }

    // Score each exercise by how well the motion matches
    const scores = EXERCISE_LIST.map((exercise, idx) => {
      const buf = buffers.current[idx];
      const { motionRange, minReps } = exercise.autoDetectionPattern;

      if (!buf.detectedMotion) return { exercise, score: 0 };

      const observedRange = buf.maxAngle - buf.minAngle;

      // Score based on how close the motion range is to expected
      const rangeScore = Math.max(0, 1 - Math.abs(observedRange - motionRange) / motionRange);

      // Count rough reps (oscillations) in the buffer
      let repCount = 0;
      const angles = buf.angles;
      const mid = (buf.minAngle + buf.maxAngle) / 2;
      let wasAbove = angles[0] > mid;
      for (let i = 1; i < angles.length; i++) {
        const isAbove = angles[i] > mid;
        if (isAbove !== wasAbove) {
          repCount += 0.5; // each crossing = half rep
          wasAbove = isAbove;
        }
      }
      const repScore = Math.min(1, repCount / minReps);

      return { exercise, score: rangeScore * 0.6 + repScore * 0.4 };
    });

    scores.sort((a, b) => b.score - a.score);
    const best = scores[0];

    if (best.score > 0.5) {
      setResult({
        detectedExercise: best.exercise,
        confidence: best.score,
        isAnalyzing: false,
        framesAnalyzed: frameCount.current,
      });
    } else {
      setResult(prev => ({
        ...prev,
        isAnalyzing: true,
        framesAnalyzed: frameCount.current,
        detectedExercise: null,
      }));
    }
  }, []);

  const checkInactivity = useCallback((): boolean => {
    return Date.now() - lastMotionTime.current > INACTIVITY_TIMEOUT;
  }, []);

  const reset = useCallback(() => {
    frameCount.current = 0;
    buffers.current.forEach(buf => {
      buf.angles = [];
      buf.minAngle = Infinity;
      buf.maxAngle = -Infinity;
      buf.detectedMotion = false;
    });
    setResult({
      detectedExercise: null,
      confidence: 0,
      isAnalyzing: false,
      framesAnalyzed: 0,
    });
  }, []);

  return { result, processFrame, checkInactivity, reset };
}