'use client'

import { useState, useSyncExternalStore } from 'react'

export interface OperatorInfo {
  name: string
  shift: 'day' | 'night'
}

const STORAGE_KEY_NAME = 'furnace_operator_name'
const STORAGE_KEY_SHIFT = 'furnace_operator_shift'
const STORAGE_KEY_LIST = 'furnace_operators_list'

export const DEFAULT_OPERATORS = [
  '김철수 (단조1팀)',
  '이영희 (단조2팀)',
  '박민수 (열처리반장)',
  '정수진 (생산관리자)',
  '최수진 (현장관리자)',
]

const DEFAULT_OPERATOR_NAME = DEFAULT_OPERATORS[0]

function readStoredOperatorName() {
  if (typeof window === 'undefined') return DEFAULT_OPERATOR_NAME
  return window.localStorage.getItem(STORAGE_KEY_NAME) || DEFAULT_OPERATOR_NAME
}

function readStoredOperatorShift() {
  if (typeof window === 'undefined') return 'day' as const
  return (window.localStorage.getItem(STORAGE_KEY_SHIFT) as 'day' | 'night') || 'day'
}

function readStoredOperatorList() {
  if (typeof window === 'undefined') return DEFAULT_OPERATORS
  const savedList = window.localStorage.getItem(STORAGE_KEY_LIST)
  if (!savedList) return DEFAULT_OPERATORS

  try {
    const parsed = JSON.parse(savedList)
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : DEFAULT_OPERATORS
  } catch {
    return DEFAULT_OPERATORS
  }
}

export function useOperator() {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
  const [name, setName] = useState<string>(readStoredOperatorName)
  const [shift, setShift] = useState<'day' | 'night'>(readStoredOperatorShift)
  const [operatorList, setOperatorList] = useState<string[]>(readStoredOperatorList)

  const updateName = (newName: string) => {
    setName(newName)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_NAME, newName)
    }
  }

  const updateShift = (newShift: 'day' | 'night') => {
    setShift(newShift)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SHIFT, newShift)
    }
  }

  const addOperatorPreset = (newOp: string) => {
    if (!newOp.trim()) return
    const updated = Array.from(new Set([...operatorList, newOp.trim()]))
    setOperatorList(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(updated))
    }
  }

  const removeOperatorPreset = (targetOp: string) => {
    const updated = operatorList.filter((o) => o !== targetOp)
    setOperatorList(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(updated))
    }
  }

  return {
    name: mounted ? name : DEFAULT_OPERATOR_NAME,
    shift: mounted ? shift : 'day',
    operatorList: mounted ? operatorList : DEFAULT_OPERATORS,
    setName: updateName,
    setShift: updateShift,
    addOperatorPreset,
    removeOperatorPreset,
    mounted,
  }
}
