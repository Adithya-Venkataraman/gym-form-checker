// src/services/workoutStorage.ts
// Local workout history using expo-sqlite
// Works fully offline, syncs to backend when available

import * as SQLite from 'expo-sqlite';
import { FormMistake } from './api';

export interface LocalWorkout {
  id?: number;
  exercise: string;
  rep_count: number;
  form_score: number;
  duration_seconds: number;
  mistakes: FormMistake[];
  created_at: string;
  synced: boolean;
}

export interface WorkoutStats {
  totalWorkouts: number;
  totalReps: number;
  avgFormScore: number;
  bestFormScore: number;
  mostFrequentExercise: string;
  recentImprovement: number; // % change in form score last 5 sessions
}

class WorkoutStorage {
  private db: SQLite.SQLiteDatabase | null = null;

  async init(): Promise<void> {
    this.db = await SQLite.openDatabaseAsync('gymform.db');

    await this.db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exercise TEXT NOT NULL,
        rep_count INTEGER NOT NULL DEFAULT 0,
        form_score REAL NOT NULL DEFAULT 0,
        duration_seconds REAL NOT NULL DEFAULT 0,
        mistakes TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_workouts_exercise ON workouts(exercise);
      CREATE INDEX IF NOT EXISTS idx_workouts_created_at ON workouts(created_at);
    `);
  }

  private ensureDb(): SQLite.SQLiteDatabase {
    if (!this.db) throw new Error('Database not initialized — call init() first');
    return this.db;
  }

  async saveWorkout(workout: Omit<LocalWorkout, 'id'>): Promise<number> {
    const db = this.ensureDb();
    const result = await db.runAsync(
      `INSERT INTO workouts (exercise, rep_count, form_score, duration_seconds, mistakes, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        workout.exercise,
        workout.rep_count,
        workout.form_score,
        workout.duration_seconds,
        JSON.stringify(workout.mistakes),
        workout.created_at || new Date().toISOString(),
        workout.synced ? 1 : 0,
      ]
    );
    return result.lastInsertRowId;
  }

  async getWorkouts(limit: number = 50): Promise<LocalWorkout[]> {
    const db = this.ensureDb();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM workouts ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
    return rows.map(row => ({
      ...row,
      mistakes: JSON.parse(row.mistakes || '[]'),
      synced: Boolean(row.synced),
    }));
  }

  async getWorkoutsByExercise(exercise: string): Promise<LocalWorkout[]> {
    const db = this.ensureDb();
    const rows = await db.getAllAsync<any>(
      'SELECT * FROM workouts WHERE exercise = ? ORDER BY created_at DESC LIMIT 20',
      [exercise]
    );
    return rows.map(row => ({
      ...row,
      mistakes: JSON.parse(row.mistakes || '[]'),
      synced: Boolean(row.synced),
    }));
  }

  async getStats(): Promise<WorkoutStats> {
    const db = this.ensureDb();

    const totals = await db.getFirstAsync<any>(
      'SELECT COUNT(*) as count, SUM(rep_count) as reps, AVG(form_score) as avgScore, MAX(form_score) as bestScore FROM workouts'
    );

    const mostFrequent = await db.getFirstAsync<any>(
      'SELECT exercise, COUNT(*) as c FROM workouts GROUP BY exercise ORDER BY c DESC LIMIT 1'
    );

    // Recent trend: compare last 5 sessions to previous 5
    const recent = await db.getAllAsync<any>(
      'SELECT form_score FROM workouts ORDER BY created_at DESC LIMIT 10'
    );
    let improvement = 0;
    if (recent.length >= 10) {
      const last5 = recent.slice(0, 5).reduce((s: number, r: any) => s + r.form_score, 0) / 5;
      const prev5 = recent.slice(5).reduce((s: number, r: any) => s + r.form_score, 0) / 5;
      improvement = prev5 > 0 ? ((last5 - prev5) / prev5) * 100 : 0;
    }

    return {
      totalWorkouts: totals?.count ?? 0,
      totalReps: totals?.reps ?? 0,
      avgFormScore: Math.round(totals?.avgScore ?? 0),
      bestFormScore: Math.round(totals?.bestScore ?? 0),
      mostFrequentExercise: mostFrequent?.exercise ?? '-',
      recentImprovement: Math.round(improvement),
    };
  }

  async getSetting(key: string): Promise<string | null> {
    const db = this.ensureDb();
    const row = await db.getFirstAsync<any>(
      'SELECT value FROM user_settings WHERE key = ?',
      [key]
    );
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = this.ensureDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO user_settings (key, value) VALUES (?, ?)',
      [key, value]
    );
  }

  async deleteWorkout(id: number): Promise<void> {
    const db = this.ensureDb();
    await db.runAsync('DELETE FROM workouts WHERE id = ?', [id]);
  }

  async clearAll(): Promise<void> {
    const db = this.ensureDb();
    await db.runAsync('DELETE FROM workouts');
  }
}

export const workoutStorage = new WorkoutStorage();