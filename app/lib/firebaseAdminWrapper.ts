/* Firebase Admin disabled for local constructor-only build */

type Noop = (...args: unknown[]) => unknown;

/* universal chainable proxy */
const proxy: Record<string, Noop> = new Proxy(
  {},
  {
    get: () => () => proxy,
  }
);

/* ---- admin stubs ---- */

export const getAdminApp = (): unknown => proxy;
export const getAdminAuth = (): unknown => proxy;
export const getAdminFirestore = (): unknown => proxy;
export const getAdminStorage = (): unknown => proxy;

export const verifyIdToken = () =>
  Promise.resolve({
    uid: 'local-dev',
  });

/* ---- firestore query helpers ---- */

export const getCollection = (): unknown => proxy;

export const mapEachResult = (): unknown[] => [];
