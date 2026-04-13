# backend/app/ml/pose_detector.py
# MediaPipe Pose wrapper for server-side inference

import cv2
import numpy as np
import mediapipe as mp
from typing import List, Optional, Dict, Tuple
from dataclasses import dataclass

from app.core.config import settings


@dataclass
class Keypoint:
    name: str
    x: float        # normalized 0-1
    y: float        # normalized 0-1
    z: float        # depth (normalized)
    score: float    # visibility confidence


# MediaPipe landmark names (33 landmarks)
LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer",
    "right_eye_inner", "right_eye", "right_eye_outer",
    "left_ear", "right_ear", "mouth_left", "mouth_right",
    "left_shoulder", "right_shoulder",
    "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_pinky", "right_pinky",
    "left_index", "right_index",
    "left_thumb", "right_thumb",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]


class PoseDetector:
    """
    Thread-safe MediaPipe Pose wrapper.
    Each instance should be used in a single thread/process.
    """

    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(
            static_image_mode=False,
            model_complexity=settings.MEDIAPIPE_MODEL_COMPLEXITY,
            enable_segmentation=False,
            smooth_landmarks=True,
            min_detection_confidence=settings.MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=settings.MIN_TRACKING_CONFIDENCE,
        )

    def detect(self, frame: np.ndarray) -> Optional[List[Keypoint]]:
        """
        Run pose detection on a BGR OpenCV frame.
        Returns list of 33 Keypoint objects or None if no pose detected.
        """
        # MediaPipe expects RGB
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self.pose.process(rgb)

        if not results.pose_landmarks:
            return None

        keypoints = []
        for i, lm in enumerate(results.pose_landmarks.landmark):
            keypoints.append(Keypoint(
                name=LANDMARK_NAMES[i],
                x=lm.x,
                y=lm.y,
                z=lm.z,
                score=lm.visibility,
            ))

        return keypoints

    def detect_world(self, frame: np.ndarray) -> Optional[List[Keypoint]]:
        """
        Detect with world coordinates (metric, hip-origin).
        Better for angle accuracy when camera position varies.
        """
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False
        results = self.pose.process(rgb)

        if not results.pose_world_landmarks:
            return None

        keypoints = []
        for i, lm in enumerate(results.pose_world_landmarks.landmark):
            # World landmarks use visibility from regular landmarks
            vis = results.pose_landmarks.landmark[i].visibility if results.pose_landmarks else 1.0
            keypoints.append(Keypoint(
                name=LANDMARK_NAMES[i],
                x=lm.x,
                y=lm.y,
                z=lm.z,
                score=vis,
            ))

        return keypoints

    def keypoints_to_map(self, keypoints: List[Keypoint]) -> Dict[str, Keypoint]:
        return {kp.name: kp for kp in keypoints}

    def close(self):
        self.pose.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


def calculate_angle(
    a: Keypoint, b: Keypoint, c: Keypoint
) -> float:
    """
    Calculate angle at joint B formed by A-B-C in degrees.
    Uses 2D normalized coordinates.
    """
    ax, ay = a.x - b.x, a.y - b.y
    cx, cy = c.x - b.x, c.y - b.y

    dot = ax * cx + ay * cy
    mag_a = (ax**2 + ay**2) ** 0.5
    mag_c = (cx**2 + cy**2) ** 0.5

    if mag_a == 0 or mag_c == 0:
        return 0.0

    cos_angle = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
    import math
    return math.degrees(math.acos(cos_angle))


def calculate_angle_3d(
    a: Keypoint, b: Keypoint, c: Keypoint
) -> float:
    """
    3D angle calculation using xyz world coordinates.
    More accurate when z-depth is available (MediaPipe world landmarks).
    """
    import math
    ax, ay, az = a.x - b.x, a.y - b.y, a.z - b.z
    cx, cy, cz = c.x - b.x, c.y - b.y, c.z - b.z

    dot = ax * cx + ay * cy + az * cz
    mag_a = (ax**2 + ay**2 + az**2) ** 0.5
    mag_c = (cx**2 + cy**2 + cz**2) ** 0.5

    if mag_a == 0 or mag_c == 0:
        return 0.0

    cos_angle = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
    return math.degrees(math.acos(cos_angle))


def get_angle(
    kp_map: Dict[str, Keypoint],
    a: str, b: str, c: str,
    min_confidence: float = 0.3
) -> Optional[float]:
    """Get angle from landmark names. Returns None if any joint is not visible."""
    pa, pb, pc = kp_map.get(a), kp_map.get(b), kp_map.get(c)
    if not (pa and pb and pc):
        return None
    if any(p.score < min_confidence for p in [pa, pb, pc]):
        return None
    return calculate_angle(pa, pb, pc)