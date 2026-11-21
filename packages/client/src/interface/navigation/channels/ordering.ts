import type { API } from "stoat.js";

export interface OrderedCategory {
  id: string;
  title: string;
  channelIds: string[];
}

export function orderedCategories(
  categories: API.Category[] | undefined,
  knownChannelIds: string[],
): OrderedCategory[] {
  const known = new Set(knownChannelIds);
  const uncategorised = new Set(knownChannelIds);

  const ordered = (categories ?? [])
    .map((category) => {
      for (const id of category.channels) {
        uncategorised.delete(id);
      }

      return {
        id: category.id,
        title: category.title,
        channelIds: category.channels,
      };
    })
    .filter(
      (category) =>
        category.id !== "default" ||
        category.channelIds.some((id) => known.has(id)),
    );

  const uncategorisedIds = [...uncategorised];
  const defaultCategory = ordered.find((category) => category.id === "default");

  if (defaultCategory) {
    defaultCategory.channelIds = [
      ...defaultCategory.channelIds,
      ...uncategorisedIds,
    ];
  } else {
    ordered.unshift({
      id: "default",
      title: "Default",
      channelIds: uncategorisedIds,
    });
  }

  return ordered;
}

export function applyChannelOrdering(
  channelIds: string[],
  visibleIds: string[],
  reorderedIds: string[],
) {
  const newOrdering: string[] = [];
  const visible = new Set(visibleIds);
  const remaining = [...channelIds];

  for (const orderedId of reorderedIds) {
    const index = remaining.indexOf(orderedId);

    if (index === -1) {
      newOrdering.push(orderedId);
      continue;
    }

    const leading = remaining.splice(0, index);

    newOrdering.push(...leading.filter((id) => !visible.has(id)));

    // invariant: remaining[0] === orderedId
    newOrdering.push(remaining.shift()!);

    remaining.unshift(...leading.filter((id) => visible.has(id)));
  }

  return [...newOrdering, ...remaining.filter((id) => !visible.has(id))];
}

/**
 * Categories with one channel moved to the end of another category, or of
 * the uncategorised list ("default"), ready for `server.edit`
 * @param categories The server's categories
 * @param knownChannelIds All of the server's channel ids
 * @param channelId Channel to move
 * @param categoryId Where to move it
 */
export function moveChannelToCategory(
  categories: API.Category[] | undefined,
  knownChannelIds: string[],
  channelId: string,
  categoryId: string,
): API.Category[] {
  return orderedCategories(categories, knownChannelIds).map((category) => {
    const channels = category.channelIds.filter((id) => id !== channelId);
    if (category.id === categoryId) channels.push(channelId);
    return { id: category.id, title: category.title, channels };
  });
}

/**
 * The category a channel is in, "default" if none
 */
export function categoryOf(
  categories: API.Category[] | undefined,
  channelId: string,
) {
  return (
    categories?.find(
      (category) =>
        category.id !== "default" && category.channels.includes(channelId),
    )?.id ?? "default"
  );
}
