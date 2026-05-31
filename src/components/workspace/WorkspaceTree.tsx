import { useCallback, useEffect, useMemo, useRef } from 'react'
import { prepareFileTreeInput } from '@pierre/trees'
import { FileTree, useFileTree } from '@pierre/trees/react'
import type { WorkspaceFile } from '../../types'

export function WorkspaceTree({
  files,
  activePath,
  onOpenFile,
}: {
  files: WorkspaceFile[]
  activePath: string | null
  onOpenFile: (file: WorkspaceFile) => void
}) {
  const paths = useMemo(() => files.map((file) => file.path), [files])
  const fileByPath = useMemo(() => new Map(files.map((file) => [file.path, file])), [files])
  const fileByPathRef = useRef(fileByPath)
  const onOpenFileRef = useRef(onOpenFile)
  const preparedInput = useMemo(() => prepareFileTreeInput(paths, { flattenEmptyDirectories: true }), [paths])

  useEffect(() => {
    fileByPathRef.current = fileByPath
    onOpenFileRef.current = onOpenFile
  }, [fileByPath, onOpenFile])

  const handleSelectionChange = useCallback((selectedPaths: readonly string[]) => {
    const file = selectedPaths.map((path) => fileByPathRef.current.get(path)).find((entry) => entry !== undefined)
    if (file) onOpenFileRef.current(file)
  }, [])

  const { model } = useFileTree({
    paths,
    preparedInput,
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    initialSelectedPaths: activePath ? [activePath] : [],
    icons: { set: 'complete', colored: true },
    onSelectionChange: handleSelectionChange,
    search: true,
    stickyFolders: true,
  })

  useEffect(() => {
    model.resetPaths(paths, { preparedInput })
  }, [model, paths, preparedInput])

  useEffect(() => {
    const selectedPaths = model.getSelectedPaths()
    for (const selectedPath of selectedPaths) {
      if (selectedPath !== activePath) model.getItem(selectedPath)?.deselect()
    }
    if (activePath) {
      const item = model.getItem(activePath)
      item?.select()
      item?.focus()
      model.scrollToPath(activePath, { offset: 'nearest' })
    }
  }, [activePath, model])

  return (
    <FileTree model={model} className="workspace-tree" />
  )
}
