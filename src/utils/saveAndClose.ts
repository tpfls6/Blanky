export const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요.'

export type SaveLock = { current: boolean }

/**
 * Runs one save at a time and closes the input only after it succeeds.
 * A save that resolves to null or false counts as a failure, so the input stays open
 * with its values and the error; a call made while another save is running is ignored.
 */
export async function saveAndClose<T>(lock: SaveLock, save: () => T | Promise<T>, { close, fail, busy }: {
  close?: (result: Exclude<T, null | false>) => void
  fail: (message: string) => void
  busy?: (value: boolean) => void
}): Promise<boolean> {
  if (lock.current) return false
  lock.current = true
  busy?.(true)
  fail('')
  try {
    const result = await save()
    if (result === null || result === false) throw new Error(SAVE_FAILED)
    lock.current = false
    busy?.(false)
    close?.(result as Exclude<T, null | false>)
    return true
  } catch (caught) {
    fail(caught instanceof Error && caught.message ? caught.message : SAVE_FAILED)
    return false
  } finally {
    lock.current = false
    busy?.(false)
  }
}
