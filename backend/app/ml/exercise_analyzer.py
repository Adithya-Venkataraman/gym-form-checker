# backend/app/ml/exercise_analyzer.py
# Applies exercise-specific angle rules to detected keypoints

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass

from app.ml.pose_detector import Keypoint, get_angle


# ── Exercise rule definitions ──────────────────────────────────────────────────

@dataclass
class AngleRule:
    joint: str
    landmarks: Tuple[str, str, str]
    phase: str          # "top" | "bottom" | "any"
    feedback: str
    severity: str       # "low" | "medium" | "high"
    min_angle: Optional[float] = None
    max_angle: Optional[float] = None
    injury_warning: Optional[str] = None


@dataclass
class RepLogic:
    tracking_joint: str
    landmarks: Tuple[str, str, str]
    down_threshold: float
    up_threshold: float
    direction: str      # "decrease_to_down" | "increase_to_down"


@dataclass
class ExerciseDefinition:
    id: str
    name: str
    preferred_view: str
    key_joints: List[str]
    rep_logic: RepLogic
    rules: List[AngleRule]
    motion_range: float   # expected angle range for auto-detection
    primary_landmarks: Tuple[str, str, str]


EXERCISES: Dict[str, ExerciseDefinition] = {
    "squat": ExerciseDefinition(
        id="squat",
        name="Squat",
        preferred_view="side",
        key_joints=["left_hip", "left_knee", "left_ankle", "right_knee"],
        rep_logic=RepLogic("left_knee", ("left_hip", "left_knee", "left_ankle"), 100, 160, "decrease_to_down"),
        primary_landmarks=("left_hip", "left_knee", "left_ankle"),
        motion_range=65,
        rules=[
            AngleRule("left_knee", ("left_hip", "left_knee", "left_ankle"), "bottom",
                      "Go lower — aim for thighs parallel to floor", "medium", min_angle=70),
            AngleRule("left_hip", ("left_shoulder", "left_hip", "left_knee"), "any",
                      "Keep your back straight", "medium", min_angle=45, max_angle=115,
                      injury_warning="Excessive forward lean stresses your lower back"),
            AngleRule("right_knee", ("right_hip", "right_knee", "right_ankle"), "bottom",
                      "Knees collapsing inward — push them out", "high", min_angle=65,
                      injury_warning="Risk of knee strain — knees must track over toes"),
            AngleRule("left_knee", ("left_hip", "left_knee", "left_ankle"), "top",
                      "Fully extend at the top", "low", min_angle=155),
        ],
    ),
    "pushup": ExerciseDefinition(
        id="pushup",
        name="Push-up",
        preferred_view="side",
        key_joints=["left_shoulder", "left_elbow", "left_wrist", "left_hip"],
        rep_logic=RepLogic("left_elbow", ("left_shoulder", "left_elbow", "left_wrist"), 100, 155, "decrease_to_down"),
        primary_landmarks=("left_shoulder", "left_elbow", "left_wrist"),
        motion_range=55,
        rules=[
            AngleRule("left_elbow", ("left_shoulder", "left_elbow", "left_wrist"), "bottom",
                      "Lower your chest — elbows to 90 degrees", "medium", min_angle=80, max_angle=105),
            AngleRule("left_elbow", ("left_shoulder", "left_elbow", "left_wrist"), "top",
                      "Fully extend your arms at the top", "low", min_angle=150),
            AngleRule("left_hip", ("left_shoulder", "left_hip", "left_ankle"), "any",
                      "Keep your body in a straight line — brace your core", "high", min_angle=160,
                      injury_warning="Hip sag increases lower back injury risk"),
            AngleRule("left_shoulder", ("left_elbow", "left_shoulder", "left_hip"), "any",
                      "Elbows flaring too wide — tuck them in slightly", "medium", min_angle=40, max_angle=80),
        ],
    ),
    "deadlift": ExerciseDefinition(
        id="deadlift",
        name="Deadlift",
        preferred_view="side",
        key_joints=["left_shoulder", "left_hip", "left_knee", "left_ankle"],
        rep_logic=RepLogic("left_hip", ("left_shoulder", "left_hip", "left_knee"), 80, 155, "decrease_to_down"),
        primary_landmarks=("left_shoulder", "left_hip", "left_knee"),
        motion_range=75,
        rules=[
            AngleRule("left_shoulder", ("left_ear", "left_shoulder", "left_hip"), "any",
                      "Keep your spine neutral — avoid rounding your back", "high", min_angle=158,
                      injury_warning="STOP — rounded back under load risks disc herniation"),
            AngleRule("left_hip", ("left_shoulder", "left_hip", "left_knee"), "bottom",
                      "Hinge further at the hips — push hips back", "medium", max_angle=90),
            AngleRule("left_knee", ("left_hip", "left_knee", "left_ankle"), "top",
                      "Lock your knees fully at the top", "low", min_angle=150),
        ],
    ),
    "lunge": ExerciseDefinition(
        id="lunge",
        name="Lunge",
        preferred_view="side",
        key_joints=["left_hip", "left_knee", "left_ankle", "right_knee"],
        rep_logic=RepLogic("left_knee", ("left_hip", "left_knee", "left_ankle"), 100, 160, "decrease_to_down"),
        primary_landmarks=("left_hip", "left_knee", "left_ankle"),
        motion_range=60,
        rules=[
            AngleRule("left_knee", ("left_hip", "left_knee", "left_ankle"), "bottom",
                      "Bend front knee to 90 degrees", "medium", min_angle=80, max_angle=105,
                      injury_warning="Front knee past toes increases knee strain risk"),
            AngleRule("left_hip", ("left_shoulder", "left_hip", "left_knee"), "any",
                      "Keep your torso upright", "medium", min_angle=145),
        ],
    ),
    "plank": ExerciseDefinition(
        id="plank",
        name="Plank",
        preferred_view="side",
        key_joints=["left_shoulder", "left_hip", "left_ankle"],
        rep_logic=RepLogic("left_hip", ("left_shoulder", "left_hip", "left_ankle"), 170, 170, "decrease_to_down"),
        primary_landmarks=("left_shoulder", "left_hip", "left_ankle"),
        motion_range=15,
        rules=[
            AngleRule("left_hip", ("left_shoulder", "left_hip", "left_ankle"), "any",
                      "Keep your body in a straight line — hips level", "high", min_angle=160,
                      injury_warning="Hip sag or piking stresses the lower back"),
        ],
    ),
}


# ── Form Analysis ──────────────────────────────────────────────────────────────

@dataclass
class Violation:
    joint: str
    angle: float
    feedback: str
    severity: str
    injury_warning: Optional[str] = None
    frame_index: int = 0
    timestamp_seconds: float = 0.0


@dataclass
class FrameAnalysisResult:
    violations: List[Violation]
    form_score: float
    phase: str


def analyze_frame(
    kp_map: Dict[str, Keypoint],
    exercise: ExerciseDefinition,
    phase: str = "any",
    frame_index: int = 0,
    fps: float = 30.0,
) -> FrameAnalysisResult:
    """
    Apply all angle rules for an exercise to a single frame's keypoints.
    Returns violations found and overall form score.
    """
    violations: List[Violation] = []

    for rule in exercise.rules:
        if rule.phase != "any" and rule.phase != phase:
            continue

        angle = get_angle(kp_map, rule.landmarks[0], rule.landmarks[1], rule.landmarks[2])
        if angle is None:
            continue

        min_ok = rule.min_angle is None or angle >= rule.min_angle
        max_ok = rule.max_angle is None or angle <= rule.max_angle

        if not min_ok or not max_ok:
            violations.append(Violation(
                joint=rule.joint,
                angle=round(angle, 1),
                feedback=rule.feedback,
                severity=rule.severity,
                injury_warning=rule.injury_warning,
                frame_index=frame_index,
                timestamp_seconds=round(frame_index / fps, 2),
            ))

    # Score: 100 minus deductions per severity
    deductions = {"low": 5, "medium": 15, "high": 30}
    score = 100.0 - sum(deductions.get(v.severity, 0) for v in violations)
    score = max(0.0, min(100.0, score))

    return FrameAnalysisResult(violations=violations, form_score=score, phase=phase)


# ── Rep Counting ───────────────────────────────────────────────────────────────

class RepCounter:
    """
    Stateful rep counter for a single video processing pass.
    Uses angle thresholds and crossing detection.
    """

    def __init__(self, rep_logic: RepLogic):
        self.logic = rep_logic
        self.count = 0
        self.phase = "idle"
        self._down_crossed = False
        self._angle_history: List[float] = []

    def process(self, kp_map: Dict[str, Keypoint]) -> Tuple[int, str, bool]:
        """
        Process one frame. Returns (rep_count, current_phase, is_new_rep).
        """
        angle = get_angle(
            kp_map,
            self.logic.landmarks[0],
            self.logic.landmarks[1],
            self.logic.landmarks[2],
        )
        if angle is None:
            return self.count, self.phase, False

        # Rolling smoothing (3-frame window)
        self._angle_history.append(angle)
        if len(self._angle_history) > 3:
            self._angle_history.pop(0)
        smooth = sum(self._angle_history) / len(self._angle_history)

        is_new_rep = False
        d = self.logic

        if d.direction == "decrease_to_down":
            if smooth > d.up_threshold:
                if self.phase in ("going_up", "bottom") and self._down_crossed:
                    self.count += 1
                    is_new_rep = True
                    self._down_crossed = False
                self.phase = "top"
            elif smooth < d.down_threshold:
                self._down_crossed = True
                self.phase = "bottom"
            else:
                if len(self._angle_history) >= 2:
                    trend = self._angle_history[-1] - self._angle_history[0]
                    self.phase = "going_down" if trend < 0 else "going_up"
        else:  # increase_to_down
            if smooth < d.down_threshold:
                if self.phase in ("going_up", "bottom") and self._down_crossed:
                    self.count += 1
                    is_new_rep = True
                    self._down_crossed = False
                self.phase = "top"
            elif smooth > d.up_threshold:
                self._down_crossed = True
                self.phase = "bottom"
            else:
                if len(self._angle_history) >= 2:
                    trend = self._angle_history[-1] - self._angle_history[0]
                    self.phase = "going_down" if trend > 0 else "going_up"

        return self.count, self.phase, is_new_rep


# ── Auto Exercise Detection ────────────────────────────────────────────────────

class ExerciseAutoDetector:
    """
    Identifies exercise type from the angle motion range over a buffer window.
    Used when no exercise hint is provided by the client.
    """

    def __init__(self, buffer_frames: int = 90):
        self._buffer = buffer_frames
        self._history: Dict[str, List[float]] = {eid: [] for eid in EXERCISES}

    def process_frame(self, kp_map: Dict[str, Keypoint]) -> None:
        for eid, ex in EXERCISES.items():
            angle = get_angle(kp_map, *ex.primary_landmarks)
            if angle is None:
                continue
            buf = self._history[eid]
            buf.append(angle)
            if len(buf) > self._buffer:
                buf.pop(0)

    def detect(self) -> Tuple[Optional[str], float]:
        """Returns (exercise_id, confidence) or (None, 0) if undecided."""
        scores: Dict[str, float] = {}

        for eid, ex in EXERCISES.items():
            buf = self._history[eid]
            if len(buf) < 30:
                continue
            observed_range = max(buf) - min(buf)
            expected_range = ex.motion_range

            # Score: how close is observed range to expected?
            range_score = max(0.0, 1.0 - abs(observed_range - expected_range) / max(expected_range, 1))
            scores[eid] = range_score

        if not scores:
            return None, 0.0

        best = max(scores, key=lambda k: scores[k])
        confidence = scores[best]

        if confidence > 0.45:
            return best, round(confidence, 3)
        return None, 0.0


# ── Suggestions ────────────────────────────────────────────────────────────────

def generate_suggestions(
    exercise_id: str,
    violations: List[Violation],
    rep_count: int,
    form_score: float,
) -> List[str]:
    """Generate human-readable suggestions based on observed violations."""
    suggestions: List[str] = []

    if not violations:
        if form_score >= 90:
            suggestions.append("Excellent form — keep it up!")
        else:
            suggestions.append("Good session — maintain this consistency")
        return suggestions

    # Group by joint, take most frequent violation
    freq: Dict[str, int] = {}
    for v in violations:
        freq[v.joint] = freq.get(v.joint, 0) + 1

    most_common = sorted(freq.items(), key=lambda x: x[1], reverse=True)

    # Map joints to actionable suggestions
    suggestion_map: Dict[str, str] = {
        "left_knee": "Focus on reaching full depth on every rep",
        "right_knee": "Practice knee-out cues — use a resistance band to reinforce",
        "left_hip": "Work on thoracic mobility and ankle flexibility to improve torso uprightness",
        "left_shoulder": "Film yourself from the side to check your spine alignment",
        "left_elbow": "Use a mirror to ensure your elbows reach 90° at the bottom",
        "left_hip_plank": "Brace your abs and glutes throughout — think 'ribs to hips'",
    }

    seen = set()
    for joint, _ in most_common[:3]:
        s = suggestion_map.get(joint)
        if s and s not in seen:
            suggestions.append(s)
            seen.add(s)

    if rep_count > 0 and form_score < 60:
        suggestions.append(f"Consider reducing reps and focusing on quality — aim for fewer perfect reps")

    if any(v.injury_warning for v in violations if v.severity == "high"):
        suggestions.append("Address the critical form issues before increasing weight or volume")

    return suggestions[:5]