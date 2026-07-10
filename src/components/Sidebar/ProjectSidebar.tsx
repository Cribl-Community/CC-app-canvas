import { useState } from 'react';
import type { ProjectMeta } from '../../types';

interface Props {
  projects: ProjectMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string, appId?: string) => void;
}

function toAppId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'app';
}

export function ProjectSidebar({ projects, activeId, onSelect, onNew, onDelete, onRename }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAppId, setEditAppId] = useState('');
  // Track whether the user has manually edited the appId so we stop auto-syncing from name
  const [appIdManuallyEdited, setAppIdManuallyEdited] = useState(false);

  const startEdit = (p: ProjectMeta, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
    setEditAppId(p.appId || toAppId(p.name));
    setAppIdManuallyEdited(!!p.appId);
  };

  const handleNameChange = (value: string) => {
    setEditName(value);
    if (!appIdManuallyEdited) {
      setEditAppId(toAppId(value));
    }
  };

  const handleAppIdChange = (value: string) => {
    // Only allow valid appId characters as the user types
    const sanitised = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setEditAppId(sanitised);
    setAppIdManuallyEdited(true);
  };

  const commitEdit = (id: string) => {
    if (editName.trim()) {
      onRename(id, editName.trim(), editAppId || toAppId(editName.trim()));
    }
    setEditingId(null);
    setAppIdManuallyEdited(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setAppIdManuallyEdited(false);
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
              <div className="sidebar-edit-form" onClick={e => e.stopPropagation()}>
                <div className="sidebar-appid-row">
                  <span className="sidebar-appid-label">Name</span>
                  <input
                    className="sidebar-rename-input"
                    value={editName}
                    autoFocus
                    placeholder="Project name"
                    onChange={e => handleNameChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit(p.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                </div>
                <div className="sidebar-appid-row">
                  <span className="sidebar-appid-label">App ID</span>
                  <input
                    className="sidebar-rename-input sidebar-appid-input"
                    value={editAppId}
                    placeholder="app-id"
                    onChange={e => handleAppIdChange(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit(p.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                  />
                </div>
                <div className="sidebar-edit-actions">
                  <button className="btn-xs btn-primary" onClick={() => commitEdit(p.id)}>Save</button>
                  <button className="btn-xs" onClick={cancelEdit}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="sidebar-item-text">
                  <span className="sidebar-item-name">{p.name}</span>
                  {p.appId && p.appId !== toAppId(p.name) && (
                    <span className="sidebar-item-appid">{p.appId}</span>
                  )}
                </div>
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
