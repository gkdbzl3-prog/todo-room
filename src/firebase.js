import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  getDocs,
  where,
  serverTimestamp,
  limit,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

// 로컬 영속 캐시(IndexedDB) 활성화.
// 재방문 시 onSnapshot이 캐시에서 즉시 발화 → 스켈레톤 대기시간 최소화하고
// 이후 서버 값으로 갱신된다. 여러 탭이 캐시를 공유하도록 multi-tab 매니저 사용.
// IndexedDB를 못 쓰는 환경(사생활 보호 모드 등)에선 기본 캐시로 폴백.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  console.warn("Firestore 영속 캐시 비활성화 — 기본 캐시로 폴백", err);
  db = getFirestore(app);
}

export {
  db,
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  getDocs,
  where,
  serverTimestamp,
  limit,
  arrayUnion,
  arrayRemove,
};
