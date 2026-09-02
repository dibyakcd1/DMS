import React from 'react';

interface TwoColProps {
  left: string;
  right: string;
  style?: React.CSSProperties;
}

export const TwoCol: React.FC<TwoColProps> = ({ left, right, style }) => {
  return (
    <div className="flex justify-between w-full" style={style}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
};
