import { Fragment } from 'react'
import { useWorkspace } from '../../state/useWorkspace.ts'
import type { WorkItem } from '../../types/work.ts'
import { groupTasks } from '../../utils/work.ts'
import { TaskGroup } from './TaskGroup.tsx'
import { TaskItem } from './TaskItem.tsx'

type TaskGroupsProps = {
  tasks: WorkItem[]
  meta?: 'today' | 'full'
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onTomorrow: (id: string) => void
}

export function TaskGroups({
  tasks,
  meta = 'full',
  onToggle,
  onOpen,
  onTomorrow,
}: TaskGroupsProps) {
  const { categories } = useWorkspace()
  const sections = groupTasks(tasks, categories)

  return (
    <div>
      {sections.map((section) => (
        <TaskGroup key={section.id} name={section.name} count={section.count}>
          {section.blocks.map((block) => (
            <Fragment key={block.id}>
              {block.name ? (
                <TaskGroup name={block.name} depth={1}>
                  {block.tasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      item={task}
                      meta={meta}
                      onToggle={onToggle}
                      onOpen={onOpen}
                      onTomorrow={onTomorrow}
                    />
                  ))}
                </TaskGroup>
              ) : (
                block.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    item={task}
                    meta={meta}
                    onToggle={onToggle}
                    onOpen={onOpen}
                    onTomorrow={onTomorrow}
                  />
                ))
              )}
            </Fragment>
          ))}
        </TaskGroup>
      ))}
    </div>
  )
}
