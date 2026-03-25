import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { GoogleAuthState, Room, VideoFile } from "@/types";

interface AppState {
  // Google Auth
  auth: GoogleAuthState;
  setAuth: (auth: Partial<GoogleAuthState>) => void;
  clearAuth: () => void;

  // Rooms
  rooms: Room[];
  addRoom: (room: Room) => void;
  updateRoom: (id: string, updates: Partial<Room>) => void;
  deleteRoom: (id: string) => void;

  // Videos per room
  roomVideos: Record<string, VideoFile[]>;
  setRoomVideos: (roomId: string, videos: VideoFile[]) => void;
  updateVideo: (roomId: string, videoId: string, updates: Partial<VideoFile>) => void;
}

const defaultAuth: GoogleAuthState = {
  isAuthenticated: false,
  accessToken: null,
  userEmail: null,
  userName: null,
  userPhoto: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      auth: defaultAuth,
      setAuth: (auth) => set((s) => ({ auth: { ...s.auth, ...auth } })),
      clearAuth: () => set({ auth: defaultAuth }),

      rooms: [],
      addRoom: (room) => set((s) => ({ rooms: [...s.rooms, room] })),
      updateRoom: (id, updates) =>
        set((s) => ({
          rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)),
        })),
      deleteRoom: (id) =>
        set((s) => ({
          rooms: s.rooms.filter((r) => r.id !== id),
          roomVideos: Object.fromEntries(
            Object.entries(s.roomVideos).filter(([k]) => k !== id)
          ),
        })),

      roomVideos: {},
      setRoomVideos: (roomId, videos) =>
        set((s) => ({ roomVideos: { ...s.roomVideos, [roomId]: videos } })),
      updateVideo: (roomId, videoId, updates) =>
        set((s) => ({
          roomVideos: {
            ...s.roomVideos,
            [roomId]: (s.roomVideos[roomId] || []).map((v) =>
              v.id === videoId ? { ...v, ...updates } : v
            ),
          },
        })),

    }),
    {
      name: 'video-eval-store',
      partialize: (state) => ({
        auth: state.auth,
        rooms: state.rooms,
      }),
    }
  )
);
