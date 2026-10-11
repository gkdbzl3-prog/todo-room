import assert from "node:assert/strict";
import {
  getTodoCount,
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

// grace는 한 달. 1주일이었을 때 하루끝님이 엿새 접속을 못 한 사이 주가 바뀌며
// 카드가 사라졌다. 며칠 바쁜 사람이 방에서 지워진 것처럼 보이지 않게 넉넉히 둔다.
{
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  assert.equal(MEMBER_PRESENCE_GRACE_MS, 30 * MS_PER_DAY, "grace must be one month");

  const now = Date.parse("2026-10-06T11:03:00Z");
  const at = (iso) => ({ updatedAt: ts(iso) });

  // 하루끝님이 사라진 그 시점. 19시간 전 활동 → 보여야 한다.
  assert.equal(isMemberRecentlyActive(at("2026-10-05T15:42:25Z"), now), true);
  // 예전 기준(1주일)을 넘긴 8일 전도 이제는 보인다.
  assert.equal(isMemberRecentlyActive(at("2026-09-28T11:03:00Z"), now), true);
  // 29일 전도 아직 한 달 안쪽.
  assert.equal(isMemberRecentlyActive(at("2026-09-07T11:03:00Z"), now), true);
  // 한 달을 막 넘기면 숨는다.
  assert.equal(isMemberRecentlyActive(at("2026-09-06T11:02:00Z"), now), false);
  // updatedAt이 없으면 근거가 없다.
  assert.equal(isMemberRecentlyActive({}, now), false);
  assert.equal(isMemberRecentlyActive(null, now), false);

  // Firestore Timestamp(toMillis)와 epoch millis도 같은 결과.
  assert.equal(
    isMemberRecentlyActive({ updatedAt: { toMillis: () => now - MS_PER_DAY } }, now),
    true
  );
  assert.equal(isMemberRecentlyActive({ updatedAt: now - 31 * MS_PER_DAY }, now), false);
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

// ── routines를 세 번째 근거로 ──
// daily도 weekly도 없는 멤버는 아무리 최근에 와 있었어도 merge 결과에 아예
// 들어오지 못해서 grace가 판단할 기회조차 없었다. 하루끝님이 사라진 실제 경로다.
// 루틴 문서는 닉네임당 하나라 사람이 바뀌어도 남아 있고 updatedAt도 있다.
{
  const NOW = Date.parse("2026-10-12T00:00:00Z");

  // 최근에 쓰인 루틴 문서만 있는 멤버 → 카드가 떠야 한다.
  {
    const members = mergeDisplayMembers(
      [],
      [],
      [
        {
          id: "nick_%ED%95%98%EB%A3%A8%EB%81%9D",
          nickname: "하루끝",
          avatar: "🍀",
          items: [{ id: "r1" }],
          updatedAt: ts("2026-10-10T01:00:00Z"),
        },
      ],
      NOW
    );
    assert.equal(members.length, 1, "recent routine doc alone must introduce the member");
    assert.equal(members[0].nickname, "하루끝");
    assert.equal(members[0].avatar, "🍀");
    assert.deepEqual(members[0].todos, []);
    assert.deepEqual(members[0].weeklyTodos, []);
    assert.equal(isMemberRecentlyActive(members[0], NOW), true);
    // id가 uid가 아니라 nick_ 꼴이다. ghost 정리가 이 id로 삭제를 돌면
    // 남의 루틴 문서를 지우므로 반드시 표시가 남아 있어야 한다.
    assert.equal(members[0].fromRoutineOnly, true);
  }

  // grace를 넘긴 루틴 문서는 멤버를 만들지 않는다. 루틴 문서는 영구히 남으므로
  // 존재만으로 띄우면 떠난 사람이 영원히 방에 남는다.
  {
    const members = mergeDisplayMembers(
      [],
      [],
      [{ id: "nick_old", nickname: "옛사람", items: [{ id: "r1" }], updatedAt: ts("2026-08-01T00:00:00Z") }],
      NOW
    );
    assert.deepEqual(members, [], "stale routine doc must not introduce a member");
  }

  // updatedAt이 없는 루틴 문서도 근거가 없다. (구독이 그 필드를 안 담던 시절의 데이터)
  {
    const members = mergeDisplayMembers(
      [],
      [],
      [{ id: "nick_x", nickname: "무근거", items: [{ id: "r1" }] }],
      NOW
    );
    assert.deepEqual(members, [], "routine doc without updatedAt is no evidence");
  }

  // 이미 있는 멤버에게는 더 최근 쪽을 활동 시각으로 준다.
  {
    const [member] = mergeDisplayMembers(
      [{ id: "u-haru", nickname: "하루끝", todos: [], updatedAt: ts("2026-09-20T00:00:00Z") }],
      [],
      [{ id: "nick_haru", nickname: "하루끝", items: [], updatedAt: ts("2026-10-10T01:00:00Z") }],
      NOW
    );
    assert.equal(
      getUpdatedAtValue(member.updatedAt),
      getUpdatedAtValue(ts("2026-10-10T01:00:00Z")),
      "routine updatedAt must win when it is newer"
    );
    // uid로 들어온 멤버는 그대로 uid를 유지해야 한다. ghost 정리가 쓰는 id다.
    assert.equal(member.id, "u-haru");
    assert.notEqual(member.fromRoutineOnly, true);
  }

  // 반대로 루틴이 더 오래됐으면 기존 값을 지킨다.
  {
    const [member] = mergeDisplayMembers(
      [{ id: "u-haru", nickname: "하루끝", todos: [{ id: "t1" }], updatedAt: ts("2026-10-11T00:00:00Z") }],
      [],
      [{ id: "nick_haru", nickname: "하루끝", items: [], updatedAt: ts("2026-10-01T00:00:00Z") }],
      NOW
    );
    assert.equal(
      getUpdatedAtValue(member.updatedAt),
      getUpdatedAtValue(ts("2026-10-11T00:00:00Z")),
      "older routine updatedAt must not overwrite a newer one"
    );
    assert.equal(getTodoCount(member.todos), 1, "routine merge must not drop today's todos");
  }

  // 세 번째 인자를 안 주던 기존 호출은 그대로 동작해야 한다.
  {
    const members = mergeDisplayMembers(
      [{ id: "u1", nickname: "갑", todos: [{ id: "t1" }], updatedAt: ts("2026-10-11T00:00:00Z") }],
      []
    );
    assert.equal(members.length, 1);
  }
}

console.log("display member merge tests passed");
