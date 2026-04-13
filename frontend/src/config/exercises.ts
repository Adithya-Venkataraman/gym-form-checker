// src/config/exercises.ts
// Modular exercise configuration system — add new exercises here

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type CameraView = 'side' | 'front' | 'any';

export interface AngleRule {
  joint: string;           // e.g. "left_knee"
  landmarks: [string, string, string]; // three points forming the angle
  min?: number;            // minimum acceptable angle (degrees)
  max?: number;            // maximum acceptable angle
  phase: 'bottom' | 'top' | 'any';
  feedback: string;        // message shown when violated
  severity: 'low' | 'medium' | 'high';
  injuryWarning?: string;  // shown as safety alert
}

export interface RepLogic {
  trackingJoint: string;   // joint whose angle we monitor
  landmarks: [string, string, string];
  downThreshold: number;   // angle = "down" position
  upThreshold: number;     // angle = "up" position
  direction: 'decrease_to_down' | 'increase_to_down';
}

export interface ExerciseConfig {
  id: string;
  name: string;
  aliases: string[];       // for auto-detection matching
  preferredView: CameraView;
  viewWarning?: string;    // shown if wrong view detected
  keyJoints: string[];     // joints required to be visible
  repLogic: RepLogic;
  angleRules: {
    beginner: AngleRule[];
    intermediate: AngleRule[];
    advanced: AngleRule[];
  };
  autoDetectionPattern: {
    primaryJoint: string;
    landmarks: [string, string, string];
    motionRange: number;   // how much the angle must change to trigger detection
    minReps: number;       // reps to confirm exercise type
  };
  feedbackMessages: {
    goodRep: string[];
    encouragement: string[];
  };
}

export const EXERCISES: Record<string, ExerciseConfig> = {
  squat: {
    id: 'squat',
    name: 'Squat',
    aliases: ['bodyweight squat', 'air squat', 'back squat'],
    preferredView: 'side',
    viewWarning: 'Side view gives better form feedback for squats',
    keyJoints: ['left_hip', 'left_knee', 'left_ankle', 'right_hip', 'right_knee', 'right_ankle'],
    repLogic: {
      trackingJoint: 'left_knee',
      landmarks: ['left_hip', 'left_knee', 'left_ankle'],
      downThreshold: 100,   // knee angle at bottom
      upThreshold: 160,     // knee angle at top (standing)
      direction: 'decrease_to_down',
    },
    angleRules: {
      beginner: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 80,
          phase: 'bottom',
          feedback: 'Go a bit lower for full range',
          severity: 'low',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 50,
          max: 120,
          phase: 'any',
          feedback: 'Keep your chest up and back straight',
          severity: 'medium',
          injuryWarning: 'Excessive forward lean puts stress on your lower back',
        },
      ],
      intermediate: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 70,
          phase: 'bottom',
          feedback: 'Go lower — aim for parallel or below',
          severity: 'medium',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 45,
          max: 110,
          phase: 'any',
          feedback: 'Keep your torso more upright',
          severity: 'medium',
        },
        {
          joint: 'right_knee',
          landmarks: ['right_hip', 'right_knee', 'right_ankle'],
          min: 70,
          phase: 'bottom',
          feedback: 'Knees collapsing inward — push them out',
          severity: 'high',
          injuryWarning: 'Risk of knee strain — knees should track over toes',
        },
      ],
      advanced: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 60,
          phase: 'bottom',
          feedback: 'Not reaching full depth',
          severity: 'medium',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 40,
          max: 100,
          phase: 'any',
          feedback: 'Maintain an upright torso',
          severity: 'high',
        },
      ],
    },
    autoDetectionPattern: {
      primaryJoint: 'left_knee',
      landmarks: ['left_hip', 'left_knee', 'left_ankle'],
      motionRange: 60,
      minReps: 2,
    },
    feedbackMessages: {
      goodRep: ['Great rep!', 'Perfect depth!', 'Solid form!'],
      encouragement: ['Keep going!', 'You\'ve got this!', 'Stay strong!'],
    },
  },

  pushup: {
    id: 'pushup',
    name: 'Push-up',
    aliases: ['push up', 'press up'],
    preferredView: 'side',
    viewWarning: 'Side view is essential for push-up form analysis',
    keyJoints: ['left_shoulder', 'left_elbow', 'left_wrist', 'left_hip', 'left_knee'],
    repLogic: {
      trackingJoint: 'left_elbow',
      landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
      downThreshold: 100,
      upThreshold: 155,
      direction: 'decrease_to_down',
    },
    angleRules: {
      beginner: [
        {
          joint: 'left_elbow',
          landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
          min: 80,
          max: 110,
          phase: 'bottom',
          feedback: 'Lower your chest closer to the floor',
          severity: 'low',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 160,
          phase: 'any',
          feedback: 'Keep your body in a straight line',
          severity: 'medium',
          injuryWarning: 'Sagging hips put stress on your lower back',
        },
      ],
      intermediate: [
        {
          joint: 'left_elbow',
          landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
          min: 85,
          max: 100,
          phase: 'bottom',
          feedback: 'Get your elbows to 90 degrees at the bottom',
          severity: 'medium',
        },
        {
          joint: 'left_elbow',
          landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
          min: 155,
          phase: 'top',
          feedback: 'Fully extend your arms at the top',
          severity: 'low',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 165,
          phase: 'any',
          feedback: 'Hips sagging — brace your core',
          severity: 'high',
          injuryWarning: 'Hip sag increases lower back injury risk',
        },
      ],
      advanced: [
        {
          joint: 'left_elbow',
          landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
          min: 88,
          max: 95,
          phase: 'bottom',
          feedback: 'Precisely 90 degrees at the bottom',
          severity: 'medium',
        },
        {
          joint: 'left_shoulder',
          landmarks: ['left_elbow', 'left_shoulder', 'left_hip'],
          min: 55,
          max: 75,
          phase: 'any',
          feedback: 'Elbows flaring too wide — tuck them in',
          severity: 'medium',
        },
      ],
    },
    autoDetectionPattern: {
      primaryJoint: 'left_elbow',
      landmarks: ['left_shoulder', 'left_elbow', 'left_wrist'],
      motionRange: 50,
      minReps: 2,
    },
    feedbackMessages: {
      goodRep: ['Clean rep!', 'Perfect form!', 'Nice push!'],
      encouragement: ['Push through it!', 'Stay tight!', 'Core engaged!'],
    },
  },

  deadlift: {
    id: 'deadlift',
    name: 'Deadlift',
    aliases: ['romanian deadlift', 'rdl', 'conventional deadlift'],
    preferredView: 'side',
    viewWarning: 'Side view is critical for deadlift spine analysis',
    keyJoints: ['left_shoulder', 'left_hip', 'left_knee', 'left_ankle'],
    repLogic: {
      trackingJoint: 'left_hip',
      landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
      downThreshold: 80,
      upThreshold: 155,
      direction: 'decrease_to_down',
    },
    angleRules: {
      beginner: [
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 30,
          max: 90,
          phase: 'bottom',
          feedback: 'Hinge more at the hips',
          severity: 'low',
        },
        {
          joint: 'left_shoulder',
          landmarks: ['left_ear', 'left_shoulder', 'left_hip'],
          min: 160,
          phase: 'any',
          feedback: 'Keep your spine neutral — no rounding',
          severity: 'high',
          injuryWarning: 'Rounded back during deadlift risks disc herniation',
        },
      ],
      intermediate: [
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          max: 85,
          phase: 'bottom',
          feedback: 'Push hips back further',
          severity: 'medium',
        },
        {
          joint: 'left_shoulder',
          landmarks: ['left_ear', 'left_shoulder', 'left_hip'],
          min: 165,
          phase: 'any',
          feedback: 'Back rounding — keep neutral spine',
          severity: 'high',
          injuryWarning: 'STOP — back posture is unsafe. Risk of injury.',
        },
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 150,
          phase: 'top',
          feedback: 'Lock your knees at the top',
          severity: 'low',
        },
      ],
      advanced: [
        {
          joint: 'left_shoulder',
          landmarks: ['left_ear', 'left_shoulder', 'left_hip'],
          min: 168,
          phase: 'any',
          feedback: 'Maintain perfectly neutral spine throughout',
          severity: 'high',
          injuryWarning: 'Spinal flexion under load is dangerous',
        },
      ],
    },
    autoDetectionPattern: {
      primaryJoint: 'left_hip',
      landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
      motionRange: 70,
      minReps: 2,
    },
    feedbackMessages: {
      goodRep: ['Strong lift!', 'Perfect hinge!', 'Great form!'],
      encouragement: ['Drive those hips!', 'Keep that spine tight!'],
    },
  },

  lunge: {
    id: 'lunge',
    name: 'Lunge',
    aliases: ['forward lunge', 'reverse lunge', 'walking lunge'],
    preferredView: 'side',
    keyJoints: ['left_hip', 'left_knee', 'left_ankle', 'right_hip', 'right_knee'],
    repLogic: {
      trackingJoint: 'left_knee',
      landmarks: ['left_hip', 'left_knee', 'left_ankle'],
      downThreshold: 100,
      upThreshold: 160,
      direction: 'decrease_to_down',
    },
    angleRules: {
      beginner: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 80,
          max: 100,
          phase: 'bottom',
          feedback: 'Bend front knee to 90 degrees',
          severity: 'low',
        },
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_knee'],
          min: 150,
          phase: 'any',
          feedback: 'Keep your torso upright',
          severity: 'medium',
        },
      ],
      intermediate: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 85,
          max: 95,
          phase: 'bottom',
          feedback: 'Precisely 90 degrees on front knee',
          severity: 'medium',
          injuryWarning: 'Front knee past toes increases knee strain',
        },
      ],
      advanced: [
        {
          joint: 'left_knee',
          landmarks: ['left_hip', 'left_knee', 'left_ankle'],
          min: 88,
          max: 95,
          phase: 'bottom',
          feedback: 'Perfect 90 degree knee angle',
          severity: 'medium',
        },
      ],
    },
    autoDetectionPattern: {
      primaryJoint: 'left_knee',
      landmarks: ['left_hip', 'left_knee', 'left_ankle'],
      motionRange: 55,
      minReps: 2,
    },
    feedbackMessages: {
      goodRep: ['Clean lunge!', 'Great depth!'],
      encouragement: ['Balance and control!', 'Keep stepping!'],
    },
  },

  plank: {
    id: 'plank',
    name: 'Plank',
    aliases: ['front plank', 'forearm plank'],
    preferredView: 'side',
    keyJoints: ['left_shoulder', 'left_hip', 'left_knee', 'left_ankle'],
    repLogic: {
      // Plank is time-based, not rep-based — use a dummy logic
      trackingJoint: 'left_hip',
      landmarks: ['left_shoulder', 'left_hip', 'left_ankle'],
      downThreshold: 170,
      upThreshold: 170,
      direction: 'decrease_to_down',
    },
    angleRules: {
      beginner: [
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_ankle'],
          min: 160,
          phase: 'any',
          feedback: 'Keep your body in a straight line',
          severity: 'medium',
        },
      ],
      intermediate: [
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_ankle'],
          min: 165,
          phase: 'any',
          feedback: 'Hips drifting — brace your core',
          severity: 'high',
          injuryWarning: 'Hip sag or piking stresses lower back',
        },
      ],
      advanced: [
        {
          joint: 'left_hip',
          landmarks: ['left_shoulder', 'left_hip', 'left_ankle'],
          min: 168,
          phase: 'any',
          feedback: 'Maintain a perfectly rigid plank position',
          severity: 'high',
        },
      ],
    },
    autoDetectionPattern: {
      primaryJoint: 'left_hip',
      landmarks: ['left_shoulder', 'left_hip', 'left_ankle'],
      motionRange: 15,  // low motion = static hold
      minReps: 1,
    },
    feedbackMessages: {
      goodRep: ['Hold it!', 'Perfect alignment!'],
      encouragement: ['Breathe steadily!', 'Almost there!'],
    },
  },
};

export const EXERCISE_LIST = Object.values(EXERCISES);

export function getExercise(id: string): ExerciseConfig | undefined {
  return EXERCISES[id];
}

export function getAngleRules(exerciseId: string, difficulty: Difficulty): AngleRule[] {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return [];
  return exercise.angleRules[difficulty] || exercise.angleRules.beginner;
}