import React from 'react';

interface MetaRowProps {
  label: string;
  value: string;
}

export const MetaRow: React.FC<MetaRowProps> = ({ label, value }) => {
  return (
    <div className="flex justify-between w-full">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
};
