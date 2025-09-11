import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  doc, setDoc, getDoc, collection, getDocs, query, orderBy, serverTimestamp
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAImjDNmITwbNkazxdMQv3tksIla3IXKaQ",
  authDomain: "modelgen-dcb3c.firebaseapp.com",
  projectId: "modelgen-dcb3c",
  storageBucket: "modelgen-dcb3c.appspot.com",
  messagingSenderId: "230825204940",
  appId: "1:230825204940:web:7f8da5bcb5c8b5ce9a7669",
  measurementId: "G-YS5KZ0GE32"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

let currentUser = null;

export const ensureAuth = async () => {
  if (currentUser) return currentUser;
  
  try { 
    await signInAnonymously(auth); 
  } catch (error) {
    console.warn('Anonymous sign-in failed:', error);
  }
  
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) { 
        currentUser = user; 
        console.log('[firebase] signed in as', user.uid); 
        resolve(user); 
      }
    });
  });
};

export const createOrGetSessionDoc = async (sessionId, defaults = {}, title = "My 3D Session") => {
  const user = await ensureAuth();
  const sessionRef = doc(db, "users", user.uid, "sessions", sessionId);
  const snap = await getDoc(sessionRef);
  
  if (!snap.exists()) {
    await setDoc(sessionRef, {
      title,
      created_at: serverTimestamp(),
      defaults,
    });
  }
  
  return sessionRef;
};

export const addItemToSession = async ({ sessionId, itemId, prompt, params, backendUrl }) => {
  const user = await ensureAuth();
  const BACKEND = "http://localhost:8000";

  // Download GLB from backend
  const absUrl = backendUrl.startsWith("http") ? backendUrl : `${BACKEND}${backendUrl}`;
  const glbResp = await fetch(absUrl);
  if (!glbResp.ok) throw new Error(`Failed to fetch GLB (${glbResp.status})`);
  
  const glbBuf = await glbResp.arrayBuffer();
  const glbBytes = new Uint8Array(glbBuf);

  // Upload to Storage
  const path = `models/${user.uid}/${sessionId}/${itemId}.glb`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, glbBytes, {
    contentType: "model/gltf-binary",
  });
  const downloadURL = await getDownloadURL(storageRef);

  // Write Firestore doc
  const itemsCol = collection(db, "users", user.uid, "sessions", sessionId, "items");
  await setDoc(doc(itemsCol, itemId), {
    prompt,
    params,
    backend_url: absUrl,
    storage_path: path,
    storage_url: downloadURL,
    created_at: serverTimestamp(),
  });

  return { storage_path: path, storage_url: downloadURL };
};

export const listSessions = async () => {
  const user = await ensureAuth();
  const col = collection(db, "users", user.uid, "sessions");
  const q = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const listSessionItems = async (sessionId) => {
  const user = await ensureAuth();
  const col = collection(db, "users", user.uid, "sessions", sessionId, "items");
  const q = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

export { app, auth, db, storage };