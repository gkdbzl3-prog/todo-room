import { normalizeLabel, parseRoutineNoteParts, recalcRoutineNoteState } from "./routineState.js";

/* ── 미리 세우는 TO-DO → 루틴 detail ──
   루틴 detail은 적는 즉시 오늘 투두로 올라온다. 그래서 "내일 할 설거지"를 루틴에
   미리 적어둘 수가 없다 — 오늘 목록에 끼어버린다. 대신 미리 세우는 TO-DO에
   루틴을 지정해 예약해 두고, 날짜가 바뀌는 순간 그 루틴의 detail로 넣는다.
   그때부터는 기존 detail→투두 경로를 그대로 타므로 체크하면 루틴이 체크된다. */

// 목록에 보일 때만 루틴 이름을 앞에 붙인다. 저장되는 text는 조각뿐이다.
export function formatRoutineTomorrowText(todo) {
  const name = (todo?.routineName || "").trim();
  const text = (todo?.text || "").trim();
  if (!name) return text;
  return `[${name}] ${text}`;
}

/* "[집안일] 설거지"처럼 앞에 대괄호로 루틴 이름을 적으면 그 루틴에 예약한다.
   이름이 어느 루틴과도 안 맞으면 손대지 않는다 — 적은 그대로 평범한 투두가 된다.
   쉬는 중(off)인 루틴은 detail을 넣어도 오늘 목록에 안 뜨므로 대상에서 뺀다. */
export function parseRoutineTomorrowInput(raw, routineItems) {
  const input = (raw || "").trim();
  const match = /^\[([^\]]+)\]\s*(.*)$/.exec(input);
  if (!match) return { text: input };

  const wanted = normalizeLabel(match[1]);
  const rest = match[2].trim();
  if (!wanted || !rest) return { text: input };

  const routine = (Array.isArray(routineItems) ? routineItems : []).find(
    (it) => !it?.off && normalizeLabel(it?.text) === wanted
  );
  if (!routine) return { text: input };

  return { text: rest, routineId: routine.id, routineName: (routine.text || "").trim() };
}

export function splitTomorrowTodos(todos) {
  const plain = [];
  const routineBound = [];
  (Array.isArray(todos) ? todos : []).forEach((todo) => {
    if (todo?.routineId != null && (todo.text || "").trim()) routineBound.push(todo);
    else plain.push(todo);
  });
  return { plain, routineBound };
}

// Firestore를 거치면 id가 숫자로도 문자열로도 돌아와서 === 비교는 조용히 빗나간다.
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

export function applyTomorrowRoutineParts(routineItems, boundTodos) {
  const safeItems = Array.isArray(routineItems) ? routineItems : [];
  const bound = Array.isArray(boundTodos) ? boundTodos : [];
  const leftovers = [];
  if (!bound.length) return { items: safeItems, leftovers, changed: false };

  const pendingByRoutine = new Map();
  bound.forEach((todo) => {
    const target = safeItems.find((it) => sameId(it?.id, todo.routineId));
    // 루틴이 지워졌거나 쉬는 중이면 detail에 넣어도 오늘 목록에 안 뜬다.
    // 예약이 소리 없이 사라지느니 일반 투두로 내보낸다.
    if (!target || target.off) {
      leftovers.push(todo);
      return;
    }
    const key = String(target.id);
    const list = pendingByRoutine.get(key) || [];
    list.push(todo);
    pendingByRoutine.set(key, list);
  });

  if (!pendingByRoutine.size) return { items: safeItems, leftovers, changed: false };

  let changed = false;
  const items = safeItems.map((it) => {
    const pending = pendingByRoutine.get(String(it?.id));
    if (!pending) return it;

    const parts = parseRoutineNoteParts(it);
    const seen = new Set(parts.map(normalizeLabel));
    const ownName = normalizeLabel(it?.text);
    let added = false;

    pending.forEach((todo) => {
      // detail의 구분자는 쉼표다. 예약 텍스트도 같은 규칙으로 쪼갠다.
      (todo.text || "").split(",").forEach((chunk) => {
        const text = chunk.trim();
        const key = normalizeLabel(text);
        if (!key || key === ownName || seen.has(key)) return;
        seen.add(key);
        parts.push(text);
        added = true;
      });
    });

    if (!added) return it;
    changed = true;
    return recalcRoutineNoteState(it, parts);
  });

  return { items: changed ? items : safeItems, leftovers, changed };
}
