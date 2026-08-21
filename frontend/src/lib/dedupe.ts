/**
 * Remove duplicate objects based on their `id`.
 *
 * The first occurrence is preserved.
 *
 * Example:
 *
 * [
 *   { id: 'abc', name: 'A' },
 *   { id: 'abc', name: 'A' },
 *   { id: 'xyz', name: 'B' }
 * ]
 *
 * becomes:
 *
 * [
 *   { id: 'abc', name: 'A' },
 *   { id: 'xyz', name: 'B' }
 * ]
 */
export function uniqueById<
  T extends {
    id: string
  },
>(
  items: T[]
): T[] {
  const seen =
    new Set<string>()

  const uniqueItems: T[] = []

  for (const item of items) {
    if (
      !item ||
      typeof item.id !==
        'string'
    ) {
      continue
    }

    const id =
      item.id.trim()

    if (!id) {
      continue
    }

    if (seen.has(id)) {
      continue
    }

    seen.add(id)

    uniqueItems.push(item)
  }

  return uniqueItems
}