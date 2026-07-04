'use client'

import * as React from 'react'
import { keyColumn, type CellProps, type Column, createTextColumn, floatColumn, intColumn } from 'react-datasheet-grid'
import { cn } from '@/lib/utils'
import { normalizeToken, parseLooseNumber } from '@/lib/input/common'

export type SelectOption = {
  label: string
  value: string
}

type SelectColumnData = {
  options: SelectOption[]
  placeholder?: string
  allowEmpty?: boolean
}

function DateCell<T extends string | null>({
  focus,
  rowData,
  setRowData,
  stopEditing,
}: CellProps<T, unknown>) {
  const ref = React.useRef<HTMLInputElement>(null)

  React.useLayoutEffect(() => {
    if (!ref.current) return

    if (focus) {
      ref.current.focus()
      ref.current.showPicker?.()
    } else {
      ref.current.blur()
    }
  }, [focus])

  return (
    <input
      ref={ref}
      type="date"
      tabIndex={-1}
      value={(rowData ?? '') as string}
      className={cn(
        'dsg-input h-full w-full rounded-none border-0 bg-transparent px-2 text-sm text-foreground outline-none',
        'focus:ring-0 focus-visible:ring-0'
      )}
      style={{ pointerEvents: focus ? 'auto' : 'none' }}
      onChange={(event) => {
        setRowData((event.target.value || null) as T)
      }}
      onBlur={() => {
        stopEditing()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          stopEditing()
        }
      }}
    />
  )
}

type AnyColumn<T> = Partial<Column<T, unknown, string>>

function SelectCell<T extends string | null>({
  focus,
  rowData,
  setRowData,
  stopEditing,
  columnData,
}: CellProps<T, SelectColumnData>) {
  const ref = React.useRef<HTMLSelectElement>(null)

  React.useLayoutEffect(() => {
    if (!ref.current) return

    if (focus) {
      ref.current.focus()
    } else {
      ref.current.blur()
    }
  }, [focus])

  return (
    <select
      ref={ref}
      tabIndex={-1}
      value={(rowData ?? '') as string}
      className={cn(
        'dsg-input appearance-none rounded-none border-0 bg-transparent px-2 text-sm text-foreground outline-none',
        'focus:ring-0 focus-visible:ring-0'
      )}
      style={{ pointerEvents: focus ? 'auto' : 'none' }}
      onChange={(event) => {
        const next = event.target.value || null
        setRowData(next as T)
        stopEditing()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          stopEditing()
        }
      }}
    >
      <option value="">{columnData.placeholder ?? '선택'}</option>
      {columnData.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function ReadOnlyCell<T>({
  rowData,
}: CellProps<T, { format?: (value: T) => React.ReactNode }>) {
  return (
    <div className="flex h-full items-center px-2 text-sm text-foreground/90">
      {rowData == null || rowData === '' ? <span className="text-muted-foreground">-</span> : String(rowData)}
    </div>
  )
}

export function createSelectKeyColumn<T extends object, K extends keyof T>(
  key: K,
  title: React.ReactNode,
  options: SelectOption[],
  config?: {
    placeholder?: string
    minWidth?: number
    basis?: number
    allowEmpty?: boolean
  }
): AnyColumn<T> {
  const base = createTextColumn({
      placeholder: config?.placeholder,
      alignRight: false,
      parseUserInput: (value) => value.trim(),
      formatBlurredInput: (value) => String(value ?? ''),
      formatInputOnFocus: (value) => String(value ?? ''),
      parsePastedValue: (value) => value.trim(),
    }) as unknown as Partial<Column<T[K], unknown, string>>

  return keyColumn(
    key as never,
    Object.assign({}, base, {
      title,
      basis: config?.basis ?? 180,
      grow: 1,
      shrink: 1,
      minWidth: config?.minWidth ?? 150,
      component: SelectCell as never,
      columnData: {
        options,
        placeholder: config?.placeholder,
        allowEmpty: config?.allowEmpty ?? true,
      },
      deleteValue: () => null as never,
      copyValue: ({ rowData }: { rowData: unknown }) => (rowData == null ? '' : String(rowData)),
      pasteValue: ({ value }: { value: string }) => {
        const normalizedValue = normalizeToken(value)
        const found = options.find(
          (option) =>
            normalizeToken(option.value) === normalizedValue ||
            normalizeToken(option.label) === normalizedValue
        )

        return (found?.value ?? (value.trim() || null)) as never
      },
      isCellEmpty: ({ rowData }: { rowData: unknown }) => rowData == null || rowData === '',
    }) as never
  ) as AnyColumn<T>
}

export function createTextKeyColumn<T extends object, K extends keyof T>(
  key: K,
  title: React.ReactNode,
  config?: {
    placeholder?: string
    basis?: number
    minWidth?: number
    alignRight?: boolean
  }
): AnyColumn<T> {
  const base = createTextColumn({
      placeholder: config?.placeholder,
      alignRight: config?.alignRight ?? false,
      parseUserInput: (value) => value.trim(),
      formatBlurredInput: (value) => String(value ?? ''),
      formatInputOnFocus: (value) => String(value ?? ''),
      parsePastedValue: (value) => value.replace(/[\n\r]+/g, ' ').trim(),
    }) as unknown as Partial<Column<T[K], unknown, string>>

  return keyColumn(
    key as never,
    Object.assign({}, base, {
      title,
      basis: config?.basis ?? 160,
      grow: 1,
      shrink: 1,
      minWidth: config?.minWidth ?? 120,
    }) as never
  ) as AnyColumn<T>
}

export function createDateKeyColumn<T extends object, K extends keyof T>(
  key: K,
  title: React.ReactNode,
  config?: {
    basis?: number
    minWidth?: number
  }
): AnyColumn<T> {
  const base = createTextColumn({
    placeholder: '',
    alignRight: false,
    parseUserInput: (value) => value.trim(),
    formatBlurredInput: (value) => String(value ?? ''),
    formatInputOnFocus: (value) => String(value ?? ''),
    parsePastedValue: (value) => value.trim(),
  }) as unknown as Partial<Column<T[K], unknown, string>>

  return keyColumn(
    key as never,
    Object.assign({}, base, {
      title,
      basis: config?.basis ?? 130,
      grow: 1,
      shrink: 1,
      minWidth: config?.minWidth ?? 120,
      component: DateCell as never,
      deleteValue: () => null as never,
      copyValue: ({ rowData }: { rowData: unknown }) => (rowData == null ? '' : String(rowData)),
      pasteValue: ({ value }: { value: string }) => value.trim() as never,
      isCellEmpty: ({ rowData }: { rowData: unknown }) => rowData == null || rowData === '',
    }) as never
  ) as AnyColumn<T>
}

export function createNumberKeyColumn<T extends object, K extends keyof T>(
  key: K,
  title: React.ReactNode,
  config?: {
    placeholder?: string
    basis?: number
    minWidth?: number
    integer?: boolean
  }
): AnyColumn<T> {
  const base = config?.integer ? intColumn : floatColumn

  return keyColumn(key as never, {
    ...base,
    title,
    basis: config?.basis ?? 120,
    grow: 1,
    shrink: 1,
    minWidth: config?.minWidth ?? 100,
    deleteValue: () => null as never,
    pasteValue: ({ value }: { value: string }) => {
      const parsed = parseLooseNumber(value)
      return (parsed == null ? null : config?.integer ? Math.trunc(parsed) : parsed) as never
    },
    isCellEmpty: ({ rowData }: { rowData: unknown }) => rowData == null || rowData === '',
  } as never) as AnyColumn<T>
}

export function createDynamicNumberKeyColumn<T extends object>(
  key: string,
  title: React.ReactNode,
  config?: {
    placeholder?: string
    basis?: number
    minWidth?: number
    integer?: boolean
  }
): AnyColumn<T> {
  const base = config?.integer ? intColumn : floatColumn

  return keyColumn(key as never, {
    ...base,
    title,
    basis: config?.basis ?? 110,
    grow: 1,
    shrink: 1,
    minWidth: config?.minWidth ?? 96,
    deleteValue: () => null as never,
    pasteValue: ({ value }: { value: string }) => {
      const parsed = parseLooseNumber(value)
      return (parsed == null ? null : config?.integer ? Math.trunc(parsed) : parsed) as never
    },
    isCellEmpty: ({ rowData }: { rowData: unknown }) => rowData == null || rowData === '',
  } as never) as AnyColumn<T>
}

export function createReadOnlyKeyColumn<T extends object, K extends keyof T>(
  key: K,
  title: React.ReactNode,
  config?: {
    basis?: number
    minWidth?: number
    alignRight?: boolean
  }
): AnyColumn<T> {
  return keyColumn(key as never, {
    title,
    basis: config?.basis ?? 120,
    grow: 0,
    shrink: 0,
    minWidth: config?.minWidth ?? 96,
    component: ReadOnlyCell as never,
    disabled: true,
    disableKeys: true,
    keepFocus: false,
    deleteValue: () => null as never,
    copyValue: ({ rowData }: { rowData: unknown }) => (rowData == null ? '' : String(rowData)),
    pasteValue: ({ rowData }: { rowData: unknown }) => rowData as never,
    isCellEmpty: ({ rowData }: { rowData: unknown }) => rowData == null || rowData === '',
    cellClassName: cn('bg-muted/20'),
  } as never) as AnyColumn<T>
}
