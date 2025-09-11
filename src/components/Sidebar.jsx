import React, { useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';
import ProgressBar from './ProgressBar';
import HistoryList from './HistoryList';

const Sidebar = () => {
  const [prompt, setPrompt] = useState('');
  const [seed, setSeed] = useState(0);
  const [guidance, setGuidance] = useState(15);
  const [steps, setSteps] = useState(64);
  const [continueToggle, setContinueToggle] = useState(true);

  const { 
    currentSession, 
    createNewSession, 
    generateModel, 
    isGenerating 
  } = useSessionStore();

  const { 
    status, 
    progress, 
    downloadUrl 
  } = useModelStore();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setPrompt('Create a simple low-poly object.');
    }

    const params = {
      prompt: prompt.trim() || 'Create a simple low-poly object.',
      seed: Number(seed) || 0,
      guidance_scale: Number(guidance) || 15,
      num_inference_steps: Number(steps) || 64,
      continueSession: continueToggle
    };

    await generateModel(params);
  };

  const handleNewChat = async () => {
    await createNewSession({
      seed: Number(seed) || 0,
      guidance_scale: Number(guidance) || 15,
      num_inference_steps: Number(steps) || 64
    });
  };

  return (
    <aside className="side">
      <h2>Text → 3D</h2>
      <p className="hint">HF Space: <code>hysts/Shap-E</code></p>

      <div>
        <label>Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the 3D object you want to create..."
        />
      </div>

      <div className="row">
        <div>
          <label>Seed</label>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </div>
        <div>
          <label>Guidance</label>
          <input
            type="number"
            step="0.5"
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
        </div>
      </div>

      <div className="row">
        <div>
          <label>Steps</label>
          <input
            type="number"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />
        </div>
      </div>

      <div className="buttons">
        <button 
          className="btn" 
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </button>
        <a 
          className="btn sec" 
          href={downloadUrl || '#'} 
          download="model.glb"
          style={{ 
            opacity: downloadUrl ? 1 : 0.5,
            pointerEvents: downloadUrl ? 'auto' : 'none'
          }}
        >
          Download .glb
        </a>
      </div>

      <div className="status">{status}</div>
      
      <ProgressBar progress={progress} />

      <div className="row row-inline">
        <label className="inline">
          <input
            type="checkbox"
            checked={continueToggle}
            onChange={(e) => setContinueToggle(e.target.checked)}
          />
          Continue editing current design
        </label>
        <button 
          className="btn sec" 
          onClick={handleNewChat}
          disabled={isGenerating}
        >
          Start New Chat
        </button>
      </div>

      <HistoryList />
    </aside>
  );
};

export default Sidebar;