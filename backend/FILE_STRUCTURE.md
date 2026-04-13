EXERCISES["myexercise"] = ExerciseDefinition(
id="myexercise",
name="My Exercise",
preferred_view="side",
key_joints=["left_hip", "left_knee", "left_ankle"],
rep_logic=RepLogic("left_knee", ("left_hip","left_knee","left_ankle"), 110, 165, "decrease_to_down"),
primary_landmarks=("left_hip", "left_knee", "left_ankle"),
motion_range=60,
rules=[
AngleRule("left_knee", ("left_hip","left_knee","left_ankle"), "bottom",
"Your feedback here", "medium", min_angle=80),
],
)
