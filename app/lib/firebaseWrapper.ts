/* Firebase disabled for local constructor-only build */

export const getDocId = () => 'local-id';

export const getAuth = () => {
  const fakeUser = {
    uid: 'local-dev',
    displayName: 'Constructor',
    isAnonymous: false,
  };

  return {
    currentUser: fakeUser,

    onAuthStateChanged: () => {
      // Firebase normally returns an unsubscribe function
      return () => {
        return undefined;
      };
    },
  };
};
export const getStorage = () => null;

export const getCollection = () => {
  throw new Error('Firestore disabled in local build');
};

export const getValidatedCollection = () => {
  throw new Error('Firestore disabled in local build');
};

export const getDocRef = () => {
  throw new Error('Firestore disabled in local build');
};

export const signInAnonymously = () =>
  Promise.resolve({
    uid: 'local-dev',
    displayName: 'Constructor',
    isAnonymous: false,
  });

export const setUserMap = () => {
  return undefined;
};
