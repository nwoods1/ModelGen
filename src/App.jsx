import React, { useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ModelViewer from './components/ModelViewer';
import EditPanel from './components/EditPanel';
import { useSessionStore } from './stores/sessionStore';
import { ensureAuth } from './services/firebase';
import './App.css';

function App() {
  const { initializeSession } = useSessionStore();

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize Firebase auth
        await ensureAuth();
        
        // Initialize session if needed
        await initializeSession();
      } catch (error) {
        console.error('App initialization failed:', error);
      }
    };

    init();
  }, [initializeSession]);

  return (
    <div className="app">
      <Sidebar />
      <main className="view">
        <ModelViewer />
        <EditPanel />
      </main>
    </div>
  );
}

export default App;