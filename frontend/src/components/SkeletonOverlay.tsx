// src/components/SkeletonOverlay.tsx
// Real-time skeleton drawn as SVG on top of camera feed
// Color-coded: green = correct, yellow = warning, red = danger

import React, { memo } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import { KeypointMap, Keypoint } from '../utils/angleUtils';

interface Props {
  keypoints: KeypointMap | null;
  coloredJoints?: Record<string, 'good' | 'warning' | 'danger'>;
  frameWidth: number;
  frameHeight: number;
  canvasWidth?: number;
  canvasHeight?: number;
  showJointLabels?: boolean;
}

const COLORS = {
  good: '#22C55E',      // green
  warning: '#F59E0B',   // amber
  danger: '#EF4444',    // red
  default: '#FFFFFF',   // white (unanalyzed)
  bone: 'rgba(255,255,255,0.6)',
  boneError: 'rgba(239,68,68,0.8)',
};

// Skeleton connections (pairs of landmark names)
const SKELETON_CONNECTIONS: [string, string][] = [
  // Torso
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  // Left arm
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  // Right arm
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  // Left leg
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['left_ankle', 'left_foot_index'],
  // Right leg
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
  ['right_ankle', 'right_foot_index'],
  // Face
  ['nose', 'left_shoulder'],
  ['nose', 'right_shoulder'],
];

// Joints to render as circles (skip face micro-landmarks)
const VISIBLE_JOINTS = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

function getJointColor(
  name: string,
  coloredJoints?: Record<string, 'good' | 'warning' | 'danger'>
): string {
  if (!coloredJoints) return COLORS.default;
  const state = coloredJoints[name];
  return state ? COLORS[state] : COLORS.default;
}

function scalePoint(
  kp: Keypoint,
  frameW: number,
  frameH: number,
  canvasW: number,
  canvasH: number
): { x: number; y: number } {
  // MoveNet outputs normalized 0-1 coordinates
  // Scale to canvas dimensions
  return {
    x: (kp.x / frameW) * canvasW,
    y: (kp.y / frameH) * canvasH,
  };
}

const SkeletonOverlay = memo(function SkeletonOverlay({
  keypoints,
  coloredJoints,
  frameWidth,
  frameHeight,
  canvasWidth,
  canvasHeight,
  showJointLabels = false,
}: Props) {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const cw = canvasWidth ?? screenWidth;
  const ch = canvasHeight ?? screenHeight;

  if (!keypoints) return null;

  // Determine if we're using normalized (0-1) or pixel coordinates
  // MoveNet: normalized. MediaPipe JS: pixel coordinates.
  const isNormalized = Object.values(keypoints).some(kp => kp.x <= 1.0 && kp.y <= 1.0);

  function toCanvas(kp: Keypoint): { x: number; y: number } {
    if (isNormalized) {
      return { x: kp.x * cw, y: kp.y * ch };
    }
    return scalePoint(kp, frameWidth, frameHeight, cw, ch);
  }

  return (
    <Svg
      style={StyleSheet.absoluteFill}
      width={cw}
      height={ch}
      viewBox={`0 0 ${cw} ${ch}`}
    >
      {/* Bones / connections */}
      {SKELETON_CONNECTIONS.map(([a, b]) => {
        const kpA = keypoints[a];
        const kpB = keypoints[b];

        if (!kpA || !kpB) return null;
        if ((kpA.score ?? 1) < 0.2 || (kpB.score ?? 1) < 0.2) return null;

        const posA = toCanvas(kpA);
        const posB = toCanvas(kpB);

        // Color bone red if either endpoint is in danger
        const aState = coloredJoints?.[a];
        const bState = coloredJoints?.[b];
        const boneColor =
          aState === 'danger' || bState === 'danger'
            ? COLORS.boneError
            : COLORS.bone;

        return (
          <Line
            key={`${a}-${b}`}
            x1={posA.x}
            y1={posA.y}
            x2={posB.x}
            y2={posB.y}
            stroke={boneColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
        );
      })}

      {/* Joint circles */}
      {VISIBLE_JOINTS.map(name => {
        const kp = keypoints[name];
        if (!kp || (kp.score ?? 1) < 0.25) return null;

        const pos = toCanvas(kp);
        const color = getJointColor(name, coloredJoints);
        const radius = name === 'nose' ? 5 : 7;
        const isError = coloredJoints?.[name] === 'danger';

        return (
          <G key={name}>
            {/* Glow ring for error joints */}
            {isError && (
              <Circle
                cx={pos.x}
                cy={pos.y}
                r={radius + 5}
                fill="none"
                stroke={COLORS.danger}
                strokeWidth={2}
                opacity={0.4}
              />
            )}
            <Circle
              cx={pos.x}
              cy={pos.y}
              r={radius}
              fill={color}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={1.5}
            />
          </G>
        );
      })}
    </Svg>
  );
});

export default SkeletonOverlay;