"use client"

import { useState, useEffect } from 'react'

export interface OperatorInfo {
  name: string
  shift: 'day' | 'night'
}

const STORAGE_KEY_NAME  = 'furnace_operator_name'
const STORAGE_KEY_SHIFT = 'furnace_operator_shift'
const STORAGE_KEY_LIST  = 'furnace_operators_list'

export const DEFAULT_OPERATORS = [
  '김철수 (단조1팀)',
  '이영희 (단조2팀)',
  '박민수 (설비보전팀)',
  '정대현 (생산관리팀)',
  '최수진 (품질관리팀)',
]

export function useOperator() {
  const [name, setName] = useState<string>('')
  const [shift, setShift] = useState<'day' | 'night'>('day')
  const [operatorList, setOperatorList] = useState<string[]>(DEFAULT_OPERATORS)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const savedName  = localStorage.getItem(STORAGE_KEY_NAME) || '김철수 (단조1팀)'
    const savedShift = (localStorage.getItem(STORAGE_KEY_SHIFT) as 'day' | 'night') || 'day'
    setName(savedName)
    setShift(savedShift)

    const savedList = localStorage.getItem(STORAGE_KEY_LIST)
    if (savedList) {
      try {
        setOperatorList(JSON.parse(savedList))
      } catch {
        setOperatorList(DEFAULT_OPERATORS)
      }
    }
  }, [])

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
    const updated = operatorList.filter(o => o !== targetOp)
    setOperatorList(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(updated))
    }
  }

  return {
    name: mounted ? name : '김철수 (단조1팀)',
    shift: mounted ? shift : 'day',
    operatorList: mounted ? operatorList : DEFAULT_OPERATORS,
    setName: updateName,
    setShift: updateShift,
    addOperatorPreset,
    removeOperatorPreset,
    mounted,
  }
}
