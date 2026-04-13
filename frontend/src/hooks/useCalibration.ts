// src/hooks/useCalibration.ts
// Personalization: adjust angle thresholds based on user height and limb proportions
// Stores calibration in AsyncStorage for persistence across sessions

import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@gymform:calibration';

export interface UserCalibration {
  heightCm: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  // Normalized limb ratio adjustments (0.8 – 1.2, where 1.0 = average)
  torsoRatio: number;   // longer torso → more forward lean is acceptable
  femurRatio: number;   // longer femurs → harder to keep upright in squat
  armRatio: number;     // longer arms → deeper elbow angle needed
  // Derived threshold adjustments
  angleAdjustments: {
    squat_depth: number;       // degrees added/subtracted from knee min angle
    squat_back_angle: number;  // degrees tolerance on hip forward lean
    pushup_elbow: number;      // degrees tolerance on elbow angle
    deadlift_spine: number;    // degrees tolerance on spine angle
  };
}

const DEFAULT_CALIBRATION: UserCalibration = {
  heightCm: 175,
  difficulty: 'intermediate',
  torsoRatio: 1.0,
  femurRatio: 1.0,
  armRatio: 1.0,
  angleAdjustments: {
    squat_depth: 0,
    squat_back_angle: 0,
    pushup_elbow: 0,
    deadlift_spine: 0,
  },
};

function computeAdjustments(
  heightCm: number,
  femurRatio: number,
  torsoRatio: number,
  armRatio: number,
): UserCalibration['angleAdjustments'] {
  // People with longer femurs naturally have more forward lean in squats
  const squat_back_angle = Math.round((femurRatio - 1.0) * 15);

  // Taller athletes often need slightly more knee angle tolerance
  const heightFactor = (heightCm - 175) / 175;
  const squat_depth = Math.round(heightFactor * 5);

  // Longer arms → slightly different elbow angle range in push-ups
  const pushup_elbow = Math.round((armRatio - 1.0) * 8);

  // Longer torso → slightly more acceptable spinal angle range
  const deadlift_spine = Math.round((torsoRatio - 1.0) * 5);

  return {
    squat_depth,
    squat_back_angle,
    pushup_elbow,
    deadlift_spine,
  };
}

export function useCalibration() {
  const [calibration, setCalibration] = useState<UserCalibration>(DEFAULT_CALIBRATION);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as UserCalibration;
          setCalibration(saved);
        } catch {
          // corrupted — use defaults
        }
      }
      setIsLoaded(true);
    });
  }, []);

  const updateCalibration = useCallback(async (
    updates: Partial<Pick<UserCalibration, 'heightCm' | 'difficulty' | 'femurRatio' | 'torsoRatio' | 'armRatio'>>
  ) => {
    setCalibration(prev => {
      const next = { ...prev, ...updates };
      next.angleAdjustments = computeAdjustments(
        next.heightCm,
        next.femurRatio,
        next.torsoRatio,
        next.armRatio,
      );
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetCalibration = useCallback(async () => {
    setCalibration(DEFAULT_CALIBRATION);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  /**
   * Apply user calibration adjustments to an angle rule's min/max thresholds.
   * Call this when evaluating form to get personalized rules.
   */
  const adjustThreshold = useCallback((
    exerciseId: string,
    ruleType: string,
    value: number,
    isMin: boolean,
  ): number => {
    const adj = calibration.angleAdjustments;

    // Map exercise+rule to adjustment key
    const key = `${exerciseId}_${ruleType}` as keyof typeof adj;
    const delta = adj[key] ?? 0;

    // For min thresholds: subtract (more lenient) when positive delta
    // For max thresholds: add (more lenient) when positive delta
    return isMin ? value - delta : value + delta;
  }, [calibration]);

  return {
    calibration,
    isLoaded,
    updateCalibration,
    resetCalibration,
    adjustThreshold,
  };
}