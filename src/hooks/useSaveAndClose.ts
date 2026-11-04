import { useCallback, useRef, useState } from 'react'
import { saveAndClose } from '../utils/saveAndClose.ts'

/** Shared save handling for modals, popovers and editor tabs: close on success, keep input and show the error on failure. */
export function useSaveAndClose() {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(<T,>(save: () => T | Promise<T>, close?: (result: Exclude<T, null | false>) => void) =>
    saveAndClose(lock, save, { close, fail: setError, busy: setBusy }), [])
  return { busy, error, setError, run, locked: lock }
}
