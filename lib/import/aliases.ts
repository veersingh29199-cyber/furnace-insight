import { normalizeToken } from '@/lib/input/common'
import { normalizeFurnaceCode, normalizeLineCode } from '@/lib/import/common'
import type { ImportAliasRecord, ImportFieldKey } from '@/types/import'

type FurnaceRef = { code: string; name: string }
type LineRef = { code: string; name: string }
type ProductRef = { name: string }

const BUILTIN_FIELD_ALIASES: Record<ImportFieldKey, string[]> = {
  date: ['일자', '날짜', 'date', 'day', '검침일'],
  ym: ['월', '작업월', 'ym', 'month'],
  work_month: ['작업월', '단조작업일', '작업일', '월', 'ym', 'month'],
  furnace_code: ['호기', '가열로', 'furnace', 'furnace_code'],
  line_code: ['라인', '생산라인', '공정', '프레스별', '작업장', 'line', 'line_code'],
  product_name: ['제품', '품목', '사양', '소재품명', '품명', '제품형상', 'product', 'product_name'],
  shift: ['주간', '야간', '주야', '작업조', 'day', 'night', 'both', 'shift'],
  value: ['값', '검침값', 'value', 'reading'],
  charge_weight_kg: ['장입량', '투입중량', '중량', 'charge', 'weight', 'kg'],
  gas_usage: ['가스사용량', '가스량', '검침값', '사용량', 'gas', 'usage'],
  source: ['출처', '구분', 'source', '검침구분'],
  plan_ton: ['계획', '목표', 'plan', 'plan_ton'],
  actual_ton: ['실적', '생산중량(양품)', '생산중량', '중량', 'actual', 'actual_ton'],
  hwangji_ton: ['황지', 'hwangji', 'hwangji_ton'],
  cogging_ton: ['코깅', 'cogging', 'cogging_ton'],
  work_hours: ['작업시간', '시간', 'hours', 'work_hours'],
  work_count: ['작업횟수', '횟수', 'count', 'work_count'],
  order_no: ['수주번호', '오더', 'order', 'lot', '지시번호', 'order_no'],
  note: ['비고', '메모', 'note'],
}

function addTokens(target: Set<string>, values: Array<string | null | undefined>) {
  values.forEach((value) => {
    const normalized = normalizeToken(value)
    if (normalized) target.add(normalized)
  })
}

export function buildFieldAliasMap(aliases: ImportAliasRecord[] = []) {
  const map = new Map<string, ImportFieldKey>()

  const builtinEntries: Array<[ImportFieldKey, string[]]> = [
    ['date', BUILTIN_FIELD_ALIASES.date],
    ['ym', BUILTIN_FIELD_ALIASES.ym],
    ['work_month', BUILTIN_FIELD_ALIASES.work_month],
    ['furnace_code', BUILTIN_FIELD_ALIASES.furnace_code],
    ['line_code', BUILTIN_FIELD_ALIASES.line_code],
    ['product_name', BUILTIN_FIELD_ALIASES.product_name],
    ['shift', BUILTIN_FIELD_ALIASES.shift],
    ['value', BUILTIN_FIELD_ALIASES.value],
    ['charge_weight_kg', BUILTIN_FIELD_ALIASES.charge_weight_kg],
    ['gas_usage', BUILTIN_FIELD_ALIASES.gas_usage],
    ['source', BUILTIN_FIELD_ALIASES.source],
    ['plan_ton', BUILTIN_FIELD_ALIASES.plan_ton],
    ['actual_ton', BUILTIN_FIELD_ALIASES.actual_ton],
    ['hwangji_ton', BUILTIN_FIELD_ALIASES.hwangji_ton],
    ['cogging_ton', BUILTIN_FIELD_ALIASES.cogging_ton],
    ['work_hours', BUILTIN_FIELD_ALIASES.work_hours],
    ['work_count', BUILTIN_FIELD_ALIASES.work_count],
    ['order_no', BUILTIN_FIELD_ALIASES.order_no],
    ['note', BUILTIN_FIELD_ALIASES.note],
  ]

  builtinEntries.forEach(([field, values]) => {
    values.forEach((value) => {
      const token = normalizeToken(value)
      if (token) map.set(token, field)
    })
  })

  aliases
    .filter((alias) => alias.active)
    .forEach((alias) => {
      const token = normalizeToken(alias.alias_text)
      if (!token) return
      const canonical = alias.canonical_field as ImportFieldKey
      if (canonical in BUILTIN_FIELD_ALIASES) {
        map.set(token, canonical)
      }
    })

  return map
}

export function findFieldByHeader(header: string, aliasMap: Map<string, ImportFieldKey>) {
  const token = normalizeToken(header)
  if (!token) return null

  for (const [aliasToken, field] of aliasMap.entries()) {
    if (token === aliasToken || token.includes(aliasToken) || aliasToken.includes(token)) {
      return field
    }
  }

  return null
}

export function buildFurnaceLookup(furnaces: FurnaceRef[] = [], aliases: ImportAliasRecord[] = []) {
  const map = new Map<string, FurnaceRef>()

  furnaces.forEach((furnace) => {
    const tokens = new Set<string>()
    addTokens(tokens, [furnace.code, furnace.name, normalizeFurnaceCode(furnace.code), normalizeFurnaceCode(furnace.name)])

    const digits = furnace.code.match(/\d{1,2}/)?.[0]
    if (digits) {
      addTokens(tokens, [digits, `${digits}호`, `${digits}호기`, `#${digits}`, `no${digits}`])
    }

    tokens.forEach((token) => {
      map.set(token, furnace)
    })
  })

  aliases
    .filter((alias) => alias.active && alias.canonical_field === 'furnace_code')
    .forEach((alias) => {
      const token = normalizeToken(alias.alias_text)
      if (!token) return
      const normalizedAlias = normalizeFurnaceCode(alias.alias_text)
      const match =
        furnaces.find((furnace) => {
          const furnaceTokens = new Set<string>()
          addTokens(furnaceTokens, [furnace.code, furnace.name, normalizeFurnaceCode(furnace.code), normalizeFurnaceCode(furnace.name)])
          if (normalizedAlias) furnaceTokens.add(normalizedAlias)
          return furnaceTokens.has(token)
        }) ?? null

      if (match) map.set(token, match)
    })

  return map
}

export function buildLineLookup(lines: LineRef[] = [], aliases: ImportAliasRecord[] = []) {
  const map = new Map<string, LineRef>()

  lines.forEach((line) => {
    const tokens = new Set<string>()
    addTokens(tokens, [line.code, line.name, normalizeLineCode(line.code), normalizeLineCode(line.name)])
    tokens.forEach((token) => map.set(token, line))
  })

  aliases
    .filter((alias) => alias.active && alias.canonical_field === 'line_code')
    .forEach((alias) => {
      const token = normalizeToken(alias.alias_text)
      if (!token) return
      const normalizedAlias = normalizeLineCode(alias.alias_text)
      const match =
        lines.find((line) => {
          const lineTokens = new Set<string>()
          addTokens(lineTokens, [line.code, line.name, normalizeLineCode(line.code), normalizeLineCode(line.name)])
          if (normalizedAlias) lineTokens.add(normalizedAlias)
          return lineTokens.has(token)
        }) ?? null

      if (match) map.set(token, match)
    })

  return map
}

export function buildProductLookup(products: ProductRef[] = [], aliases: ImportAliasRecord[] = []) {
  const map = new Map<string, ProductRef>()

  products.forEach((product) => {
    const token = normalizeToken(product.name)
    if (token) map.set(token, product)
  })

  aliases
    .filter((alias) => alias.active && alias.canonical_field === 'product_name')
    .forEach((alias) => {
      const token = normalizeToken(alias.alias_text)
      if (!token) return
      const match = products.find((product) => normalizeToken(product.name) === token) ?? null
      if (match) map.set(token, match)
    })

  return map
}

export function buildAliasSourceMap(aliases: ImportAliasRecord[] = []) {
  return buildFieldAliasMap(aliases)
}
