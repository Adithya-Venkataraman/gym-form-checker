// src/hooks/useRepCounter.ts
// Rep counting state machine using joint angle thresholds

import { useRef, useCallback } from 'react';
import { RepLogic } from '../config/exercises';
import { KeypointMap, getAngleFromLandmarks } from '../utils/angleUtils';

type RepPhase = 'idle' | 'going_down' | 'bottom' | 'going_up' | 'top';

export interface RepCounterState {
  repCount: number;
  phase: RepPhase;
  currentAngle: number | null;
  completionPercent: number; // 0-100% through current rep
}

export interface RepCounterResult {
  count: number;
  phase: RepPhase;
  isRepComplete: boolean;
  completionPercent: number;
}

export function useRepCounter(repLogic: RepLogic | null) {
  const stateRef = useRef<{
    count: number;
    phase: RepPhase;
    downCrossed: boolean;
    upCrossed: boolean;
    angleHistory: number[];
  }>({
    count: 0,
    phase: 'idle',
    downCrossed: false,
    upCrossed: false,
    angleHistory: [],
  });

  const processKeypoints = useCallback(
    (kpMap: KeypointMap): RepCounterResult => {
      if (!repLogic) {
        return { count: 0, phase: 'idle', isRepComplete: false, completionPercent: 0 };
      }

      const angle = getAngleFromLandmarks(
        kpMap,
        repLogic.landmarks[0],
        repLogic.landmarks[1],
        repLogic.landmarks[2]
      );

      if (angle === null) {
        return {
          count: stateRef.current.count,
          phase: stateRef.current.phase,
          isRepComplete: false,
          completionPercent: 0,
        };
      }

      // Smooth angle history (rolling window of 3 frames)
      const history = stateRef.current.angleHistory;
      history.push(angle);
      if (history.length > 3) history.shift();
      const smoothAngle = history.reduce((a, b) => a + b, 0) / history.length;

      const { downThreshold, upThreshold, direction } = repLogic;
      let isRepComplete = false;
      const state = stateRef.current;

      if (direction === 'decrease_to_down') {
        // Phase: up (large angle) → down (small angle) → up
        // squat: standing = 170°, bottom = 80°
        if (smoothAngle > upThreshold) {
          // We're at top position
          if (state.phase === 'going_up' || state.phase === 'idle') {
            if (state.downCrossed) {
              // Completed a full rep: went down and came back up
              state.count++;
              isRepComplete = true;
              state.downCrossed = false;
            }
          }
          state.phase = 'top';
        } else if (smoothAngle < downThreshold) {
          // We're at bottom position
          state.downCrossed = true;
          state.phase = 'bottom';
        } else if (smoothAngle < upThreshold && smoothAngle > downThreshold) {
          // Mid-range — determine direction from history
          if (history.length >= 2) {
            const trend = history[history.length - 1] - history[0];
            state.phase = trend < 0 ? 'going_down' : 'going_up';
          }
        }
      } else {
        // direction === 'increase_to_down' (e.g. hip extension)
        if (smoothAngle < downThreshold) {
          if (state.phase === 'going_up' || state.phase === 'idle') {
            if (state.downCrossed) {
              state.count++;
              isRepComplete = true;
              state.downCrossed = false;
            }
          }
          state.phase = 'top';
        } else if (smoothAngle > upThreshold) {
          state.downCrossed = true;
          state.phase = 'bottom';
        } else {
          if (history.length >= 2) {
            const trend = history[history.length - 1] - history[0];
            state.phase = trend > 0 ? 'going_down' : 'going_up';
          }
        }
      }

      // Calculate completion percentage (0 = top, 100 = bottom)
      const range = Math.abs(upThreshold - downThreshold);
      const progress = direction === 'decrease_to_down'
        ? ((upThreshold - smoothAngle) / range) * 100
        : ((smoothAngle - downThreshold) / range) * 100;
      const completionPercent = Math.max(0, Math.min(100, progress));

      return {
        count: state.count,
        phase: state.phase,
        isRepComplete,
        completionPercent,
      };
    },
    [repLogic]
  );

  const reset = useCallback(() => {
    stateRef.current = {
      count: 0,
      phase: 'idle',
      downCrossed: false,
      upCrossed: false,
      angleHistory: [],
    };
  }, []);

  return { processKeypoints, reset, count: stateRef.current.count };
}