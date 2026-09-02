import React from 'react';
import { InvoiceData } from '@/printer/InvoiceData.types';
import { MetaRow } from './MetaRow';
import { ColHeader } from './ColHeader';
import { ItemRow } from './ItemRow';
import { TwoCol } from './TwoCol';

const RECEIPT_WIDTH = '302px';

const receiptStyles = {
  container: {
    fontFamily: '"Courier Prime", "Courier New", monospace',
    fontSize: '12px',
    lineHeight: '1.5',
    width: RECEIPT_WIDTH,
    maxWidth: '100%',
    background: '#fff',
    color: '#111',
    padding: '20px 16px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)',
    borderRadius: '2px',
    whiteSpace: 'pre-wrap' as const,
    overflowX: 'hidden' as const,
  },
  brandName: {
    fontFamily: '"Courier Prime", monospace',
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textAlign: 'center' as const,
    lineHeight: '1.2',
  },
  tagline: {
    fontFamily: '"Courier Prime", monospace',
    fontSize: '10px',
    fontWeight: 400,
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    textAlign: 'center' as const,
    color: '#444',
    marginBottom: '8px',
  },
  sectionLabel: {
    fontWeight: 700,
    letterSpacing: '0.06em',
  },
  dividerHeavy: {
    borderTop: '2px solid #111',
    margin: '6px 0',
  },
  dividerLight: {
    borderTop: '1px dashed #bbb',
    margin: '6px 0',
  },
  total: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  footer: {
    fontSize: '9px',
    color: '#777',
    textAlign: 'center' as const,
    marginTop: '8px',
    letterSpacing: '0.04em',
  },
};

export const InvoicePreview: React.FC<{ data: InvoiceData }> = ({ data }) => {
  return (
    <div style={receiptStyles.container}>
      {/* Brand Header */}
      <div style={receiptStyles.brandName}>{data.businessName}</div>
      <div style={receiptStyles.tagline}>{data.businessTagline}</div>
      <div style={{ textAlign: 'center', letterSpacing: '0.1em', color: '#888' }}>
        ━━━━━━━━━━━━━━━━━━━━━━━━━━
      </div>

      {/* Document Meta */}
      <div style={{ marginTop: '8px' }}>
        <span style={receiptStyles.sectionLabel}>CASH MEMO</span>
        <MetaRow label="No :" value={data.memoNumber} />
        <MetaRow label="Order Date:" value={data.orderDate || data.date} />
        <MetaRow label="Delivery Date:" value={data.deliveryDate || 'Pending'} />
        <MetaRow label="Order:" value={data.orderNumber} />
      </div>

      {/* Bill To */}
      <div style={{ margin: '8px 0 4px' }}>
        <span style={receiptStyles.sectionLabel}>▸ BILL TO</span>
        <div>{data.billTo}</div>
      </div>

      {/* Items */}
      <div style={receiptStyles.dividerHeavy} />
      <ColHeader />
      <div style={receiptStyles.dividerLight} />
      {data.items.map((item, i) => (
        <ItemRow key={i} item={item} />
      ))}

      {/* Totals */}
      <div style={receiptStyles.dividerHeavy} />
      <TwoCol left="Subtotal" right={`${data.subtotal.toFixed(2)}`} />
      <TwoCol left="GST" right={`${data.gst.toFixed(2)}`} />
      <div style={receiptStyles.dividerHeavy} />
      <TwoCol
        left="TOTAL"
        right={`Rs.${data.total.toFixed(2)}`}
        style={receiptStyles.total}
      />
      <div style={receiptStyles.dividerHeavy} />

      {/* Footer */}
      <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11px' }}>
        Thank you for your purchase!
      </div>
      <div style={{ textAlign: 'center', margin: '4px 0', letterSpacing: '0.3em' }}>
        ★  ★  ★
      </div>
      <div style={receiptStyles.footer}>{data.footerNote}</div>
    </div>
  );
};
