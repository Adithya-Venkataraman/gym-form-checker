// src/utils/angleUtils.ts
// Core geometry for joint angle calculation and keypoint processing

export interface Keypoint {
  x: number;
  y: number;
  z?: number;
  score?: number;
  name?: string;
}

export interface KeypointMap {
  [name: string]: Keypoint;
}

// MediaPipe / MoveNet landmark names
export const LANDMARK_NAMES = [
  'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
  'right_eye_inner', 'right_eye', 'right_eye_outer',
  'left_ear', 'right_ear',
  'mouth_left', 'mouth_right',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_pinky', 'right_pinky',
  'left_index', 'right_index',
  'left_thumb', 'right_thumb',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

/**
 * Convert raw keypoint array to named map for easy lookup
 */
export function keypointsToMap(keypoints: Keypoint[]): KeypointMap {
  const map: KeypointMap = {};
  keypoints.forEach((kp, i) => {
    const name = kp.name || LANDMARK_NAMES[i];
    if (name) map[name] = kp;
  });
  return map;
}

/**
 * Calculate angle at point B formed by A-B-C (in degrees)
 * Uses the law of cosines / dot product approach
 */
export function calculateAngle(
  a: Keypoint,
  b: Keypoint,
  c: Keypoint
): number {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);

  let angle = Math.abs(radians * (180 / Math.PI));

  if (angle > 180) {
    angle = 360 - angle;
  }

  return angle;
}

/**
 * Calculate angle using landmark names from a keypoint map
 */
export function getAngleFromLandmarks(
  kpMap: KeypointMap,
  a: string,
  b: string,
  c: string,
  minConfidence: number = 0.3
): number | null {
  const pointA = kpMap[a];
  const pointB = kpMap[b];
  const pointC = kpMap[c];

  if (!pointA || !pointB || !pointC) return null;

  // Check confidence scores if available
  if (
    (pointA.score !== undefined && pointA.score < minConfidence) ||
    (pointB.score !== undefined && pointB.score < minConfidence) ||
    (pointC.score !== undefined && pointC.score < minConfidence)
  ) {
    return null;
  }

  return calculateAngle(pointA, pointB, pointC);
}

/**
 * Calculate 3D angle when z-coordinates are available (MediaPipe)
 */
export function calculateAngle3D(
  a: Keypoint,
  b: Keypoint,
  c: Keypoint
): number {
  if (a.z === undefined || b.z === undefined || c.z === undefined) {
    return calculateAngle(a, b, c);
  }

  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };

  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2 + v1.z ** 2);
  const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2 + v2.z ** 2);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.acos(cos) * (180 / Math.PI);
}

/**
 * Check which key joints are visible above confidence threshold
 */
export function getVisibleJoints(
  kpMap: KeypointMap,
  requiredJoints: string[],
  threshold: number = 0.3
): { visible: string[]; missing: string[] } {
  const visible: string[] = [];
  const missing: string[] = [];

  requiredJoints.forEach(joint => {
    const kp = kpMap[joint];
    if (kp && (kp.score === undefined || kp.score >= threshold)) {
      visible.push(joint);
    } else {
      missing.push(joint);
    }
  });

  return { visible, missing };
}

/**
 * Detect if the full body is in frame
 * Returns guidance message if body is not fully visible
 */
export function detectBodyVisibility(kpMap: KeypointMap): {
  isFullBody: boolean;
  guidance: string | null;
  score: number;
} {
  const topJoints = ['left_shoulder', 'right_shoulder', 'nose'];
  const bottomJoints = ['left_ankle', 'right_ankle', 'left_foot_index', 'right_foot_index'];
  const coreJoints = ['left_hip', 'right_hip', 'left_knee', 'right_knee'];

  const hasTop = topJoints.some(j => (kpMap[j]?.score ?? 0) > 0.3);
  const hasBottom = bottomJoints.some(j => (kpMap[j]?.score ?? 0) > 0.2);
  const hasCore = coreJoints.filter(j => (kpMap[j]?.score ?? 0) > 0.3).length >= 2;

  if (!hasTop && !hasBottom) {
    return { isFullBody: false, guidance: 'No body detected — ensure good lighting', score: 0 };
  }
  if (!hasTop) {
    return { isFullBody: false, guidance: 'Move camera down — upper body not visible', score: 0.3 };
  }
  if (!hasBottom) {
    return { isFullBody: false, guidance: 'Move camera up or step back — feet not visible', score: 0.4 };
  }
  if (!hasCore) {
    return { isFullBody: false, guidance: 'Step back — need to see your full body', score: 0.5 };
  }

  // Check if body fills reasonable portion of frame
  const shoulders = [kpMap['left_shoulder'], kpMap['right_shoulder']].filter(Boolean);
  const ankles = [kpMap['left_ankle'], kpMap['right_ankle']].filter(Boolean);

  if (shoulders.length && ankles.length) {
    const bodyHeight = Math.abs(
      Math.min(...ankles.map(k => k.y)) -
      Math.min(...shoulders.map(k => k.y))
    );
    if (bodyHeight < 0.3) {
      return { isFullBody: false, guidance: 'Move closer to the camera', score: 0.6 };
    }
  }

  return { isFullBody: true, guidance: null, score: 1.0 };
}

/**
 * Detect camera view angle (front vs side)
 * Uses shoulder width relative to hip width to estimate rotation
 */
export function detectCameraView(kpMap: KeypointMap): {
  view: 'front' | 'side' | 'unknown';
  confidence: number;
} {
  const ls = kpMap['left_shoulder'];
  const rs = kpMap['right_shoulder'];
  const lh = kpMap['left_hip'];
  const rh = kpMap['right_hip'];

  if (!ls || !rs || !lh || !rh) {
    return { view: 'unknown', confidence: 0 };
  }

  const shoulderWidth = Math.abs(rs.x - ls.x);
  const hipWidth = Math.abs(rh.x - lh.x);
  const bodyDepth = Math.max(shoulderWidth, hipWidth);

  // In side view, both shoulder landmarks overlap → small width
  // In front view, shoulders span the frame → larger width
  if (bodyDepth < 0.1) {
    return { view: 'side', confidence: 0.8 };
  } else if (bodyDepth > 0.25) {
    return { view: 'front', confidence: 0.85 };
  }

  return { view: 'unknown', confidence: 0.4 };
}

/**
 * Detect if multiple people are in frame
 * Returns the primary subject (largest/most centered person)
 */
export function selectPrimarySubject(
  allPoses: Keypoint[][],
  frameWidth: number,
  frameHeight: number
): Keypoint[] | null {
  if (!allPoses || allPoses.length === 0) return null;
  if (allPoses.length === 1) return allPoses[0];

  // Score each pose by confidence + centeredness
  const scored = allPoses.map(pose => {
    const avgScore = pose.reduce((sum, kp) => sum + (kp.score ?? 0), 0) / pose.length;

    // Find body center
    const xs = pose.map(kp => kp.x);
    const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const frameCenterX = frameWidth / 2;

    // Prefer centered subjects
    const centerScore = 1 - Math.abs(centerX - frameCenterX) / frameCenterX;

    return { pose, score: avgScore * 0.7 + centerScore * 0.3 };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].pose;
}

/**
 * Detect low lighting conditions from frame brightness
 */
export function detectLowLighting(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): { isLow: boolean; brightness: number } {
  // Sample every 10th pixel for performance
  let totalBrightness = 0;
  let samples = 0;

  for (let i = 0; i < imageData.length; i += 40) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    // Perceptual brightness
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b;
    samples++;
  }

  const brightness = samples > 0 ? totalBrightness / samples : 128;
  return { isLow: brightness < 60, brightness };
}

/**
 * Smooth keypoints using exponential moving average
 * Reduces jitter in real-time detection
 */
export class KeypointSmoother {
  private alpha: number; // smoothing factor (0-1, higher = less smoothing)
  private prevKeypoints: KeypointMap | null = null;

  constructor(alpha: number = 0.6) {
    this.alpha = alpha;
  }

  smooth(current: KeypointMap): KeypointMap {
    if (!this.prevKeypoints) {
      this.prevKeypoints = current;
      return current;
    }

    const smoothed: KeypointMap = {};

    Object.keys(current).forEach(name => {
      const cur = current[name];
      const prev = this.prevKeypoints![name];

      if (!prev) {
        smoothed[name] = cur;
      } else {
        smoothed[name] = {
          x: this.alpha * cur.x + (1 - this.alpha) * prev.x,
          y: this.alpha * cur.y + (1 - this.alpha) * prev.y,
          z: cur.z !== undefined && prev.z !== undefined
            ? this.alpha * cur.z + (1 - this.alpha) * prev.z
            : cur.z,
          score: cur.score,
          name: cur.name,
        };
      }
    });

    this.prevKeypoints = smoothed;
    return smoothed;
  }

  reset(): void {
    this.prevKeypoints = null;
  }
}

/**
 * Calculate overall form score (0-100) based on angle rule violations
 */
export function calculateFormScore(
  violations: Array<{ severity: 'low' | 'medium' | 'high' }>
): number {
  const deductions = { low: 5, medium: 15, high: 30 };
  const total = violations.reduce(
    (score, v) => score - deductions[v.severity],
    100
  );
  return Math.max(0, Math.min(100, total));
}