import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { readImportSheets } from '@/lib/import/common'
import { analyzeImportDocument } from '@/lib/import/detect'
import { buildDefaultImportMappingForSheet, buildImportPreview } from '@/lib/import/transform'
import { serializeImportMapping } from '@/lib/import/template'
import {
  uploadImportAttachment,
  upsertImportUploadRecord,
} from '@/lib/import/server-storage'
import {
  saveGasCompanyMonthlyImports,
  saveGasDailyImports,
  saveGasMonthlyImports,
  saveProductionImports,
  type ImportSaveSummary,
} from '@/lib/import/persistence'
import { DB } from '@/types/db'
import type {
  GasCompanyMonthlyImportRow,
  GasDailyImportRow,
  GasMonthlyImportRow,
  ImportAliasRecord,
  ImportDatasetKey,
  ImportMappingState,
  ProductionImportRow,
} from '@/types/import'

export const runtime = 'nodejs'

type MasterData = {
  furnaces: Array<{ code: string; name: string }>
  lines: Array<{ code: string; name: string }>
  products: Array<{ name: string }>
  aliases: ImportAliasRecord[]
}

function getFormText(value: FormDataEntryValue | null) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseJson<T>(value: FormDataEntryValue | null): T | null {
  const text = getFormText(value)
  if (!text) return null

  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

function mergeMapping(sheetMapping: ImportMappingState | null, sheetName: string, fallbackDatasetKey: ImportDatasetKey) {
  const defaultMapping = buildDefaultImportMappingForSheet(
    {
      sheetName,
      matrix: [],
      rowCount: 0,
      columnCount: 0,
      headerRowIndex: null,
      datasetGuess: fallbackDatasetKey,
      layoutGuess: 'auto',
      confidence: 0,
      headerTokens: [],
      columns: [],
      templateSignature: {
        datasetKey: fallbackDatasetKey,
        layout: 'auto',
        sheetName,
        sheetNameTokens: [],
        headerTokens: [],
      },
    },
    fallbackDatasetKey
  )

  if (!sheetMapping) {
    return {
      ...defaultMapping,
      sheetName,
    }
  }

  return {
    ...defaultMapping,
    ...sheetMapping,
    sheetName,
    fieldMap: {
      ...defaultMapping.fieldMap,
      ...(sheetMapping.fieldMap ?? {}),
    },
    staticValues: {
      ...defaultMapping.staticValues,
      ...(sheetMapping.staticValues ?? {}),
    },
    options: {
      ...defaultMapping.options,
      ...(sheetMapping.options ?? {}),
    },
  }
}

async function loadMasterData(supabase: Awaited<ReturnType<typeof createAdminClient>>): Promise<MasterData> {
  const [furnacesResult, linesResult, productsResult, aliasesResult] = await Promise.all([
    supabase.from(DB.tables.furnaces).select('code,name').eq('active', true).order('code'),
    supabase.from(DB.tables.lines).select('code,name').eq('active', true).order('code'),
    supabase.from(DB.tables.products).select('name').eq('active', true).order('name'),
    supabase.from(DB.tables.importAliases).select('*').eq('active', true).order('dataset_key').order('canonical_field').order('alias_text'),
  ])

  const firstError = [furnacesResult.error, linesResult.error, productsResult.error, aliasesResult.error].find(Boolean)
  if (firstError) throw firstError

  return {
    furnaces: (furnacesResult.data ?? []) as Array<{ code: string; name: string }>,
    lines: (linesResult.data ?? []) as Array<{ code: string; name: string }>,
    products: (productsResult.data ?? []) as Array<{ name: string }>,
    aliases: (aliasesResult.data ?? []) as MasterData['aliases'],
  }
}

async function saveRows(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  datasetKey: ImportDatasetKey,
  validRows: unknown[],
  userId: string | null,
  enteredByName: string | null,
  enteredByShift: string | null
): Promise<ImportSaveSummary> {
  if (datasetKey === 'gas-daily') {
    return saveGasDailyImports(supabase, validRows as GasDailyImportRow[], {
      userId,
      enteredByName,
      enteredByShift,
    })
  }

  if (datasetKey === 'gas-monthly') {
    return saveGasMonthlyImports(supabase, validRows as GasMonthlyImportRow[], {
      userId,
      enteredByName,
      enteredByShift,
    })
  }

  if (datasetKey === 'production') {
    return saveProductionImports(supabase, validRows as ProductionImportRow[], {
      userId,
      enteredByName,
      enteredByShift,
    })
  }

  return saveGasCompanyMonthlyImports(supabase, validRows as GasCompanyMonthlyImportRow[], {
    userId,
  })
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const fileValue = formData.get('file')
    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: '업로드 파일이 필요합니다.' }, { status: 400 })
    }

    const sheetName = getFormText(formData.get('sheetName')) || fileValue.name
    const enteredByName = getFormText(formData.get('enteredByName')) || null
    const enteredByShift = getFormText(formData.get('enteredByShift')) || null
    const templateName = getFormText(formData.get('templateName')) || null
    const parsedMapping = parseJson<ImportMappingState>(formData.get('mapping'))

    const supabase = await createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const master = await loadMasterData(supabase)
    const sheets = await readImportSheets(fileValue)
    const analyses = analyzeImportDocument(sheets, { aliases: master.aliases, fileName: fileValue.name })
    if (analyses.length === 0) {
      return NextResponse.json({ error: '분석할 시트를 찾지 못했습니다.' }, { status: 400 })
    }

    const requestedSheet = analyses.find((sheet) => sheet.sheetName === sheetName) ?? analyses[0]
    const datasetKey = (parsedMapping?.datasetKey ?? requestedSheet.datasetGuess ?? 'gas-monthly') as ImportDatasetKey
    const effectiveMapping = mergeMapping(
      parsedMapping ? { ...parsedMapping, datasetKey } : null,
      requestedSheet.sheetName,
      datasetKey
    )

    const preview = buildImportPreview(requestedSheet, effectiveMapping, {
      datasetKey: effectiveMapping.datasetKey,
      layout: effectiveMapping.layout,
      signature: requestedSheet.templateSignature,
      columns: requestedSheet.columns,
      bindings: {} as never,
      master,
    })

    const attachment = await uploadImportAttachment(
      supabase,
      fileValue,
      effectiveMapping.datasetKey,
      requestedSheet.sheetName
    )

    const summary = preview.validRows.length > 0
      ? await saveRows(
          supabase,
          effectiveMapping.datasetKey,
          preview.validRows as unknown[],
          user?.id ?? null,
          enteredByName,
          enteredByShift
        )
      : {
          total: preview.validRows.length,
          saved: 0,
          failed: 0,
          errors: [],
        }

    const uploadRecord = await upsertImportUploadRecord(supabase, {
      dataset_key: effectiveMapping.datasetKey,
      sheet_name: requestedSheet.sheetName,
      file_name: fileValue.name,
      storage_bucket: attachment.bucket,
      storage_path: attachment.path,
      file_hash: attachment.fileHash,
      file_size: attachment.fileSize,
      layout: effectiveMapping.layout,
      row_count: preview.rows.length,
      saved_count: summary.saved,
      failed_count: preview.invalidRowCount + summary.failed,
      warning_count: preview.warningRowCount,
      template_name: templateName,
      mapping_json: serializeImportMapping(effectiveMapping, requestedSheet),
      summary_json: {
        previewSummary: `${summary.saved} saved / ${summary.failed} failed`,
        validRows: preview.validRows.length,
        invalidRows: preview.invalidRowCount,
        warningRows: preview.warningRowCount,
        rowCount: preview.rows.length,
        fileHash: attachment.fileHash,
        sheetConfidence: requestedSheet.confidence,
      },
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })

    return NextResponse.json({
      summary,
      upload: uploadRecord,
      sheetName: requestedSheet.sheetName,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '파일 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
