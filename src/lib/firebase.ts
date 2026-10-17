import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp({
  ...firebaseConfig,
  databaseURL: undefined,
});

export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
storage.maxOperationRetryTime = 5000;
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export interface Session {
  id?: string;
  settings?: any;
  userId: string;
  type: 'crawler' | 'extractor' | 'bulk' | 'ai_chat' | 'url_processor' | 'smart_crawler' | 'file_merge' | 'data_extractor' | 'scheduler';
  title: string;
  tags?: string[];
  isPinned?: boolean;
  isArchived?: boolean;
  results: any[];
  logs: any[];
  url?: string;
  instruction?: string;
  aiSummary?: string;
  notes?: string;
  createdAt: any;
  updatedAt: any;
}

export interface CrawlSchedule {
  id?: string;
  userId: string;
  name: string;
  url: string;
  mode: 'single' | 'subdir' | 'domain';
  frequency: 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly';
  scheduledTime?: string;
  nextRunAt?: any;
  lastRunAt?: any;
  lastStatus?: 'success' | 'failed' | 'running' | 'idle';
  lastResultCount?: number;
  maxPages: number;
  maxDepth: number;
  enabled: boolean;
  status?: 'active' | 'paused';
  notifications: boolean;
  notifyOnComplete?: boolean;
  filters?: {
    domainOnly?: boolean;
    subdomains?: boolean;
    fileTypes?: string;
    includePatterns?: string;
    excludePatterns?: string;
    excludeExtensions?: string;
    restrictDomain?: string;
    customRegex?: string;
  };
  createdAt?: any;
  updatedAt?: any;
}

export interface CrawlLog {
  id?: string;
  userId: string;
  scheduleId?: string;
  scheduleName?: string;
  url: string;
  mode: string;
  status: 'running' | 'completed' | 'failed' | 'stopped';
  startedAt: any;
  completedAt?: any;
  executedAt?: any;
  durationSeconds?: number;
  duration?: number;
  pagesCrawled: number;
  linksFound: number;
  errorsCount: number;
  errorDetails?: string[];
  errorMessage?: string | null;
  resultsSnippet?: any[];
  triggeredBy: 'schedule' | 'manual';
  createdAt?: any;
}

export interface PageMetadata {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  author?: string;
  h1?: string[];
}

export interface ExtractedEntities {
  emails: string[];
  phones: string[];
  socialLinks: { platform: string; url: string }[];
}

export interface ParsedPageData {
  url: string;
  statusCode?: number;
  timestamp?: string;
  metadata?: PageMetadata;
  entities: ExtractedEntities;
}

