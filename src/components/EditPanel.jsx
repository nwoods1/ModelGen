import React from 'react';
import { useModelStore } from '../stores/modelStore';

const EditPanel = () => {
  const { transforms, updateTransforms } = useModelStore();

  const handleScaleChange = (value) => {
    updateTransforms({ scale: parseFloat(value) });
  };

  const handleRotationChange = (axis, value) => {
    updateTransforms({
      rotation: {
        ...transforms.rotation,
        [axis]: parseFloat(value)
      }
    });
  };

  const handleColorChange = (color) => {
    updateTransforms({ color });
  };

  return (
    <div className="edit-panel">
      <h3>Edit Model</h3>
      
      <label>
        Scale
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.01"
          value={transforms.scale}
          onChange={(e) => handleScaleChange(e.target.value)}
        />
      </label>

      <label>
        Rotate X
        <input
          type="range"
          min="-180"
          max="180"
          value={transforms.rotation.x}
          onChange={(e) => handleRotationChange('x', e.target.value)}
        />
      </label>

      <label>
        Rotate Y
        <input
          type="range"
          min="-180"
          max="180"
          value={transforms.rotation.y}
          onChange={(e) => handleRotationChange('y', e.target.value)}
        />
      </label>

      <label>
        Rotate Z
        <input
          type="range"
          min="-180"
          max="180"
          value={transforms.rotation.z}
          onChange={(e) => handleRotationChange('z', e.target.value)}
        />
      </label>

      <label>
        Color
        <input
          type="color"
          value={transforms.color}
          onChange={(e) => handleColorChange(e.target.value)}
        />
      </label>
    </div>
  );
};

export default EditPanel;