import { describe, expect, it } from "vitest";
import { orderedTabIds, parseTabOrder, sortTabs } from "./context-tab-order";

const ALL = ["escalate", "similar", "client", "articles", "notes", "assistant"].map((id) => ({ id }));
const ids = (tabs: { id: string }[]) => tabs.map((tab) => tab.id);

describe("context tab order", () => {
  it("uses the default order when nothing is set", () => {
    expect(ids(sortTabs(ALL, parseTabOrder(undefined)))).toEqual(["client", "assistant", "notes", "escalate", "similar", "articles"]);
  });

  it("puts the listed tabs first and the rest after, in the default order", () => {
    expect(ids(sortTabs(ALL, parseTabOrder("articles, escalate")))).toEqual(["articles", "escalate", "client", "assistant", "notes", "similar"]);
  });

  it("ignores listed ids that are not enabled and unknown ids", () => {
    expect(ids(sortTabs([{ id: "notes" }, { id: "client" }], parseTabOrder("similar,nope,notes")))).toEqual(["notes", "client"]);
  });

  it("numbers all six tabs by the order, listed ones first", () => {
    expect(orderedTabIds(parseTabOrder("articles,client,nope,articles"))).toEqual(["articles", "client", "assistant", "notes", "escalate", "similar"]);
  });
});
