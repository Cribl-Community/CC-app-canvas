import { useState } from 'react';
import type { ProjectMeta } from '../../types';

interface Props {
  projects: ProjectMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function ProjectSidebar({ projects, activeId, onSelect, onNew, onDelete, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const startEdit = (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const commitEdit = (id: string) => {
    if (editName.trim()) onRename(id, editName.trim());
    setEditingId(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Projects</span>
        <button className="icon-btn" onClick={onNew} title="New project">＋</button>
      </div>
      <div className="sidebar-list">
        {projects.length === 0 && (
          <div className="sidebar-empty">No projects yet.<br />Start a new chat.</div>
        )}
        {projects.map(p => (
          <div
            key={p.id}
            className={`sidebar-item ${p.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            {editingId === p.id ? (
              <input
                className="sidebar-rename-input"
                value={editName}
                autoFocus
                onChange={e => setEditName(e.target.value)}
                onBlur={() => commitEdit(p.id)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitEdit(p.id);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <>
                <span className="sidebar-item-name">{p.name}</span>
                <div className="sidebar-item-actions">
                  <button
                    className="icon-btn-sm"
                    onClick={e => startEdit(p, e)}
                    title="Rename"
                  >✎</button>
                  <button
                    className="icon-btn-sm danger"
                    onClick={e => { e.stopPropagation(); onDelete(p.id); }}
                    title="Delete"
                  >✕</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
