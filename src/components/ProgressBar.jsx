import React from 'react';

const ProgressBar = ({ progress, isIndeterminate = false }) => {
  if (progress === null && !isIndeterminate) {
    return null;
  }

  const percentage = progress !== null ? Math.max(0, Math.min(100, Math.round(progress))) : 0;

  return (
    <div className={`progress ${isIndeterminate ? 'indeterminate' : ''}`}>
      <div 
        className="bar" 
        style={{ 
          width: isIndeterminate ? '40%' : `${percentage}%` 
        }}
      />
      <div className="label">
        {isIndeterminate ? 'working…' : `${percentage}%`}
      </div>
    </div>
  );
};

export default ProgressBar;