// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  getFirestore, initializeFirestore,
  doc, setDoc, getDoc, collection, getDocs, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";
import { BACKEND } from "./gradio_api.js";

const firebaseConfig = {
  apiKey: "AIzaSyAImjDNmITwbNkazxdMQv3tksIla3IXKaQ",
  authDomain: "modelgen-dcb3c.firebaseapp.com",
  projectId: "modelgen-dcb3c",
  // ✅ fix: use appspot.com, not firebasestorage.app
  storageBucket: "modelgen-dcb3c.appspot.com",
  messagingSenderId: "230825204940",
  appId: "1:230825204940:web:7f8da5bcb5c8b5ce9a7669",
  measurementId: "G-YS5KZ0GE32"
};

const app = initializeApp(firebaseConfig);

// If your network blocks WebChannel, uncomment the two lines below:
// const db = initializeFirestore(app, { experimentalForceLongPolling: true, useFetchStreams: false });
const db = getFirestore(app);

const auth = getAuth(app);
const storage = getStorage(app);

// ---- Auth (anonymous) ----
let currentUser = null;

export async function ensureAuth() {
  if (currentUser) return currentUser;
  // Start anonymous sign-in; ignore "already signed in" races
  try { await signInAnonymously(auth); } catch {}
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (u) => {
      if (u) { currentUser = u; console.log("[firebase] signed in as", u.uid); resolve(u); }
    });
  });
}

// ---- Firestore helpers ----
// users/{uid}/sessions/{sessionId}
// users/{uid}/sessions/{sessionId}/items/{itemId}

export async function createOrGetSessionDoc(sessionId, defaults = {}, title = "My 3D Session") {
  const u = await ensureAuth();
  const sRef = doc(db, "users", u.uid, "sessions", sessionId);
  const snap = await getDoc(sRef);
  if (!snap.exists()) {
    await setDoc(sRef, {
      title,
      created_at: serverTimestamp(),
      defaults,
    });
  }
  return sRef;
}

export async function addItemToSession({ sessionId, itemId, prompt, params, backendUrl }) {
  const u = await ensureAuth();

  // 1) Download GLB from your backend
  const absUrl = backendUrl.startsWith("http") ? backendUrl : `${BACKEND}${backendUrl}`;
  const glbResp = await fetch(absUrl);
  if (!glbResp.ok) throw new Error(`Failed to fetch GLB (${glbResp.status})`);
  const glbBuf = await glbResp.arrayBuffer();
  const glbBytes = new Uint8Array(glbBuf);

  // 2) Upload to Storage
  const path = `models/${u.uid}/${sessionId}/${itemId}.glb`;
  const sRef = ref(storage, path);
  await uploadBytes(sRef, glbBytes, {
    contentType: "model/gltf-binary",
    // cacheControl: "public, max-age=31536000", // optional
  });
  const downloadURL = await getDownloadURL(sRef);

  // 3) Write Firestore doc
  const itemsCol = collection(db, "users", u.uid, "sessions", sessionId, "items");
  await setDoc(doc(itemsCol, itemId), {
    prompt,
    params,
    backend_url: absUrl,
    storage_path: path,
    storage_url: downloadURL,
    created_at: serverTimestamp(),
  });

  return { storage_path: path, storage_url: downloadURL };
}

export async function listSessions() {
  const u = await ensureAuth();
  const col = collection(db, "users", u.uid, "sessions");
  const qy = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listSessionItems(sessionId) {
  const u = await ensureAuth();
  const col = collection(db, "users", u.uid, "sessions", sessionId, "items");
  const qy = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export { app, auth, db };
export default app;