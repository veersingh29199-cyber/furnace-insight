import { normalizeToken } from '@/lib/input/common'
import { normalizeFurnaceCode, normalizeLineCode } from '@/lib/import/common'
import type { ImportAliasRecord, ImportFieldKey } from '@/types/import'

type FurnaceRef = { code: string; name: string }
type LineRef = { code: string; name: string }
type ProductRef = { name: string }

const BUILTIN_FIELD_ALIASES: Record<ImportFieldKey, string[]> = {
  date: ['date', 'day', '일자', '날짜'],
  work_date: ['work_date', '작업일', '일자', '날짜'],
  ym: ['ym', 'month', '월', '기준월'],
  work_month: ['work_month', '작업월', '월', '기준월'],
  dept_line: ['dept_line', '작업부서', '부서', '라인'],
  line_code: ['line_code', '라인코드', '생산라인', '공정라인'],
  product: ['product', '제품'],
  product_name: ['product_name', '제품명', '품명', '제품'],
  material: ['material', '재질', '소재'],
  process: ['process', '공정'],
  shift: ['shift', '주야', '주간', '야간', 'day', 'night', 'both'],
  value: ['value', '값', '검침값', '가스사용량'],
  charge_weight_kg: ['charge_weight_kg', '장입량', '투입중량', 'kg'],
  charge_weight: ['charge_weight', '장입량', '투입중량'],
  gas_usage: ['gas_usage', '가스사용량', '사용량', '검침값'],
  source: ['source', '출처', '구분'],
  order_size: ['order_size', '수주치수', '수주규격'],
  work_size: ['work_size', '작업치수', '작업규격'],
  order_weight: ['order_weight', '수주중량', '실적', '생산량', 'actual', 'actual_ton'],
  plan_ton: ['plan_ton', '계획', '목표'],
  actual_ton: ['actual_ton', '실적', '생산량'],
  hwangji_ton: ['hwangji_ton', '황지'],
  cogging_ton: ['cogging_ton', '코깅'],
  rework_self_ton: ['rework_self_ton', '자체수정'],
  rework_quality_ton: ['rework_quality_ton', '품질수정'],
  furnace_code: ['furnace_code', '가열로', '호기', 'furnace'],
  work_hours: ['work_hours', '작업시간', '시간', 'hours'],
  work_count: ['work_count', '작업횟수', '횟수', 'count'],
  order_no: ['order_no', '수주번호', '오더번호', 'lot', 'order'],
  note: ['note', '비고', '메모'],
  ton_per_hour: ['ton_per_hour', 'tph', '시간당생산량'],
  ton_per_run: ['ton_per_run', '1회당생산량', 'tpr'],
  entered_by_name: ['entered_by_name', '입력자', '입력자명'],
}

function addTokens(target: Set<string>, values: Array<string | null | undefined>) {
  values.forEach((value) => {
    const token = normalizeToken(value)
    if (token) target.add(token)
  })
}

function registerFieldTokens(map: Map<string, ImportFieldKey>, field: ImportFieldKey, values: string[]) {
  values.forEach((value) => {
    const token = normalizeToken(value)
    if (token) map.set(token, field)
  })
}

export function buildFieldAliasMap(aliases: ImportAliasRecord[] = []) {
  const map = new Map<string, ImportFieldKey>();

  const entries = Object.entries(BUILTIN_FIELD_ALIASES) as Array<[ImportFieldKey, string[]]>
  entries.forEach(([field, values]) => {
    registerFieldTokens(map, field, values)
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
      addTokens(tokens, [digits, `${digits}호기`, `#${digits}`, `no${digits}`])
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
