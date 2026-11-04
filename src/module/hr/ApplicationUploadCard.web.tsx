import { useState } from 'react';
import { Text } from '@/components/Typography';
import { UploadCardContent, type UploadCardProps } from './ApplicationUploadCardContent';

export default function ApplicationUploadCard(props: UploadCardProps) {
  const [dragging, setDragging] = useState(false);
  return <div tabIndex={0} aria-label={`${props.label}: drop a file or focus here to paste a file`} onDragOver={event => { event.preventDefault(); if (!props.disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !props.disabled) props.onFile(file); }} onPaste={event => { const file = Array.from(event.clipboardData.files)[0]; if (file && !props.disabled) { event.preventDefault(); props.onFile(file); } }} style={{ flex: '1 1 260px', minWidth: 220, border: `1.5px dashed ${dragging ? '#A74646' : '#C87A70'}`, borderRadius: 18, background: dragging ? '#F9E8E2' : '#FFFCFA' }}>
    <UploadCardContent {...props} />
    <Text style={{ color: '#8A7770', textAlign: 'center', fontSize: 12, paddingHorizontal: 20, paddingBottom: 22 }}>Drop your file here or click this card and paste (Ctrl+V)</Text>
  </div>;
}
