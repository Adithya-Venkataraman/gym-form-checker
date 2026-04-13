// src/services/voiceFeedback.ts
// Text-to-speech feedback during workouts
// Includes cooldown to prevent spam and priority queuing

import * as Speech from 'expo-speech';

type FeedbackPriority = 'safety' | 'form' | 'rep' | 'encouragement';

interface FeedbackItem {
  text: string;
  priority: FeedbackPriority;
  timestamp: number;
}

const COOLDOWNS: Record<FeedbackPriority, number> = {
  safety: 4000,
  form: 5000,
  rep: 1500,
  encouragement: 8000,
};

class VoiceFeedbackService {
  private enabled: boolean = true;
  private lastSpoken: Record<string, number> = {};
  private queue: FeedbackItem[] = [];
  private isSpeaking: boolean = false;

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      Speech.stop();
      this.queue = [];
    }
  }

  isEnabled() {
    return this.enabled;
  }

  /**
   * Queue feedback text with priority
   * Higher priority items jump the queue
   */
  speak(text: string, priority: FeedbackPriority = 'form') {
    if (!this.enabled) return;

    const now = Date.now();
    const cooldown = COOLDOWNS[priority];
    const lastTime = this.lastSpoken[text] ?? 0;

    // Respect per-message cooldown
    if (now - lastTime < cooldown) return;

    // Safety messages clear the queue
    if (priority === 'safety') {
      this.queue = [];
      Speech.stop();
    }

    this.queue.push({ text, priority, timestamp: now });
    this.lastSpoken[text] = now;

    // Sort by priority
    const priorityOrder: Record<FeedbackPriority, number> = {
      safety: 4, form: 3, rep: 2, encouragement: 1,
    };
    this.queue.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

    this.processQueue();
  }

  private async processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    const item = this.queue.shift()!;
    this.isSpeaking = true;

    try {
      await Speech.speak(item.text, {
        rate: 0.95,
        pitch: 1.0,
        language: 'en-US',
        onDone: () => {
          this.isSpeaking = false;
          this.processQueue();
        },
        onError: () => {
          this.isSpeaking = false;
          this.processQueue();
        },
      });
    } catch {
      this.isSpeaking = false;
    }
  }

  // Convenience methods
  announceRep(count: number) {
    this.speak(`${count}`, 'rep');
  }

  goodRep(message: string = 'Good rep!') {
    this.speak(message, 'rep');
  }

  formFeedback(message: string) {
    this.speak(message, 'form');
  }

  safetyAlert(message: string) {
    this.speak(message, 'safety');
  }

  encouragement(message: string) {
    this.speak(message, 'encouragement');
  }

  stop() {
    Speech.stop();
    this.queue = [];
    this.isSpeaking = false;
  }
}

export const voiceFeedback = new VoiceFeedbackService();