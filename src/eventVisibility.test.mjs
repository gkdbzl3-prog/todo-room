import assert from "node:assert/strict";
import { shouldShowMemberEventName } from "./eventVisibility.js";

assert.equal(
  shouldShowMemberEventName({ isPublic: false }, true),
  false,
  "member panel should hide private event names on my own card"
);

assert.equal(
  shouldShowMemberEventName({ isPublic: true }, true),
  true,
  "member panel should show public event names"
);

console.log("event visibility tests passed");
