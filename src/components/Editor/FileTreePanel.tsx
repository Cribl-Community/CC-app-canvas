import type { ProjectFiles } from '../../types';

interface Props {
  files: ProjectFiles;
  activeFile: string | null;
  onSelect: (path: string) => void;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
}

export function FileTreePanel({ files, activeFile, onSelect }: Props) {
  const tree = buildTree(Object.keys(files));

  if (tree.length === 0) {
    return (
      <div className="file-tree-empty">
        <p>No files generated yet.</p>
      </div>
    );
  }

  return (
    <div className="file-tree">
      {tree.map(node => (
        <TreeNodeView key={node.path} node={node} activeFile={activeFile} onSelect={onSelect} depth={0} />
      ))}
    </div>
  );
}

function TreeNodeView({ node, activeFile, onSelect, depth }: {
  node: TreeNode;
  activeFile: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  if (node.isDir) {
    return (
      <div className="tree-dir">
        <div className="tree-dir-label" style={{ paddingLeft: depth * 12 + 8 }}>
          <span className="tree-icon">▾</span>
          {node.name}/
        </div>
        {node.children.map(child => (
          <TreeNodeView
            key={child.path}
            node={child}
            activeFile={activeFile}
            onSelect={onSelect}
            depth={depth + 1}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`tree-file ${node.path === activeFile ? 'active' : ''}`}
      style={{ paddingLeft: depth * 12 + 8 }}
      onClick={() => onSelect(node.path)}
    >
      <span className="tree-icon">{fileIcon(node.name)}</span>
      {node.name}
    </div>
  );
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] };

  for (const path of paths.sort()) {
    const parts = path.split('/');
    let node = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let child = node.children.find(c => c.name === part);
      if (!child) {
        child = { name: part, path: fullPath, isDir: !isLast, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }

  return root.children;
}

function fileIcon(name: string): string {
  if (name.endsWith('.tsx') || name.endsWith('.jsx')) return '⚛';
  if (name.endsWith('.ts') || name.endsWith('.js')) return '𝘑';
  if (name.endsWith('.css')) return '🎨';
  if (name.endsWith('.json')) return '{}';
  if (name.endsWith('.yml') || name.endsWith('.yaml')) return '⚙';
  if (name.endsWith('.md')) return '📄';
  if (name === 'index.html') return '🌐';
  return '📄';
}
