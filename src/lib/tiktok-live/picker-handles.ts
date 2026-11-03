/**
 * Which handles the streamer filter dropdowns offer. Pure, so pages and tests
 * share it.
 *
 * A handle whose assigned streamer was set inactive on Admin → Users drops out
 * of the dropdowns — nobody needs to pick a departed streamer any more. Their
 * past lives still count in "All streamers"; only the picker hides them. A
 * handle with no assigned streamer stays. `keepId` keeps the handle a page is
 * already showing, so its own dropdown never goes blank.
 */
export function pickerHandles<T extends { id: string; streamerInactive: boolean }>(
  handles: readonly T[],
  keepId?: string
): T[] {
  return handles.filter((h) => !h.streamerInactive || h.id === keepId);
}
