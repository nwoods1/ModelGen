import React from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useModelStore } from '../stores/modelStore';

const HistoryList = () => {
  const { history } = useSessionStore();
  const { loadModelFromUrl, setStatus } = useModelStore();

  const handleLoadFromHistory = async (item) => {
    try {
      setStatus('Loading from history…');
      await loadModelFromUrl(item.url);
      setStatus('Loaded ✔');
    } catch (error) {
      console.error('Failed to load from history:', error);
      setStatus('Failed to load from history');
    }
  };

  if (!history || history.length === 0) {
    return (
      <div className="history">
        <div className="history-title">History</div>
        <p style={{ fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic' }}>
          No models generated yet
        </p>
      </div>
    );
  }

  return (
    <div className="history">
      <div className="history-title">History</div>
      <ul className="history-list">
        {history.slice().reverse().map((item, index) => (
          <li key={item.id || index} className="history-item">
            <div className="history-snippet">
              {(item.prompt || '').replace(/\s+/g, ' ').slice(0, 80)}
            </div>
            <button onClick={() => handleLoadFromHistory(item)}>
              Load
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default HistoryList;