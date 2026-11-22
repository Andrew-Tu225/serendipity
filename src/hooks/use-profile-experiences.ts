import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client/client";
import { profileClient } from "@/lib/api-client/profile";
import type { ProfileExperiences } from "@/types/profile";
import type { CharacterAppearance } from "@/types/character";

export type ProfileState =
  | { status: "loading" | "demo" | "error" }
  | { status: "ready"; data: ProfileExperiences };

export function useProfileExperiences() {
  const [profile, setProfile] = useState<ProfileState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    profileClient.getExperiences(0, 4, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setProfile({ status: "ready", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setProfile({ status: error instanceof ApiError && error.status === 401 ? "demo" : "error" });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setProfile({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  function updateCharacter(character: CharacterAppearance) {
    setProfile((current) => current.status === "ready" ? { ...current, data: { ...current.data, character } } : current);
  }

  function recordListCreated() {
    setProfile((current) => current.status === "ready" ? {
      ...current,
      data: { ...current.data, list_count: (current.data.list_count ?? 1) + 1 },
    } : current);
  }

  return { profile, retry, updateCharacter, recordListCreated };
}
