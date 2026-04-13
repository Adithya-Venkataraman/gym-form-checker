// src/hooks/useFormAnalysis.ts
// Evaluates exercise-specific angle rules and generates feedback

import { useCallback, useRef } from 'react';
import { AngleRule, Difficulty, ExerciseConfig } from '../config/exercises';
import {
  KeypointMap,
  getAngleFromLandmarks,
  calculateFormScore,
} from '../utils/angleUtils';

export interface FormViolation {
  joint: string;
  angle: number;
  feedback: string;
  severity: 'low' | 'medium' | 'high';
  injuryWarning?: string;
}

export interface FormAnalysisResult {
  violations: FormViolation[];
  formScore: number;
  feedback: string | null;   // most important feedback to show now
  safetyAlert: string | null; // injury warning if any
  isGoodForm: boolean;
  confidence: number;
  coloredJoints: Record<string, 'good' | 'warning' | 'danger'>;
}

export function useFormAnalysis(
  exercise: ExerciseConfig | null,
  difficulty: Difficulty
) {
  const feedbackCooldown = useRef<Record<string, number>>({});

  const analyze = useCallback(
    (kpMap: KeypointMap, phase: string): FormAnalysisResult => {
      if (!exercise) {
        return {
          violations: [],
          formScore: 100,
          feedback: null,
          safetyAlert: null,
          isGoodForm: true,
          confidence: 0,
          coloredJoints: {},
        };
      }

      const rules: AngleRule[] = exercise.angleRules[difficulty] ||
        exercise.angleRules.beginner;

      const violations: FormViolation[] = [];
      const coloredJoints: Record<string, 'good' | 'warning' | 'danger'> = {};
      let totalConfidence = 0;
      let measuredRules = 0;

      rules.forEach(rule => {
        // Only check rules relevant to current phase
        if (rule.phase !== 'any' && rule.phase !== phase) return;

        const angle = getAngleFromLandmarks(
          kpMap,
          rule.landmarks[0],
          rule.landmarks[1],
          rule.landmarks[2]
        );

        if (angle === null) return;

        measuredRules++;
        totalConfidence += 0.8; // base confidence for measured rule

        const minOk = rule.min === undefined || angle >= rule.min;
        const maxOk = rule.max === undefined || angle <= rule.max;

        if (!minOk || !maxOk) {
          violations.push({
            joint: rule.joint,
            angle,
            feedback: rule.feedback,
            severity: rule.severity,
            injuryWarning: rule.injuryWarning,
          });
          coloredJoints[rule.joint] =
            rule.severity === 'high' ? 'danger' : 'warning';
        } else {
          coloredJoints[rule.joint] = 'good';
        }
      });

      // Prioritize feedback (show most severe first, with cooldown to avoid spam)
      const now = Date.now();
      const sortedViolations = [...violations].sort((a, b) => {
        const severityOrder = { high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });

      let feedback: string | null = null;
      let safetyAlert: string | null = null;

      for (const v of sortedViolations) {
        // Cooldown: don't repeat the same feedback more than once per 3s
        const lastShown = feedbackCooldown.current[v.feedback] ?? 0;
        if (now - lastShown > 3000) {
          feedback = v.feedback;
          feedbackCooldown.current[v.feedback] = now;
          break;
        }
      }

      // Safety alert takes priority
      const highSeverityAlert = sortedViolations.find(
        v => v.severity === 'high' && v.injuryWarning
      );
      if (highSeverityAlert?.injuryWarning) {
        safetyAlert = highSeverityAlert.injuryWarning;
      }

      const formScore = calculateFormScore(violations);
      const confidence = measuredRules > 0
        ? (totalConfidence / measuredRules) * (measuredRules / rules.length)
        : 0;

      return {
        violations,
        formScore,
        feedback,
        safetyAlert,
        isGoodForm: violations.length === 0,
        confidence: Math.min(1, confidence),
        coloredJoints,
      };
    },
    [exercise, difficulty]
  );

  return { analyze };
}