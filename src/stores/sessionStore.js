import { create } from 'zustand';
import { createSession, appendEdit, getSession } from '../services/gradioApi';
import { 
  createOrGetSessionDoc, 
  addItemToSession, 
  listSessionItems 
} from '../services/firebase';
import { useModelStore } from './modelStore';

const useSessionStore = create((set, get) => ({
  currentSession: null,
  history: [],
  isGenerating: false,

  setCurrentSession: (session) => set({ currentSession: session }),
  
  setHistory: (history) => set({ history }),
  
  setIsGenerating: (isGenerating) => set({ isGenerating }),

  initializeSession: async () => {
    const sessionId = localStorage.getItem('session_id');
    if (sessionId) {
      try {
        await get().loadSession(sessionId);
      } catch (error) {
        console.warn('Failed to load existing session:', error);
        localStorage.removeItem('session_id');
      }
    }
  },

  createNewSession: async (params = {}) => {
    try {
      set({ isGenerating: true });
      useModelStore.getState().setStatus('Starting new chat…');
      
      const session = await createSession({
        title: 'My 3D Session',
        seed: params.seed || 0,
        guidance_scale: params.guidance_scale || 15,
        num_inference_steps: params.num_inference_steps || 64
      });
      
      localStorage.setItem('session_id', session.id);
      
      await createOrGetSessionDoc(session.id, {
        seed: params.seed || 0,
        guidance_scale: params.guidance_scale || 15,
        num_inference_steps: params.num_inference_steps || 64
      });
      
      set({ 
        currentSession: session,
        history: []
      });
      
      useModelStore.getState().setStatus('New chat ready.');
    } catch (error) {
      console.error('Failed to create new session:', error);
      useModelStore.getState().setStatus(`Error: ${error.message}`);
    } finally {
      set({ isGenerating: false });
    }
  },

  loadSession: async (sessionId) => {
    try {
      const session = await getSession(sessionId);
      const history = await listSessionItems(sessionId);
      
      set({ 
        currentSession: session,
        history: history.map(item => ({
          id: item.id,
          prompt: item.prompt,
          url: item.storage_url || item.backend_url
        }))
      });
    } catch (error) {
      console.error('Failed to load session:', error);
      throw error;
    }
  },

  refreshHistory: async () => {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) {
      set({ history: [] });
      return;
    }
    
    try {
      const items = await listSessionItems(sessionId);
      const history = items.map(item => ({
        id: item.id,
        prompt: item.prompt,
        url: item.storage_url || item.backend_url
      }));
      
      set({ history });
    } catch (error) {
      console.warn('Failed to refresh history:', error);
    }
  },

  generateModel: async (params) => {
    const { 
      prompt, 
      seed, 
      guidance_scale, 
      num_inference_steps, 
      continueSession 
    } = params;
    
    try {
      set({ isGenerating: true });
      const modelStore = useModelStore.getState();
      
      modelStore.setProgress(null);
      
      // Try local edit first
      if (modelStore.tryLocalEdit(prompt)) {
        modelStore.setStatus('Applied local edit ✔');
        modelStore.setProgress(100);
        setTimeout(() => modelStore.setProgress(null), 800);
        return;
      }
      
      // Ensure session exists
      let sessionId = localStorage.getItem('session_id');
      
      if (!continueSession || !sessionId) {
        await get().createNewSession({ seed, guidance_scale, num_inference_steps });
        sessionId = localStorage.getItem('session_id');
      } else {
        await createOrGetSessionDoc(sessionId, { seed, guidance_scale, num_inference_steps });
      }
      
      modelStore.setStatus('Generating model…');
      
      // Generate model
      const result = await appendEdit({
        session_id: sessionId,
        edit: prompt,
        seed,
        guidance_scale,
        num_inference_steps
      });
      
      modelStore.setStatus('Loading preview…');
      modelStore.setProgress(95);
      
      // Load the model
      await modelStore.loadModelFromUrl(result.url);
      
      // Save to Firebase
      const saved = await addItemToSession({
        sessionId,
        itemId: result.id,
        prompt,
        params: { seed, guidance_scale, num_inference_steps },
        backendUrl: result.url
      });
      
      const downloadURL = saved?.storage_url || result.url;
      modelStore.setDownloadUrl(downloadURL);
      
      modelStore.setProgress(100);
      modelStore.setStatus('Done ✔ (saved to history)');
      
      // Refresh history
      await get().refreshHistory();
      
    } catch (error) {
      console.error('Generation failed:', error);
      useModelStore.getState().setStatus(`Error: ${error.message}`);
    } finally {
      set({ isGenerating: false });
      setTimeout(() => {
        useModelStore.getState().setProgress(null);
      }, 1200);
    }
  }
}));

export { useSessionStore };