// src/hooks/usePoseDetection.ts
// Backend-based pose estimation — sends frames to Python/MediaPipe server

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  KeypointMap,
  KeypointSmoother,
  detectBodyVisibility,
  detectCameraView,
} from '../utils/angleUtils';

// 👇 Change this to your computer's local IP (find it with `ipconfig` on Windows)
const BACKEND_URL = ' 192.168.1.70:8000';

export interface PoseDetectionState {
  keypoints: KeypointMap | null;
  rawKeypoints: any[] | null;
  isModelLoaded: boolean;
  isDetecting: boolean;
  fps: number;
  bodyVisibility: { isFullBody: boolean; guidance: string | null; score: number };
  cameraView: { view: 'front' | 'side' | 'unknown'; confidence: number };
  error: string | null;
}

interface UsePoseDetectionOptions {
  skipFrames?: number;
  smoothing?: number;
  minConfidence?: number;
  multiPerson?: boolean;
}

export function usePoseDetection(options: UsePoseDetectionOptions = {}) {
  const {
    skipFrames = 2,
    smoothing = 0.6,
    minConfidence = 0.3,
  } = options;

  const smootherRef = useRef(new KeypointSmoother(smoothing));
  const frameCountRef = useRef(0);
  const lastInferenceTime = useRef(0);
  const fpsWindowRef = useRef<number[]>([]);
  const isRequestInFlight = useRef(false);

  const [state, setState] = useState<PoseDetectionState>({
    keypoints: null,
    rawKeypoints: null,
    isModelLoaded: false,
    isDetecting: false,
    fps: 0,
    bodyVisibility: { isFullBody: false, guidance: null, score: 0 },
    cameraView: { view: 'unknown', confidence: 0 },
    error: null,
  });

  // Check backend is reachable on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/health`, {
          method: 'GET',
        });
        if (res.ok) {
          setState(prev => ({ ...prev, isModelLoaded: true, error: null }));
        } else {
          setState(prev => ({ ...prev, error: 'Backend returned error' }));
        }
      } catch {
        setState(prev => ({
          ...prev,
          error: 'Cannot connect to backend. Is the Python server running?',
        }));
      }
    };
    checkBackend();
  }, []);

  /**
   * Process a single frame.
   * Pass a base64 JPEG string from expo-camera's onCameraFrameAvailable.
   */
  const processFrame = useCallback(
    async (base64Image: string): Promise<void> => {
      // Frame skipping for performance
      frameCountRef.current++;
      if (frameCountRef.current % skipFrames !== 0) return;

      // Don't stack requests if one is already in flight
      if (isRequestInFlight.current) return;

      const now = performance.now();
      isRequestInFlight.current = true;

      try {
        setState(prev => ({ ...prev, isDetecting: true }));

        const response = await fetch(`${BACKEND_URL}/api/v1/analyze-frame`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64Image,
            exercise: null, // pass exercise ID here if known
          }),
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const data = await response.json();

        // Calculate FPS
        const elapsed = now - lastInferenceTime.current;
        lastInferenceTime.current = now;
        if (elapsed > 0) {
          fpsWindowRef.current.push(1000 / elapsed);
          if (fpsWindowRef.current.length > 10) fpsWindowRef.current.shift();
        }
        const fps = fpsWindowRef.current.length > 0
          ? Math.round(
              fpsWindowRef.current.reduce((a, b) => a + b, 0) /
              fpsWindowRef.current.length
            )
          : 0;

        if (!data.keypoints || data.keypoints.length === 0) {
          setState(prev => ({
            ...prev,
            isDetecting: false,
            fps,
            keypoints: null,
            rawKeypoints: null,
            bodyVisibility: {
              isFullBody: false,
              guidance: 'No person detected',
              score: 0,
            },
          }));
          return;
        }

        // Convert keypoint array to named map: { nose: {x, y, score}, ... }
        const kpMap: KeypointMap = {};
        for (const kp of data.keypoints) {
          kpMap[kp.name] = { x: kp.x, y: kp.y, z: kp.z, score: kp.score };
        }

        const smoothed = smootherRef.current.smooth(kpMap);
        const bodyVisibility = detectBodyVisibility(smoothed);
        const cameraView = detectCameraView(smoothed);

        setState(prev => ({
          ...prev,
          keypoints: smoothed,
          rawKeypoints: data.keypoints,
          isDetecting: false,
          fps,
          bodyVisibility,
          cameraView,
          error: null,
        }));
      } catch (err) {
        setState(prev => ({
          ...prev,
          isDetecting: false,
          error: String(err),
        }));
      } finally {
        isRequestInFlight.current = false;
      }
    },
    [skipFrames, minConfidence]
  );

  const resetSmoother = useCallback(() => {
    smootherRef.current.reset();
  }, []);

  return { state, processFrame, resetSmoother };
}