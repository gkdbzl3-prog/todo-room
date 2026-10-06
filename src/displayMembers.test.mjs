import assert from "node:assert/strict";
import {
  getUpdatedAtValue,
  mergeDisplayMembers,
} from "./displayMembers.js";

const ts = (iso) => ({ seconds: Math.floor(Date.parse(iso) / 1000) });

// 오늘 daily 문서가 없고 weekly 문서만 있는 멤버. 카드가 보이는지 여부는 24시간
// grace(isRecentlyActive)가 판단하는데, 그 판단은 updatedAt에만 의존한다.
// 여기서 updatedAt을 흘리면 grace가 영구히 false가 되어 어제 활동한 사람도 사라진다.
{
  const weeklyOnly = mergeDisplayMembers(
    [],
    [
      {
        id: "u-haru",
        nickname: "하루끝",
        todos: [{ id: "w1" }, { id: "w2" }, { id: "w3" }],
        updatedAt: ts("2026-10-05T15:42:25Z"),
      },
    ]
  );

  assert.equal(weeklyOnly.length, 1);
  assert.equal(
    getUpdatedAtValue(weeklyOnly[0].updatedAt),
    getUpdatedAtValue(ts("2026-10-05T15:42:25Z")),
    "weekly-only member must keep updatedAt so the 24h grace can see it"
  );
}

// daily와 weekly가 모두 있으면 더 최신인 updatedAt을 남긴다.
{
  const [member] = mergeDisplayMembers(
    [
      {
        id: "u-haru",
        nickname: "하루끝",
        todos: [{ id: "d1" }],
        updatedAt: ts("2026-10-06T01:00:00Z"),
      },
    ],
    [
      {
        id: "u-haru",
        nickname: "하루끝",
        todos: [{ id: "w1" }],
        updatedAt: ts("2026-10-06T09:00:00Z"),
      },
    ]
  );

  assert.equal(
    getUpdatedAtValue(member.updatedAt),
    getUpdatedAtValue(ts("2026-10-06T09:00:00Z")),
    "merged member must keep the fresher updatedAt of the two docs"
  );
}

// 오늘 daily만 있는 멤버는 그대로 updatedAt을 유지한다.
{
  const [member] = mergeDisplayMembers(
    [
      {
        id: "u-me",
        nickname: "날",
        todos: [{ id: "d1" }],
        updatedAt: ts("2026-10-06T10:58:14Z"),
      },
    ],
    []
  );

  assert.equal(
    getUpdatedAtValue(member.updatedAt),
    getUpdatedAtValue(ts("2026-10-06T10:58:14Z")),
    "daily-only member keeps updatedAt"
  );
  assert.deepEqual(member.weeklyTodos, []);
}

console.log("display member merge tests passed");
