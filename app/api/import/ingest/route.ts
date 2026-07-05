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
  saveLineOutputImports,
  saveRawMaterialSpecImports,
  saveTargetImports,
  saveProductionImports,
  saveWorkStandardImports,
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
  LineOutputDailyImportRow,
  LineOutputMonthlyImportRow,
  RawMaterialSpecImportRow,
  TargetImportRow,
  ProductionImportRow,
  WorkStandardImportRow,
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
  layout: ImportMappingState['layout'],
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

  if (datasetKey === 'line-output') {
    return saveLineOutputImports(
      supabase,
      validRows as Array<LineOutputDailyImportRow | LineOutputMonthlyImportRow>,
      {
        userId,
      },
      layout === 'line-output-monthly' ? 'line-output-monthly' : 'line-output-daily'
    )
  }

  if (datasetKey === 'targets') {
    return saveTargetImports(supabase, validRows as TargetImportRow[])
  }

  if (datasetKey === 'work-standards') {
    return saveWorkStandardImports(supabase, validRows as WorkStandardImportRow[])
  }

  if (datasetKey === 'raw-material-specs') {
    return saveRawMaterialSpecImports(supabase, validRows as RawMaterialSpecImportRow[])
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

    const attachment = await uploadImportAttachment(
      supabase,
      fileValue,
      (parsedMapping?.datasetKey ?? analyses[0]?.datasetGuess ?? 'gas-monthly') as ImportDatasetKey
    )

    const requestedSheet = analyses.find((sheet) => sheet.sheetName === sheetName) ?? analyses[0]
    const fileDatasetKey = (parsedMapping?.datasetKey ?? requestedSheet?.datasetGuess ?? 'gas-monthly') as ImportDatasetKey
    const sheetsToProcess =
      fileDatasetKey === 'line-output'
        ? analyses.filter((sheet) => sheet.datasetGuess === 'line-output')
        : [requestedSheet]

    const sheetQueue = sheetsToProcess.length > 0 ? sheetsToProcess : requestedSheet ? [requestedSheet] : []
    if (sheetQueue.length === 0) {
      return NextResponse.json({ error: '대상 시트를 찾지 못했습니다.' }, { status: 400 })
    }

    const uploadResults: Array<{ summary: ImportSaveSummary; upload: Awaited<ReturnType<typeof upsertImportUploadRecord>> }> = []
    let totalSaved = 0
    let totalFailed = 0
    let totalValidRows = 0
    let totalInvalidRows = 0
    const errorMessages: string[] = []

    for (const sheet of sheetQueue) {
      const datasetKey = (parsedMapping?.datasetKey ?? sheet.datasetGuess ?? fileDatasetKey) as ImportDatasetKey
      const effectiveMapping =
        datasetKey === 'line-output'
          ? buildDefaultImportMappingForSheet(sheet, datasetKey)
          : mergeMapping(
              parsedMapping ? { ...parsedMapping, datasetKey } : null,
              sheet.sheetName,
              datasetKey
            )

      const preview = buildImportPreview(sheet, effectiveMapping, {
        datasetKey: effectiveMapping.datasetKey,
        layout: effectiveMapping.layout,
        signature: sheet.templateSignature,
        columns: sheet.columns,
        bindings: {} as never,
        master,
      })

      const storedUpload = await upsertImportUploadRecord(supabase, {
        dataset_key: effectiveMapping.datasetKey,
        sheet_name: sheet.sheetName,
        file_name: fileValue.name,
        storage_bucket: attachment.bucket,
        storage_path: attachment.path,
        file_hash: attachment.fileHash,
        file_size: attachment.fileSize,
        layout: effectiveMapping.layout,
        row_count: preview.rows.length,
        saved_count: 0,
        failed_count: preview.invalidRowCount,
        warning_count: preview.warningRowCount,
        template_name: templateName,
        mapping_json: serializeImportMapping(effectiveMapping, sheet),
        summary_json: {
          status: 'stored',
          validRows: preview.validRows.length,
          invalidRows: preview.invalidRowCount,
          warningRows: preview.warningRowCount,
          rowCount: preview.rows.length,
          fileHash: attachment.fileHash,
          sheetConfidence: sheet.confidence,
        },
        status: 'stored',
        template_id: null,
        parsed_at: null,
        error_message: null,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })

      const rowsWithUploadId = preview.validRows.map((row) => ({
        ...(row as unknown as Record<string, unknown>),
        source_upload_id: storedUpload.id,
      }))

      const summary =
        rowsWithUploadId.length > 0
          ? await saveRows(
              supabase,
              effectiveMapping.datasetKey,
              effectiveMapping.layout,
              rowsWithUploadId,
              user?.id ?? null,
              enteredByName,
              enteredByShift
            )
          : {
              total: rowsWithUploadId.length,
              saved: 0,
              failed: 0,
              errors: [],
            }

      totalSaved += summary.saved
      totalFailed += summary.failed
      totalValidRows += preview.validRows.length
      totalInvalidRows += preview.invalidRowCount
      errorMessages.push(...summary.errors.slice(0, 10).map((item) => item.message))

      const finalUpload = await upsertImportUploadRecord(supabase, {
        dataset_key: effectiveMapping.datasetKey,
        sheet_name: sheet.sheetName,
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
        mapping_json: serializeImportMapping(effectiveMapping, sheet),
        summary_json: {
          status: summary.failed > 0 && summary.saved === 0 ? 'failed' : 'parsed',
          previewSummary: `${summary.saved} saved / ${summary.failed} failed`,
          validRows: preview.validRows.length,
          invalidRows: preview.invalidRowCount,
          warningRows: preview.warningRowCount,
          rowCount: preview.rows.length,
          fileHash: attachment.fileHash,
          sheetConfidence: sheet.confidence,
          sourceUploadId: storedUpload.id,
        },
        status: summary.failed > 0 && summary.saved === 0 ? 'failed' : 'parsed',
        template_id: null,
        parsed_at: new Date().toISOString(),
        error_message: summary.errors[0]?.message ?? null,
        created_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      })

      uploadResults.push({ summary, upload: finalUpload })
    }

    const summary: ImportSaveSummary = {
      total: totalValidRows,
      saved: totalSaved,
      failed: totalFailed + totalInvalidRows,
      errors: errorMessages.slice(0, 10).map((message, index) => ({
        rowIndex: index,
        message,
      })),
    }

    return NextResponse.json({
      summary,
      upload: uploadResults[0]?.upload ?? null,
      uploads: uploadResults.map((item) => item.upload),
      sheetName: sheetQueue.map((item) => item.sheetName),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '파일 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
