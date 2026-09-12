const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_LONG_PRESS_MS, createLongPressRecognizer } = require("../src/command-long-press");

function fakeTimers() {
  let nextId = 0;
  let pending = new Map();
  return {
    setTimeout(callback, delay) {
      const id = ++nextId;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    run(delay) {
      for (const [id, timer] of pending) {
        if (timer.delay <= delay) {
          pending.delete(id);
          timer.callback();
        }
      }
    },
  };
}

test("uses the platform-standard 500ms long-press duration by default", () => {
  assert.equal(DEFAULT_LONG_PRESS_MS, 500);
});

test("triggers after a complete left-Command hold and release", () => {
  const timers = fakeTimers();
  let triggered = 0;
  const recognizer = createLongPressRecognizer({
    onLongPress: () => { triggered += 1; },
    setTimeoutFn: timers.setTimeout,
    clearTimeoutFn: timers.clearTimeout,
  });

  recognizer.handle("down");
  timers.run(499);
  assert.equal(triggered, 0);
  timers.run(500);
  assert.equal(triggered, 1);
  recognizer.handle("up");
});

test("does not trigger when another key or modifier cancels the hold", () => {
  for (const cancelEvent of ["cancel", "up"]) {
    const timers = fakeTimers();
    let triggered = 0;
    const recognizer = createLongPressRecognizer({
      onLongPress: () => { triggered += 1; },
      setTimeoutFn: timers.setTimeout,
      clearTimeoutFn: timers.clearTimeout,
    });

    recognizer.handle("down");
    if (cancelEvent === "cancel") recognizer.handle("cancel");
    else recognizer.handle("up");
    timers.run(DEFAULT_LONG_PRESS_MS);
    assert.equal(triggered, 0);
  }
});
