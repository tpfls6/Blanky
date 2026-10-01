export type ClassificationKind = 'event' | 'task'

export type FieldCorrection = {
  predicted: string | null
  corrected: string | null
}

export type ClassificationFeedback = {
  id: string
  userId: string
  inputText: string
  predictedType: ClassificationKind | null
  correctedType: ClassificationKind | null
  predictedCategoryId: string | null
  correctedCategoryId: string | null
  fieldCorrections: Record<string, FieldCorrection>
  createdAt: string
}

export type UserClassificationRule = {
  id: string
  userId: string
  pattern: string
  targetType: ClassificationKind | null
  categoryId: string | null
  weight: number
  createdAt: string
  updatedAt: string
}
