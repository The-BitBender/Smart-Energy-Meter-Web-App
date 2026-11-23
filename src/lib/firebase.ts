import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  reauthenticateWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously,
  onAuthStateChanged,
  UserCredential
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Must pass firestoreDatabaseId as required by Firebase skill
const firestoreDatabaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-33e80a9d-c379-4691-ae33-800b1ee682eb';
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
] as const;

export const googleProvider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => {
  googleProvider.addScope(scope);
});

// In-memory cache ONLY for Google Workspace OAuth access token (never stored in localStorage/sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    cachedWorkspaceAccessToken = null;
  }
});

export function captureGoogleAccessTokenFromCredential(result: UserCredential): string | null {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedWorkspaceAccessToken = credential.accessToken;
    return credential.accessToken;
  }
  return null;
}

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export function clearWorkspaceAccessToken(): void {
  cachedWorkspaceAccessToken = null;
}

export async function authorizeGoogleDocsAccess(): Promise<string> {
  const docsProvider = new GoogleAuthProvider();
  WORKSPACE_SCOPES.forEach((scope) => docsProvider.addScope(scope));
  docsProvider.setCustomParameters({ prompt: 'consent select_account' });

  const currentUser = auth.currentUser;
  const isGoogleUser = Boolean(
    currentUser && currentUser.providerData?.some((p) => p.providerId === 'google.com')
  );

  const result = isGoogleUser && currentUser
    ? await reauthenticateWithPopup(currentUser, docsProvider)
    : await signInWithPopup(auth, docsProvider);

  const token = captureGoogleAccessTokenFromCredential(result);
  if (!token) {
    throw new Error('Google Docs access permission was not returned. Please grant Google Docs access to continue.');
  }
  return token;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standardized error handling as mandated by Firebase Integration Skill
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Test initial Firestore connection per skill directive
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore offline status check:', error.message);
    }
    return false;
  }
}

export { 
  signInWithPopup, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signInAnonymously
};
