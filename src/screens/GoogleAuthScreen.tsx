"use client";

import { useEffect, useState } from "react";
import { Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { initGoogleAuth, requestAccessToken } from "@/lib/googleApi";
import { useAppStore } from "@/stores/useAppStore";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

export default function GoogleAuthScreen() {
  const setAuth = useAppStore((state) => state.setAuth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) {
      return;
    }

    void initGoogleAuth(GOOGLE_CLIENT_ID, (token, userInfo) => {
      setAuth({
        isAuthenticated: true,
        accessToken: token,
        userEmail: userInfo.email,
        userName: userInfo.name,
        userPhoto: userInfo.picture,
      });
    })
      .then(() => setInitialized(true))
      .catch((initError) => {
        const message = initError instanceof Error ? initError.message : "Failed to initialize Google Auth";
        setError(message);
      });
  }, [setAuth]);

  async function handleSignIn() {
    if (!GOOGLE_CLIENT_ID) {
      setError("NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable is not set.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!initialized) {
        await initGoogleAuth(GOOGLE_CLIENT_ID, (token, userInfo) => {
          setAuth({
            isAuthenticated: true,
            accessToken: token,
            userEmail: userInfo.email,
            userName: userInfo.name,
            userPhoto: userInfo.picture,
          });
        });
        setInitialized(true);
      }

      requestAccessToken();
    } catch (signInError) {
      const message = signInError instanceof Error ? signInError.message : "Failed to start Google sign-in";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="gradient-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
          <Video className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">VidEval</h1>
        <p className="mb-8 mt-1 text-muted-foreground">Video Evaluation Platform</p>

        <div className="glass-card-elevated space-y-4 p-6">
          {error && (
            <p className="rounded-lg bg-destructive/10 p-3 text-left text-sm text-destructive">{error}</p>
          )}

          <Button
            className="gradient-primary h-12 w-full text-base text-primary-foreground"
            onClick={handleSignIn}
            disabled={loading}
          >
            <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            {loading ? "Connecting..." : "Sign in with Google"}
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">Your credentials are stored locally in your browser.</p>
      </div>
    </div>
  );
}
