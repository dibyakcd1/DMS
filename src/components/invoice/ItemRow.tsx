import React from 'react';
import { InvoiceItem } from '@/printer/InvoiceData.types';
import { TwoCol } from './TwoCol';

interface ItemRowProps {
  item: InvoiceItem;
}

export const ItemRow: React.FC<ItemRowProps> = ({ item }) => {
  return (
    <div className="mb-2">
      <div className="whitespace-pre-wrap">{`${item.srNo}. ${item.product}`}</div>
      <div className="text-[10px] pl-3">{item.variant}</div>
      <TwoCol 
        left={`   ${item.qty} x ${item.rate.toFixed(2)}`} 
        right={item.amount.toFixed(2)} 
      />
    </div>
  );
};
