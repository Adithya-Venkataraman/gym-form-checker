# ml/utils/angle_utils.py
# Pure-Python geometry helpers (no OpenCV dependency)
# Usable in scripts, notebooks, and unit tests without the full backend stack

import math
from typing import Tuple, Optional, Dict, Any


Point2D = Tuple[float, float]
Point3D = Tuple[float, float, float]


def angle_2d(a: Point2D, b: Point2D, c: Point2D) -> float:
    """
    Calculate the angle at point B formed by A-B-C in 2D (degrees).

    >>> round(angle_2d((0,1), (0,0), (1,0)), 1)
    90.0
    """
    ax, ay = a[0] - b[0], a[1] - b[1]
    cx, cy = c[0] - b[0], c[1] - b[1]

    dot = ax * cx + ay * cy
    mag_a = math.sqrt(ax**2 + ay**2)
    mag_c = math.sqrt(cx**2 + cy**2)

    if mag_a == 0 or mag_c == 0:
        return 0.0

    cos_val = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
    return math.degrees(math.acos(cos_val))


def angle_3d(a: Point3D, b: Point3D, c: Point3D) -> float:
    """
    Calculate the angle at point B formed by A-B-C in 3D (degrees).
    Uses MediaPipe world coordinates for higher accuracy.

    >>> round(angle_3d((0,1,0), (0,0,0), (1,0,0)), 1)
    90.0
    """
    ax, ay, az = a[0]-b[0], a[1]-b[1], a[2]-b[2]
    cx, cy, cz = c[0]-b[0], c[1]-b[1], c[2]-b[2]

    dot = ax*cx + ay*cy + az*cz
    mag_a = math.sqrt(ax**2 + ay**2 + az**2)
    mag_c = math.sqrt(cx**2 + cy**2 + cz**2)

    if mag_a == 0 or mag_c == 0:
        return 0.0

    cos_val = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
    return math.degrees(math.acos(cos_val))


def check_angle_rule(
    angle: float,
    min_angle: Optional[float] = None,
    max_angle: Optional[float] = None,
) -> bool:
    """Return True if angle passes the rule (within bounds)."""
    if min_angle is not None and angle < min_angle:
        return False
    if max_angle is not None and angle > max_angle:
        return False
    return True


def normalize_keypoints(
    raw_keypoints: list,
    frame_width: int,
    frame_height: int,
) -> list:
    """
    Convert pixel-space keypoints to normalized [0,1] coordinates.

    Args:
        raw_keypoints: list of dicts with 'x', 'y' keys in pixel space
        frame_width: frame width in pixels
        frame_height: frame height in pixels

    Returns:
        List of dicts with normalized 'x', 'y' in [0, 1]
    """
    normalized = []
    for kp in raw_keypoints:
        normalized.append({
            **kp,
            "x": kp["x"] / frame_width,
            "y": kp["y"] / frame_height,
        })
    return normalized


def smooth_keypoints(
    current: Dict[str, Any],
    previous: Optional[Dict[str, Any]],
    alpha: float = 0.6,
) -> Dict[str, Any]:
    """
    Apply exponential moving average smoothing to keypoints.
    Reduces jitter in real-time detection.

    alpha: smoothing factor — higher means less smoothing (0.0–1.0)
    """
    if previous is None:
        return current

    smoothed = {}
    for name, kp in current.items():
        prev_kp = previous.get(name)
        if prev_kp is None:
            smoothed[name] = kp
        else:
            smoothed[name] = {
                **kp,
                "x": alpha * kp["x"] + (1 - alpha) * prev_kp["x"],
                "y": alpha * kp["y"] + (1 - alpha) * prev_kp["y"],
            }
    return smoothed


def midpoint(a: Point2D, b: Point2D) -> Point2D:
    """Return midpoint between two 2D points."""
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def distance_2d(a: Point2D, b: Point2D) -> float:
    """Euclidean distance between two 2D points."""
    return math.sqrt((a[0] - b[0])**2 + (a[1] - b[1])**2)


def body_height_normalized(kp_map: Dict[str, Any]) -> Optional[float]:
    """
    Estimate normalized body height from nose to ankle.
    Returns None if required landmarks are missing.
    """
    nose = kp_map.get("nose")
    left_ankle = kp_map.get("left_ankle")
    right_ankle = kp_map.get("right_ankle")

    if not nose:
        return None

    ankle = left_ankle or right_ankle
    if not ankle:
        return None

    return abs(ankle["y"] - nose["y"])


if __name__ == "__main__":
    import doctest
    doctest.testmod(verbose=True)