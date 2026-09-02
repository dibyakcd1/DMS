import React from 'react';

export const ColHeader: React.FC = () => {
  return (
    <div className="flex justify-between w-full font-bold">
      <span>ITEM</span>
      <span>QTY  RATE    AMT</span>
    </div>
  );
};
