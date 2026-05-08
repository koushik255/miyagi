export type FileTreeNode = {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export type ProjectInfo = {
  name: string
  path: string
  tree: FileTreeNode[]
}

export type FilePreview = {
  path: string
  content: string
  isBinary: boolean
}

declare global {
  interface Window {
    miyagi: {
      appName: string
      createProject: () => Promise<ProjectInfo | null>
      openProject: (projectPath: string) => Promise<ProjectInfo>
      readFile: (filePath: string) => Promise<FilePreview>
    }
  }
}
