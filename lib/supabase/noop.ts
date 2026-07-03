const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_ANON_KEY = 'placeholder-anon-key'

type TableRow = Record<string, unknown>
type TableStore = Record<string, TableRow[]>

type QueryFilter =
  | { type: 'eq'; column: string; value: unknown }
  | { type: 'not'; column: string; operator: string; value: unknown }
  | { type: 'gte'; column: string; value: unknown }
  | { type: 'lte'; column: string; value: unknown }
  | { type: 'in'; column: string; values: unknown[] }

type OrderSpec = {
  column: string
  ascending: boolean
  nullsFirst: boolean
}

type QueryState = {
  table: string | null
  operation: 'read' | 'insert' | 'upsert' | 'update' | 'delete' | 'rpc'
  payload: unknown
  filters: QueryFilter[]
  orders: OrderSpec[]
  limit: number | null
  single: boolean
  head: boolean
  selectRequested: boolean
  conflictKeys: string[] | null
  ignoreDuplicates: boolean
}

type NoopQueryBuilder = {
  then: Promise<unknown>['then']
  catch: Promise<unknown>['catch']
  finally: Promise<unknown>['finally']
  [key: string]: unknown
}

const FIXED_TIMESTAMP = '2026-01-01T00:00:00.000Z'

const demoStore: TableStore = createInitialStore()
const noopGlobal =
  typeof window !== 'undefined'
    ? window
    : typeof self !== 'undefined'
      ? self
      : globalThis

;(noopGlobal as typeof noopGlobal & { __NOOP_SUPABASE_STORE__?: TableStore }).__NOOP_SUPABASE_STORE__ = demoStore

function isMissing(value: string | undefined | null) {
  return !value || value === PLACEHOLDER_URL || value === PLACEHOLDER_ANON_KEY
}

export function isSupabaseConfigured() {
  return !isMissing(process.env.NEXT_PUBLIC_SUPABASE_URL) && !isMissing(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

function createInitialStore(): TableStore {
  const furnaces = Array.from({ length: 20 }, (_, index) => {
    const code = `${index + 1}\uD638\uAE30`
    return {
      id: index + 1,
      code,
      name: code,
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    }
  })

  const lines = Array.from({ length: 5 }, (_, index) => {
    const code = `${index + 1}\uB77C\uC778`
    return {
      id: index + 1,
      code,
      name: code,
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    }
  })

  const products = [
    {
      id: 1,
      name: '\uAE30\uBCF8\uD488\uBAA9',
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
    {
      id: 2,
      name: '\uC608\uC2DC\uD488\uBAA9A',
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
    {
      id: 3,
      name: '\uC608\uC2DC\uD488\uBAA9B',
      active: true,
      created_at: FIXED_TIMESTAMP,
      updated_at: FIXED_TIMESTAMP,
    },
  ]

  return {
    furnaces,
    lines,
    products,
    gas_daily_readings: [],
    gas_records: [],
    production_records: [],
    gas_company_monthly: [],
    import_aliases: [],
    import_templates: [],
    import_uploads: [],
    targets: [],
    benchmarks: [],
    profiles: [],
  }
}

function cloneValue<T>(value: T): T {
  const structuredCloneFn = globalThis.structuredClone
  if (typeof structuredCloneFn === 'function') {
    return structuredCloneFn(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function isTableRow(value: unknown): value is TableRow {
  return typeof value === 'object' && value !== null
}

function ensureTable(table: string) {
  if (!demoStore[table]) {
    demoStore[table] = []
  }
  return demoStore[table]
}

function nextId(rows: TableRow[]) {
  const numericIds = rows
    .map((row) => row.id)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : rows.length + 1
}

function compareValues(a: unknown, b: unknown) {
  if (a === b) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1
  const aText = String(a)
  const bText = String(b)
  return aText < bText ? -1 : aText > bText ? 1 : 0
}

function matchesFilter(row: TableRow, filter: QueryFilter) {
  const value = row[filter.column]

  switch (filter.type) {
    case 'eq':
      return value === filter.value
    case 'not':
      if (filter.operator === 'is' && filter.value == null) {
        return value != null
      }
      return value !== filter.value
    case 'gte':
      if (value == null || filter.value == null) return false
      return compareValues(value, filter.value) >= 0
    case 'lte':
      if (value == null || filter.value == null) return false
      return compareValues(value, filter.value) <= 0
    case 'in':
      return filter.values.some((candidate) => candidate === value)
    default:
      return true
  }
}

function applyFilters(rows: TableRow[], filters: QueryFilter[]) {
  if (filters.length === 0) return rows
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)))
}

function applyOrdering(rows: TableRow[], orders: OrderSpec[]) {
  if (orders.length === 0) return rows
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const leftValue = left[order.column]
      const rightValue = right[order.column]

      if (leftValue == null && rightValue == null) continue
      if (leftValue == null) return order.nullsFirst ? -1 : 1
      if (rightValue == null) return order.nullsFirst ? 1 : -1

      const comparison = compareValues(leftValue, rightValue)
      if (comparison !== 0) {
        return order.ascending ? comparison : -comparison
      }
    }
    return 0
  })
}

function applyLimit(rows: TableRow[], limit: number | null) {
  if (limit == null) return rows
  return rows.slice(0, Math.max(0, limit))
}

function selectRows(table: string, state: QueryState) {
  const rows = ensureTable(table)
  const filtered = applyOrdering(applyFilters(rows, state.filters), state.orders)
  const counted = filtered.length
  const limited = applyLimit(filtered, state.limit)

  if (state.head) {
    return {
      data: null,
      error: null,
      count: counted,
      status: 200,
      statusText: 'OK',
    }
  }

  if (state.single) {
    return {
      data: limited.length > 0 ? cloneValue(limited[0]) : null,
      error: null,
      count: counted,
      status: 200,
      statusText: 'OK',
    }
  }

  return {
    data: cloneValue(limited),
    error: null,
    count: counted,
    status: 200,
    statusText: 'OK',
  }
}

function normalizePayload(payload: unknown): TableRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(isTableRow).map((row) => cloneValue(row))
  }
  if (isTableRow(payload)) {
    return [cloneValue(payload)]
  }
  return []
}

function getConflictColumns(onConflict: unknown) {
  if (typeof onConflict !== 'string') return []
  return onConflict
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function findConflictIndex(rows: TableRow[], nextRow: TableRow, conflictColumns: string[]) {
  if (conflictColumns.length === 0) return -1
  return rows.findIndex((row) => conflictColumns.every((column) => row[column] === nextRow[column]))
}

function makeWriteResult(data: unknown = null) {
  return {
    data,
    error: null,
    count: Array.isArray(data) ? data.length : data ? 1 : 0,
    status: 200,
    statusText: 'OK',
  }
}

function makeReadResult(single = false) {
  return {
    data: single ? null : [],
    error: null,
    count: 0,
    status: 200,
    statusText: 'OK',
  }
}

function applyWriteMutation(table: string, state: QueryState) {
  const rows = ensureTable(table)
  const payloadRows = normalizePayload(state.payload)

  if (state.operation === 'delete') {
    const deleted = rows.filter((row) => state.filters.every((filter) => matchesFilter(row, filter)))
    demoStore[table] = rows.filter((row) => !state.filters.every((filter) => matchesFilter(row, filter)))
    return state.selectRequested || state.single ? selectRows(table, { ...state, operation: 'read' }) : makeWriteResult(cloneValue(deleted))
  }

  if (state.operation === 'update') {
    const updatedRows: TableRow[] = []
    for (const row of rows) {
      if (state.filters.every((filter) => matchesFilter(row, filter))) {
        const nextRow = { ...row, ...(payloadRows[0] ?? {}) }
        Object.assign(row, nextRow)
        updatedRows.push(cloneValue(row))
      }
    }
    return state.selectRequested || state.single ? makeWriteResult(state.single ? updatedRows[0] ?? null : updatedRows) : makeWriteResult()
  }

  if (state.operation === 'insert' || state.operation === 'upsert') {
    const conflictColumns = state.operation === 'upsert' ? state.conflictKeys ?? [] : []
    const affectedRows: TableRow[] = []

    for (const incoming of payloadRows) {
      const nextRow: TableRow = { ...incoming }
      if (nextRow.id == null) {
        nextRow.id = nextId(rows)
      }
      if (nextRow.created_at == null) {
        nextRow.created_at = new Date().toISOString()
      }
      nextRow.updated_at = new Date().toISOString()

      const conflictIndex = findConflictIndex(rows, nextRow, conflictColumns)
      if (conflictIndex >= 0) {
        const merged = { ...rows[conflictIndex], ...nextRow }
        rows[conflictIndex] = merged
        affectedRows.push(cloneValue(merged))
      } else {
        rows.push(nextRow)
        affectedRows.push(cloneValue(nextRow))
      }
    }

    if (state.selectRequested || state.single) {
      return makeWriteResult(state.single ? affectedRows[0] ?? null : affectedRows)
    }
    return makeWriteResult()
  }

  return makeWriteResult()
}

function createNoopQueryBuilder(table?: string | null, initialOperation: QueryState['operation'] = 'read') {
  const state: QueryState = {
    table: table ?? null,
    operation: initialOperation,
    payload: null,
    filters: [],
    orders: [],
    limit: null,
    single: false,
    head: false,
    selectRequested: false,
    conflictKeys: null,
    ignoreDuplicates: false,
  }

  const resolveResult = () => {
    if (!state.table) {
      return state.operation === 'read' ? makeReadResult(state.single) : makeWriteResult()
    }
    if (state.operation === 'read') {
      return selectRows(state.table, state)
    }
    return applyWriteMutation(state.table, state)
  }

  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string | symbol) {
      if (prop === 'then') {
        return (onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(resolveResult()).then(onFulfilled, onRejected)
      }
      if (prop === 'catch') {
        return (onRejected?: (reason: unknown) => unknown) => Promise.resolve(resolveResult()).catch(onRejected)
      }
      if (prop === 'finally') {
        return (onFinally?: () => void) => Promise.resolve(resolveResult()).finally(onFinally)
      }
      if (prop === 'single' || prop === 'maybeSingle') {
        return () => {
          state.single = true
          return proxy
        }
      }
      if (prop === 'select') {
        return (...args: unknown[]) => {
          state.operation = state.operation === 'read' ? 'read' : state.operation
          state.selectRequested = true
          const options = args[1] as { head?: boolean; count?: unknown } | undefined
          if (options && typeof options === 'object' && 'head' in options) {
            state.head = Boolean(options.head)
          }
          return proxy
        }
      }
      if (prop === 'eq') {
        return (column: string, value: unknown) => {
          state.filters.push({ type: 'eq', column, value })
          return proxy
        }
      }
      if (prop === 'gte') {
        return (column: string, value: unknown) => {
          state.filters.push({ type: 'gte', column, value })
          return proxy
        }
      }
      if (prop === 'lte') {
        return (column: string, value: unknown) => {
          state.filters.push({ type: 'lte', column, value })
          return proxy
        }
      }
      if (prop === 'in') {
        return (column: string, values: unknown[]) => {
          state.filters.push({ type: 'in', column, values })
          return proxy
        }
      }
      if (prop === 'not') {
        return (column: string, operator: string, value: unknown) => {
          state.filters.push({ type: 'not', column, operator, value })
          return proxy
        }
      }
      if (prop === 'order') {
        return (column: string, options?: { ascending?: boolean; nullsFirst?: boolean }) => {
          state.orders.push({
            column,
            ascending: options?.ascending ?? true,
            nullsFirst: options?.nullsFirst ?? false,
          })
          return proxy
        }
      }
      if (prop === 'limit') {
        return (value: number) => {
          state.limit = value
          return proxy
        }
      }
      if (prop === 'upsert' || prop === 'insert' || prop === 'update' || prop === 'delete') {
        return (payload: unknown, options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          state.operation = prop
          state.payload = payload
          state.conflictKeys = getConflictColumns(options?.onConflict)
          state.ignoreDuplicates = Boolean(options?.ignoreDuplicates)
          return proxy
        }
      }
      if (prop === 'rpc') {
        return (name: string, args?: unknown) => {
          state.operation = 'rpc'
          state.table = name
          state.payload = args ?? null
          return proxy
        }
      }
      if (prop === 'from') {
        return (nextTable: string) => createNoopQueryBuilder(nextTable)
      }
      return (...args: unknown[]) => {
        void args
        return proxy
      }
    },
  }) as NoopQueryBuilder

  return proxy
}

function createNoopStorageBucket() {
  return {
    upload: async () => makeWriteResult(),
    download: async () => ({ data: null, error: null }),
    remove: async () => makeWriteResult(),
    list: async () => makeReadResult(false),
    createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
    getPublicUrl: () => ({ data: { publicUrl: '' } }),
  }
}

function createNoopAuth() {
  return {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe() {},
        },
      },
      error: null,
    }),
    signInWithPassword: async () => makeWriteResult(),
    signOut: async () => ({ error: null }),
    signUp: async () => makeWriteResult(),
    resetPasswordForEmail: async () => makeWriteResult(),
    updateUser: async () => makeWriteResult(),
  }
}

export function createNoopSupabaseClient() {
  const from = (table: string) => createNoopQueryBuilder(table)
  const channel = () => ({
    on: () => channel(),
    subscribe: () => ({ unsubscribe() {} }),
    unsubscribe: async () => 'ok',
  })

  return {
    from,
    rpc: (name: string) => createNoopQueryBuilder(name, 'rpc'),
    auth: createNoopAuth(),
    storage: {
      from: () => createNoopStorageBucket(),
    },
    channel,
    removeChannel: async () => ({ error: null }),
    removeAllChannels: async () => ({ error: null }),
    getChannels: () => [],
  }
}
