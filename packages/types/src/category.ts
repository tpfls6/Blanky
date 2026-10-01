export type Category = {
  id: string
  userId: string
  name: string
  parentId: string | null
  icon: string | null
  color: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CategoryNode = Category & {
  children: CategoryNode[]
}
