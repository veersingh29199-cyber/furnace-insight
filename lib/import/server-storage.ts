import { createHash, randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DB, DB_CONFLICT_KEYS } from '@/types/db'
import type { ImportDatasetKey, ImportUploadRecord } from '@/types/import'

export const IMPORT_ATTACHMENT_BUCKET = DB.storage.importFiles

export type ImportUploadPayload = Omit<ImportUploadRecord, 'id' | 'created_at' | 'updated_at'> & {
  updated_at: string
}

export interface ImportAttachmentResult {
  bucket: string
  path: string
  fileHash: string
  fileSize: number
}

function sanitizeStorageSegment(value: string) {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_.-]+|[_.-]+$/g, '')
      .toLowerCase() || 'file'
  )
}

function sanitizeOriginalFileName(fileName: string) {
  const normalized = fileName.normalize('NFKD').replace(/[\\/]+/g, '_').trim()
  return normalized || 'file'
}

function buildStoragePath(datasetKey: ImportDatasetKey, fileName: string) {
  const now = new Date()
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const prefix = randomUUID()
  return [
    sanitizeStorageSegment(datasetKey),
    year,
    month,
    `${prefix}_${sanitizeOriginalFileName(fileName)}`,
  ].join('/')
}

export function buildImportAttachmentInfo(
  datasetKey: ImportDatasetKey,
  fileName: string,
  fileHash?: string
) {
  const path = buildStoragePath(datasetKey, fileName)
  return {
    bucket: IMPORT_ATTACHMENT_BUCKET,
    fileHash: fileHash ?? '',
    path,
  }
}

export async function uploadImportAttachment(
  supabase: SupabaseClient,
  file: File,
  datasetKey: ImportDatasetKey
): Promise<ImportAttachmentResult> {
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  const path = buildStoragePath(datasetKey, file.name)
  const { error } = await supabase.storage.from(IMPORT_ATTACHMENT_BUCKET).upload(path, new Blob([buffer], {
    type: file.type || 'application/octet-stream',
  }), {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })

  if (error) throw error

  return {
    bucket: IMPORT_ATTACHMENT_BUCKET,
    fileHash,
    fileSize: file.size,
    path,
  }
}

export async function upsertImportUploadRecord(
  supabase: SupabaseClient,
  payload: ImportUploadPayload
): Promise<ImportUploadRecord> {
  const { data, error } = await supabase
    .from(DB.tables.importUploads)
    .upsert(payload, { onConflict: DB_CONFLICT_KEYS.importUploads, ignoreDuplicates: false })
    .select('*')
    .single()

  if (error) throw error
  return data as ImportUploadRecord
}
