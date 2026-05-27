'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import type { SchoolClass } from '@/hooks/useClasses';

interface Props {
  classes: SchoolClass[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  isAnonymous?: boolean;
}

export default function ClassTabs({ classes, activeId, onSelect, onAdd, onRename, onDelete, onReorder, isAnonymous = false }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOverDelete, setDragOverDelete] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editingId) editRef.current?.focus(); }, [editingId]);
  useEffect(() => { if (adding) addRef.current?.focus(); }, [adding]);

  const startEdit = (c: SchoolClass) => {
    setEditingId(c.id);
    setEditName(c.name);
  };

  const commitEdit = () => {
    if (editingId && editName.trim()) onRename(editingId, editName.trim());
    setEditingId(null);
  };

  const startAdd = () => {
    setAdding(true);
    setNewName('');
    setEditingId(null);
  };

  const commitAdd = () => {
    if (newName.trim()) onAdd(newName.trim());
    setAdding(false);
    setNewName('');
  };

  const isDragging = dragFromIndex !== null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '18px' }}>
      {classes.map((c, index) => {
        const isActive = c.id === activeId;
        const isEditing = c.id === editingId;
        const isThisDragging = dragFromIndex === index;
        const isOver = dragOverIndex === index && dragFromIndex !== index;

        return (
          <div
            key={c.id}
            draggable={!isEditing}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', String(index));
              setDragFromIndex(index);
              setConfirmDeleteId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragFromIndex !== null && index !== dragFromIndex) setDragOverIndex(index);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverIndex(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFromIndex !== null && index !== dragFromIndex) onReorder(dragFromIndex, index);
              setDragFromIndex(null);
              setDragOverIndex(null);
            }}
            onDragEnd={() => { setDragFromIndex(null); setDragOverIndex(null); setDragOverDelete(false); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '3px',
              background: isOver ? 'rgba(255,255,255,0.25)' : isActive ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)',
              border: `1px solid ${isOver ? 'rgba(255,255,255,0.8)' : isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}`,
              borderRadius: '6px',
              padding: '4px 10px',
              opacity: isThisDragging ? 0.4 : 1,
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: 'opacity 0.15s, border-color 0.15s, background 0.15s',
            }}
          >
            {isEditing ? (
              <input
                ref={editRef}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: '#fff', fontSize: '13px', fontWeight: 600,
                  width: `${Math.max(editName.length, 3) + 1}ch`,
                  cursor: 'text',
                }}
              />
            ) : (
              <button
                onClick={() => onSelect(c.id)}
                onDoubleClick={() => startEdit(c)}
                title="Dvoklik za preimenovanje"
                style={{ background: 'none', border: 'none', color: isActive ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: isActive ? 700 : 500, cursor: 'pointer', padding: 0, letterSpacing: '0.03em' }}
              >
                {c.name}
              </button>
            )}
          </div>
        );
      })}

      {isAnonymous ? (
        <Link
          href="/login"
          title="Prijavite se za ustvarjanje razredov"
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.25)',
            borderRadius: '6px', color: 'rgba(255,255,255,0.4)',
            fontFamily: 'var(--font-sans)', fontSize: '11px', fontWeight: 400,
            padding: '4px 10px', textDecoration: 'none',
            display: 'flex', alignItems: 'center', lineHeight: 1, whiteSpace: 'nowrap',
          }}
        >
          + Prijava za razrede
        </Link>
      ) : adding ? (
        <input
          ref={addRef}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onBlur={commitAdd}
          onKeyDown={e => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
          placeholder="npr. 8A"
          style={{
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.35)',
            borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600,
            padding: '4px 10px', outline: 'none', width: '80px',
          }}
        />
      ) : (
        <button
          onClick={startAdd}
          title="Dodaj razred"
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px dashed rgba(255,255,255,0.3)',
            borderRadius: '6px', color: 'rgba(255,255,255,0.55)', fontSize: '18px', fontWeight: 300,
            width: '30px', height: '28px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}
        >+</button>
      )}

      {confirmDeleteId ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(192,57,43,0.25)', border: '1px solid rgba(192,57,43,0.6)', borderRadius: '6px', padding: '4px 8px' }}>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>Izbriši?</span>
          <button
            onClick={() => setConfirmDeleteId(null)}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', color: 'rgba(255,255,255,0.7)', fontSize: '11px', padding: '2px 7px', cursor: 'pointer' }}
          >Ne</button>
          <button
            onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
            style={{ background: '#c0392b', border: 'none', borderRadius: '4px', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 7px', cursor: 'pointer' }}
          >Da</button>
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); if (isDragging) setDragOverDelete(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverDelete(false); }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragFromIndex !== null) setConfirmDeleteId(classes[dragFromIndex].id);
            setDragFromIndex(null);
            setDragOverDelete(false);
          }}
          title="Povleci razred sem za brisanje"
          style={{
            width: '30px', height: '28px',
            background: dragOverDelete ? '#c0392b' : isDragging ? 'rgba(192,57,43,0.35)' : 'rgba(255,255,255,0.07)',
            border: `1px ${dragOverDelete ? 'solid #e74c3c' : isDragging ? 'solid rgba(192,57,43,0.6)' : 'dashed rgba(255,255,255,0.3)'}`,
            borderRadius: '6px',
            color: isDragging ? '#ff9999' : 'rgba(255,255,255,0.55)',
            fontSize: '20px', fontWeight: 300,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
            transition: 'background 0.15s, border-color 0.15s, color 0.15s',
            userSelect: 'none',
          }}
        >−</div>
      )}
    </div>
  );
}
