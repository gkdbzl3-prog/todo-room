import assert from "node:assert/strict";
import {
  getUpdatedAtValue,
  isMemberRecentlyActive,
  MEMBER_PRESENCE_GRACE_MS,
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

// grace는 1주일. 하루만 안 들어와도 카드가 사라지면 안 된다.
{
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  assert.equal(MEMBER_PRESENCE_GRACE_MS, 7 * MS_PER_DAY, "grace must be one week");

  const now = Date.parse("2026-10-06T11:03:00Z");
  const at = (iso) => ({ updatedAt: ts(iso) });

  // 하루끝님이 사라진 그 시점. 19시간 전 활동 → 보여야 한다.
  assert.equal(isMemberRecentlyActive(at("2026-10-05T15:42:25Z"), now), true);
  // 6일 전도 아직 1주일 안쪽.
  assert.equal(isMemberRecentlyActive(at("2026-09-30T11:03:00Z"), now), true);
  // 1주일을 막 넘기면 숨는다.
  assert.equal(isMemberRecentlyActive(at("2026-09-29T11:02:00Z"), now), false);
  // updatedAt이 없으면 근거가 없다.
  assert.equal(isMemberRecentlyActive({}, now), false);
  assert.equal(isMemberRecentlyActive(null, now), false);

  // Firestore Timestamp(toMillis)와 epoch millis도 같은 결과.
  assert.equal(
    isMemberRecentlyActive({ updatedAt: { toMillis: () => now - MS_PER_DAY } }, now),
    true
  );
  assert.equal(isMemberRecentlyActive({ updatedAt: now - 8 * MS_PER_DAY }, now), false);
}

// weekly-only 멤버가 merge를 통과한 뒤에도 grace 판정이 살아 있어야 한다.
// (이게 하루끝님 카드가 사라진 실제 경로다)
{
  const now = Date.parse("2026-10-06T11:03:00Z");
  const [member] = mergeDisplayMembers(
    [],
    [{ id: "u-haru", nickname: "하루끝", todos: [{ id: "w1" }], updatedAt: ts("2026-10-05T15:42:25Z") }]
  );
  assert.equal(
    isMemberRecentlyActive(member, now),
    true,
    "merged weekly-only member must still pass the grace check"
  );
}

console.log("display member merge tests passed");
