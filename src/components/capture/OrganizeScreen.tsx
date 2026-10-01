import { useEffect, useState } from 'react'
import { LoadingState } from '../common/LoadingState.tsx'
import { useWorkspace } from '../../state/useWorkspace.ts'

const STEPS = [
  '해야 할 일을 찾고 있어요',
  '날짜와 시간을 확인하고 있어요',
  '우선순위를 정리하고 있어요',
  '일정을 배치하고 있어요',
] as const

export function OrganizeScreen() {
  const { finishOrganize } = useWorkspace()
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (visibleCount < STEPS.length) {
      const id = window.setTimeout(() => setVisibleCount((count) => count + 1), 320)
      return () => window.clearTimeout(id)
    }
    const id = window.setTimeout(() => finishOrganize(), 360)
    return () => window.clearTimeout(id)
  }, [visibleCount, finishOrganize])

  return (
    <LoadingState
      title="일정을 정리하고 있어요"
      steps={STEPS}
      visibleCount={visibleCount}
    />
  )
}
