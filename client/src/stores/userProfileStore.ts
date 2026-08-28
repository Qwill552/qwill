import type { UserProfileDto } from '@messenger/shared';
import { create } from 'zustand';

import { getUserProfileRequest } from '../api/users';

interface UserProfileState {
  profile: UserProfileDto | null;
  load: (userId: string) => void;
  refresh: (userId: string) => Promise<void>;
  setProfile: (profile: UserProfileDto) => void;
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  profile: null,

  load(userId) {
    const current = get().profile;
    if (current?.id === userId) return;
    if (current) set({ profile: null });
    getUserProfileRequest(userId)
      .then((profile) => set({ profile }))
      .catch(() => undefined);
  },

  async refresh(userId) {
    const profile = await getUserProfileRequest(userId).catch(() => null);
    if (profile) set({ profile });
  },

  setProfile(profile) {
    set({ profile });
  },
}));
