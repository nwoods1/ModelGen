
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";


  const firebaseConfig = {
    apiKey: "AIzaSyAImjDNmITwbNkazxdMQv3tksIla3IXKaQ",
    authDomain: "modelgen-dcb3c.firebaseapp.com",
    projectId: "modelgen-dcb3c",
    storageBucket: "modelgen-dcb3c.firebasestorage.app",
    messagingSenderId: "230825204940",
    appId: "1:230825204940:web:7f8da5bcb5c8b5ce9a7669",
    measurementId: "G-YS5KZ0GE32"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ---- Auth (anonymous) ----
let currentUser = null;

export async function ensureAuth() {
  if (currentUser) return currentUser;
  // sign-in or wait for existing session
  await signInAnonymously(auth).catch(()=>{});
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (u) => {
      if (u) { currentUser = u; resolve(u); }
    });
  });
}

// ---- Firestore paths ----
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

  // 1) Download GLB bytes from your backend URL
  const absUrl = backendUrl.startsWith("http") ? backendUrl : `http://localhost:8000${backendUrl}`;
  const glbResp = await fetch(absUrl);
  if (!glbResp.ok) throw new Error(`Failed to fetch GLB (${glbResp.status})`);
  const glbBuf = await glbResp.arrayBuffer();
  const glbBytes = new Uint8Array(glbBuf);

  // 2) Upload to Storage
  const path = `models/${u.uid}/${sessionId}/${itemId}.glb`;
  const sRef = ref(storage, path);
  await uploadBytes(sRef, glbBytes, { contentType: "model/gltf-binary" });
  const downloadURL = await getDownloadURL(sRef);

  // 3) Write item doc
  const itemsCol = collection(db, "users", u.uid, "sessions", sessionId, "items");
  await setDoc(doc(itemsCol, itemId), {
    prompt,
    params,
    backend_url: absUrl,       // where it originally came from
    storage_path: path,
    storage_url: downloadURL,  // permanent Firebase URL
    created_at: serverTimestamp(),
  });

  return { storage_path: path, storage_url: downloadURL };
}

export async function listSessions() {
  const u = await ensureAuth();
  const col = collection(db, "users", u.uid, "sessions");
  const q = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function listSessionItems(sessionId) {
  const u = await ensureAuth();
  const col = collection(db, "users", u.uid, "sessions", sessionId, "items");
  const q = query(col, orderBy("created_at", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
