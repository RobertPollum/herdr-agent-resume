import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { summary } from "../mods/agent-resume/summary.js";

const source = (await readFile(new URL("../mods/agent-resume/main.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export default class AgentResume", "return class AgentResume");

function makeView(isCheck, exec) {
  const notices = [], closed = [];
  const Mod = new Function("View", "checking", "exec", "appHome", "props", "notify", "closeOverlay", "summary", source)(
    class {}, () => isCheck, exec, () => "/app", () => ({ overlay: "resume-popup" }),
    notice => notices.push(notice), id => closed.push(id), summary,
  );
  return { view: new Mod(), notices, closed };
}

test("a mod check initializes its display without scheduling or executing a resume", () => {
  const { view, notices, closed } = makeView(true, () => assert.fail("check ran a helper"));
  view.init({}, { spawn: () => assert.fail("check scheduled a resume") });
  assert.equal(view.text, "Looking for agents to resume…");
  assert.deepEqual(notices, []);
  assert.deepEqual(closed, []);
});

test("opening the real popup still resumes once, reports the result and closes", async () => {
  const calls = [];
  const { view, notices, closed } = makeView(false, async (...args) => {
    calls.push(args);
    return { code: 0, stdout: JSON.stringify({ resumed: [], skipped: [] }) };
  });
  let task;
  view.init({}, { spawn: callback => { task = callback({}); } });
  await task;
  assert.deepEqual(calls, [["python3", ["/app/mods/agent-resume/agent_resume.py", "resume"]]]);
  assert.equal(notices.length, 1);
  assert.deepEqual(closed, ["resume-popup"]);
});

test("a failed real resume still reports its error and closes the popup", async () => {
  const { view, notices, closed } = makeView(false, async () => { throw new Error("helper failed"); });
  let task;
  view.init({}, { spawn: callback => { task = callback({}); } });
  await task;
  assert.equal(notices[0].level, "error");
  assert.match(notices[0].body, /helper failed/);
  assert.deepEqual(closed, ["resume-popup"]);
});
