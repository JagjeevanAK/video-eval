export type AIProvider = 'openai' | 'claude' | 'gemini' | 'openrouter' | 'groq';

export interface RubricCriteria {
  name: string;
  description?: string;
  maxScore?: number;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  aiProvider: AIProvider;
  aiApiKey: string;
  aiModel?: string;
  driveFolderId: string;
  driveFolderName: string;
  rubrics: RubricCriteria[];
  evaluationPrompt: string;
  spreadsheetId?: string;
  createdAt: number;
  status: 'idle' | 'processing' | 'completed' | 'error';
}

export interface VideoFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  webViewLink?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  scores?: Record<string, number>;
  descriptions?: Record<string, string>;
  error?: string;
}

export interface EvaluationResult {
  videoName: string;
  scores: Record<string, number>;
  feedback?: string;
}

export interface GoogleAuthState {
  isAuthenticated: boolean;
  accessToken: string | null;
  userEmail: string | null;
  userName: string | null;
  userPhoto: string | null;
}
