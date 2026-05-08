import { useState } from 'react'
import type { FileTreeNode, ProjectInfo } from './electron'
import './App.css'

const MIN_SIDEBAR_WIDTH = 220
const MAX_SIDEBAR_WIDTH = 420
const DEFAULT_SIDEBAR_WIDTH = 315
const COLLAPSED_SIDEBAR_WIDTH = 56

type OpenTab = {
  path: string
  name: string
  content: string
}

type SavedProject = {
  name: string
  path: string
}

const loadSavedProjects = (): SavedProject[] => {
  try {
    return JSON.parse(localStorage.getItem('miyagi.projects') ?? '[]')
  } catch {
    return []
  }
}

function FileTree({ nodes, onOpenFile }: { nodes: FileTreeNode[]; onOpenFile: (node: FileTreeNode) => void }) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <div className="tree-node" key={node.path}>
          <button
            className={`tree-row ${node.type}`}
            onClick={() => node.type === 'file' && onOpenFile(node)}
          >
            <span className="tree-icon">{node.type === 'directory' ? '▸' : '•'}</span>
            <span className="tree-name">{node.name}</span>
          </button>
          {node.children && node.children.length > 0 && (
            <div className="tree-children">
              <FileTree nodes={node.children} onOpenFile={onOpenFile} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function App() {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [projects, setProjects] = useState<SavedProject[]>(loadSavedProjects)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [draggedTabPath, setDraggedTabPath] = useState<string | null>(null)

  const activeTab = tabs.find((tab) => tab.path === activePath)

  const saveProjects = (nextProjects: SavedProject[]) => {
    setProjects(nextProjects)
    localStorage.setItem('miyagi.projects', JSON.stringify(nextProjects))
  }

  const setCurrentProject = (nextProject: ProjectInfo) => {
    setProject(nextProject)
    setTabs([])
    setActivePath(null)
  }

  const toggleSidebar = () => {
    setIsCollapsed((collapsed) => !collapsed)
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isCollapsed) return

    event.currentTarget.setPointerCapture(event.pointerId)

    const handleResize = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(
        MAX_SIDEBAR_WIDTH,
        Math.max(MIN_SIDEBAR_WIDTH, moveEvent.clientX),
      )

      setSidebarWidth(nextWidth)
    }

    const stopResize = () => {
      window.removeEventListener('pointermove', handleResize)
      window.removeEventListener('pointerup', stopResize)
    }

    window.addEventListener('pointermove', handleResize)
    window.addEventListener('pointerup', stopResize)
  }

  const createProject = async () => {
    const nextProject = await window.miyagi.createProject()
    if (!nextProject) return

    const savedProject = { name: nextProject.name, path: nextProject.path }
    const nextProjects = [savedProject, ...projects.filter((item) => item.path !== nextProject.path)]

    saveProjects(nextProjects)
    setCurrentProject(nextProject)
  }

  const openProject = async (projectPath: string) => {
    const nextProject = await window.miyagi.openProject(projectPath)
    setCurrentProject(nextProject)
  }

  const openFile = async (node: FileTreeNode) => {
    const existingTab = tabs.find((tab) => tab.path === node.path)
    if (existingTab) {
      setActivePath(existingTab.path)
      return
    }

    const file = await window.miyagi.readFile(node.path)
    const nextTab = { path: node.path, name: node.name, content: file.content }

    setTabs((currentTabs) => [...currentTabs, nextTab])
    setActivePath(nextTab.path)
  }

  const moveTab = (targetPath: string) => {
    if (!draggedTabPath || draggedTabPath === targetPath) return

    setTabs((currentTabs) => {
      const draggedIndex = currentTabs.findIndex((tab) => tab.path === draggedTabPath)
      const targetIndex = currentTabs.findIndex((tab) => tab.path === targetPath)
      if (draggedIndex === -1 || targetIndex === -1) return currentTabs

      const nextTabs = [...currentTabs]
      const [draggedTab] = nextTabs.splice(draggedIndex, 1)
      nextTabs.splice(targetIndex, 0, draggedTab)
      return nextTabs
    })
  }

  return (
    <main className="app-shell">
      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
        style={{ width: isCollapsed ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth }}
      >
        <div className="sidebar-toolbar">
          <button className="icon-button" aria-label="Toggle sidebar" onClick={toggleSidebar}>
            <span />
          </button>
          {!isCollapsed && <button className="icon-button search" aria-label="Search" />}
        </div>

        {!isCollapsed && (
          <>
            <button className="create-project" onClick={createProject}>
              Create / Open Project
            </button>

            <section className="projects-list">
              <div className="section-title">Projects</div>
              {projects.length === 0 && <div className="muted-line">No projects yet</div>}
              {projects.map((item) => (
                <button
                  className={`project-item ${project?.path === item.path ? 'active' : ''}`}
                  key={item.path}
                  onClick={() => openProject(item.path)}
                >
                  <span className="project-dot" />
                  <span>{item.name}</span>
                </button>
              ))}
            </section>

            {project && (
              <section className="project-browser">
                <div className="project-title">Files</div>
                <FileTree nodes={project.tree} onOpenFile={openFile} />
              </section>
            )}
          </>
        )}

        {isCollapsed && (
          <button className="single-tab active" aria-label="Current tab">
            <span className="tab-icon" />
          </button>
        )}

        <div className="resize-handle" onPointerDown={startResize} />
      </aside>

      <section className="workspace">
        <div className="tabs-bar">
          {tabs.map((tab) => (
            <button
              draggable
              className={`editor-tab ${tab.path === activePath ? 'active' : ''}`}
              key={tab.path}
              onClick={() => setActivePath(tab.path)}
              onDragStart={() => setDraggedTabPath(tab.path)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => moveTab(tab.path)}
              onDragEnd={() => setDraggedTabPath(null)}
            >
              {tab.name}
            </button>
          ))}
        </div>

        <div className="editor-area">
          {activeTab ? (
            <pre className="code-preview"><code>{activeTab.content}</code></pre>
          ) : (
            <div className="empty-state">
              {project ? 'Select a file from the sidebar.' : 'Create or open a project to begin.'}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default App
