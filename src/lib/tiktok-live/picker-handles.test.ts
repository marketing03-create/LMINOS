import { describe, expect, it } from "vitest";
import { pickerHandles } from "./picker-handles";

// Admin → Users on 3 Nov: marketing.04 and ainn.ira inactive.
const handles = [
  { id: "a", handle: "abangduit.my", streamerInactive: false },
  { id: "b", handle: "adamconsult_", streamerInactive: true },
  { id: "c", handle: "adminain111", streamerInactive: false },
  { id: "d", handle: "ninaconsult_", streamerInactive: true },
  { id: "e", handle: "unassigned", streamerInactive: false },
];

describe("pickerHandles", () => {
  it("hides handles whose streamer is inactive, keeps the rest", () => {
    expect(pickerHandles(handles).map((h) => h.handle)).toEqual([
      "abangduit.my",
      "adminain111",
      "unassigned",
    ]);
  });

  it("keeps the handle the page is already showing", () => {
    expect(pickerHandles(handles, "b").map((h) => h.id)).toEqual(["a", "b", "c", "e"]);
  });
});
