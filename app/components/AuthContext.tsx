import { User } from 'firebase/auth';
import { createContext } from 'react';
import { ConstructorPageT } from '../lib/constructorPage.js';
import { NotificationT } from '../lib/notificationTypes.js';
import { AccountPrefsT } from '../lib/prefs.js';

export interface AuthContextValue {
  user?: User;
  notifications?: NotificationT[];
  isAdmin: boolean;
  isPatron: boolean;
  isMod: boolean;
  loading: boolean;
  error?: string;
  constructorPage?: ConstructorPageT;
  prefs?: AccountPrefsT;
  displayName?: string | null;
  updateDisplayName?: (n: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue>({
  user: {
    uid: 'local-dev',
    displayName: 'Local Constructor',
    isAnonymous: false,
  } as unknown as User,
  isAdmin: true,
  isPatron: false,
  isMod: false,
  loading: false,
  notifications: [],
  constructorPage: undefined,
  prefs: {},
});
