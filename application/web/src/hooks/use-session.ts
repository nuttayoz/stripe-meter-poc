"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  getMe,
  logout,
  refreshSession,
  type AuthUser,
} from "@/lib/api";
import {
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from "@/lib/auth-storage";
import { clearDemoSubscription } from "@/lib/subscription-storage";

const SESSION_QUERY_KEY = ["session"];

export type SessionState = {
  user: AuthUser;
  accessToken: string;
};

function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

async function resolveSession(): Promise<SessionState | null> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }

  try {
    const me = await getMe(accessToken);
    return {
      accessToken,
      user: me.user,
    };
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error;
    }
  }

  try {
    const refreshed = await refreshSession();
    setAccessToken(refreshed.accessToken);

    const me = await getMe(refreshed.accessToken);
    return {
      accessToken: refreshed.accessToken,
      user: me.user,
    };
  } catch (error) {
    clearAccessToken();
    if (isUnauthorizedError(error)) {
      return null;
    }
    throw error;
  }
}

export function useSession() {
  console.log("session query...");
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: resolveSession,
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      try {
        await logout();
      } finally {
        clearAccessToken();
        clearDemoSubscription();
      }
    },
    onSettled: async () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}
