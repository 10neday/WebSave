'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type FileRecord = {
  id: string
  name: string
  storage_path: string
  size: number
  mime_type: string
  created_at: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼'
  if (mimeType === 'application/pdf') return '📄'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📝'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📋'
  if (mimeType.startsWith('video/')) return '🎥'
  if (mimeType.startsWith('audio/')) return '🎵'
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return '🗜'
  if (mimeType.startsWith('text/')) return '📃'
  return '📁'
}

export default function DashboardPage() {
  const [files, setFiles] = useState<FileRecord[]>([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const router = useRouter()
  const supabase = createClient()

  const loadFiles = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setFiles(data ?? [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadFiles()
  }, [loadFiles])

  async function uploadFile(file: File) {
    const MAX = 50 * 1024 * 1024
    if (file.size > MAX) {
      setUploadError(`"${file.name}" is too large. Maximum is 50 MB.`)
      return
    }

    setUploading(true)
    setUploadError('')
    setUploadProgress(`Uploading "${file.name}"…`)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const storagePath = `${user.id}/${Date.now()}_${file.name}`

    const { error: storageError } = await supabase.storage
      .from('files')
      .upload(storagePath, file)

    if (storageError) {
      setUploadError(storageError.message)
      setUploading(false)
      setUploadProgress('')
      return
    }

    const { error: dbError } = await supabase.from('files').insert({
      name: file.name,
      storage_path: storagePath,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    })

    if (dbError) {
      setUploadError(dbError.message)
    } else {
      await loadFiles()
    }

    setUploading(false)
    setUploadProgress('')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await uploadFile(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragging(false)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    dragCounter.current = 0

    const file = e.dataTransfer.files?.[0]
    if (!file) return
    await uploadFile(file)
  }

  async function handleDownload(file: FileRecord) {
    const { data, error } = await supabase.storage
      .from('files')
      .createSignedUrl(file.storage_path, 60)

    if (error || !data) return

    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleDelete(file: FileRecord) {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return

    setDeletingId(file.id)
    await supabase.storage.from('files').remove([file.storage_path])
    await supabase.from('files').delete().eq('id', file.id)
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
    setDeletingId(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="min-h-screen flex flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(37,99,235,0.10)', border: '3px dashed #2563eb' }}
        >
          <div className="text-center">
            <p className="text-4xl mb-3">📂</p>
            <p className="text-lg font-semibold text-blue-600">Drop to upload</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <span className="font-bold text-lg tracking-tight">WebSave</span>
        <button
          onClick={handleLogout}
          className="text-sm transition-colors cursor-pointer"
          style={{ color: 'var(--muted)' }}
        >
          Sign out
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {/* Search + Upload row */}
        <div className="flex gap-3 mb-5">
          <input
            type="text"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
          >
            {uploading ? 'Uploading…' : 'Upload file'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
        </div>

        {/* Status messages */}
        {uploadProgress && (
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{uploadProgress}</p>
        )}
        {uploadError && (
          <p className="text-sm text-red-500 mb-4">{uploadError}</p>
        )}

        {/* File count */}
        {!loading && files.length > 0 && (
          <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
            {filtered.length === files.length
              ? `${files.length} file${files.length !== 1 ? 's' : ''}`
              : `${filtered.length} of ${files.length} files`}
          </p>
        )}

        {/* File list */}
        {loading ? (
          <p className="text-center py-16" style={{ color: 'var(--muted)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-16" style={{ color: 'var(--muted)' }}>
            {search ? 'No files match your search.' : 'No files yet. Upload your first file!'}
          </p>
        ) : (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {filtered.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <span className="text-xl shrink-0 select-none">{fileIcon(file.mime_type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                    {formatSize(file.size)} · {formatDate(file.created_at)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleDownload(file)}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    style={{ border: '1px solid var(--border)' }}
                  >
                    Download
                  </button>
                  <button
                    onClick={() => handleDelete(file)}
                    disabled={deletingId === file.id}
                    className="text-xs px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-red-500"
                    style={{ border: '1px solid #fca5a5' }}
                  >
                    {deletingId === file.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
