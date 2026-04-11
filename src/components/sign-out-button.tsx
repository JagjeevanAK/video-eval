"use client";

import type { ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { clearGoogleClientToken, revokeGoogleAccessToken } from "@/lib/googleApi";
import { useAppStore } from "@/stores/useAppStore";

interface SignOutButtonProps extends Omit<ButtonProps, "onClick"> {
  children?: ReactNode;
  onSignedOut?: () => void;
}

export function SignOutButton({ children = "Sign out", onSignedOut, ...buttonProps }: SignOutButtonProps) {
  const auth = useAppStore((state) => state.auth);
  const clearAuth = useAppStore((state) => state.clearAuth);

  const handleSignOut = async () => {
    let revokeErrorMessage = "";

    if (auth.accessToken) {
      try {
        await revokeGoogleAccessToken(auth.accessToken);
      } catch (error: unknown) {
        revokeErrorMessage = error instanceof Error ? error.message : "Failed to revoke Google access token";
      }
    }

    clearGoogleClientToken();
    clearAuth();
    onSignedOut?.();

    if (revokeErrorMessage) {
      window.alert(`Signed out locally, but Google token revocation failed: ${revokeErrorMessage}`);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You will need to authenticate with Google again to continue using VidEval.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleSignOut}
          >
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
