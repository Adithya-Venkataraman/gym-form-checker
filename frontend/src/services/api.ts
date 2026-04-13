// src/services/api.ts
// Backend API client for video upload and results retrieval

import axios, { AxiosInstance } from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

export interface UploadVideoResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  message: string;
}

export interface FormMistake {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  frames: number[];
  timestamp_seconds: number[];
}

export interface VideoAnalysisResult {
  job_id: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  exercise: string | null;
  exercise_confidence: number;
  rep_count: number;
  form_score: number;          // 0-100
  mistakes: FormMistake[];
  suggestions: string[];
  duration_seconds: number;
  keypoints_per_frame?: any[]; // sparse — for overlay replay
  thumbnail_url?: string;
  processing_time_ms?: number;
}

export interface WorkoutHistory {
  id: string;
  user_id?: string;
  exercise: string;
  rep_count: number;
  form_score: number;
  duration_seconds: number;
  created_at: string;
  mistakes_count: number;
}

export interface ExerciseInfo {
  id: string;
  name: string;
  preferred_view: string;
  key_joints: string[];
}

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: `${BASE_URL}/api/v1`,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Add auth token to requests
    this.client.interceptors.request.use(config => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });

    // Handle errors
    this.client.interceptors.response.use(
      res => res,
      err => {
        const message = err.response?.data?.detail || err.message;
        return Promise.reject(new Error(message));
      }
    );
  }

  setToken(token: string | null) {
    this.token = token;
  }

  // ---- Video Analysis ----

  async uploadVideo(
    fileUri: string,
    exercise?: string,
    onProgress?: (percent: number) => void
  ): Promise<UploadVideoResponse> {
    const formData = new FormData();

    // Expo file upload format
    formData.append('file', {
      uri: fileUri,
      name: 'workout.mp4',
      type: 'video/mp4',
    } as any);

    if (exercise) {
      formData.append('exercise_hint', exercise);
    }

    const res = await this.client.post<UploadVideoResponse>(
      '/upload-video',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => {
          if (e.total && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        },
        timeout: 120000, // 2 min for large files
      }
    );
    return res.data;
  }

  async getResults(jobId: string): Promise<VideoAnalysisResult> {
    const res = await this.client.get<VideoAnalysisResult>(`/results/${jobId}`);
    return res.data;
  }

  async pollResults(
    jobId: string,
    intervalMs: number = 2000,
    timeoutMs: number = 120000
  ): Promise<VideoAnalysisResult> {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error('Analysis timed out'));
          return;
        }

        try {
          const result = await this.getResults(jobId);
          if (result.status === 'complete') {
            resolve(result);
          } else if (result.status === 'failed') {
            reject(new Error('Analysis failed on server'));
          } else {
            setTimeout(poll, intervalMs);
          }
        } catch (err) {
          reject(err);
        }
      };

      poll();
    });
  }

  // ---- Single Frame Analysis (fallback) ----

  async analyzeFrame(
    base64Frame: string,
    exerciseId?: string
  ): Promise<{ keypoints: any[]; violations: any[] }> {
    const res = await this.client.post('/analyze-frame', {
      image: base64Frame,
      exercise: exerciseId,
    });
    return res.data;
  }

  // ---- Exercises ----

  async getExercises(): Promise<ExerciseInfo[]> {
    const res = await this.client.get<ExerciseInfo[]>('/exercises');
    return res.data;
  }

  // ---- History ----

  async getHistory(limit: number = 20): Promise<WorkoutHistory[]> {
    const res = await this.client.get<WorkoutHistory[]>('/history', {
      params: { limit },
    });
    return res.data;
  }

  async saveWorkout(data: {
    exercise: string;
    rep_count: number;
    form_score: number;
    duration_seconds: number;
    mistakes: FormMistake[];
  }): Promise<WorkoutHistory> {
    const res = await this.client.post<WorkoutHistory>('/history', data);
    return res.data;
  }

  // ---- Auth ----

  async register(email: string, password: string): Promise<{ access_token: string }> {
    const res = await this.client.post('/auth/register', { email, password });
    this.setToken(res.data.access_token);
    return res.data;
  }

  async login(email: string, password: string): Promise<{ access_token: string }> {
    const res = await this.client.post('/auth/login', { email, password });
    this.setToken(res.data.access_token);
    return res.data;
  }

  logout() {
    this.setToken(null);
  }

  // ---- Health ----

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

export const api = new ApiService();