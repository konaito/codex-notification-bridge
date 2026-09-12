const DEFAULT_LONG_PRESS_MS = 500;

function createLongPressRecognizer({
  delayMs = DEFAULT_LONG_PRESS_MS,
  onLongPress,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  if (typeof onLongPress !== "function") throw new TypeError("onLongPress must be a function");

  let active = false;
  let canceled = false;
  let triggered = false;
  let timer = null;

  function clearTimer() {
    if (timer !== null) {
      clearTimeoutFn(timer);
      timer = null;
    }
  }

  function reset() {
    active = false;
    canceled = false;
    triggered = false;
    clearTimer();
  }

  return {
    handle(event) {
      if (event === "down") {
        reset();
        active = true;
        timer = setTimeoutFn(() => {
          timer = null;
          if (active && !canceled) {
            triggered = true;
            onLongPress();
          }
        }, delayMs);
        return;
      }

      if (event === "cancel") {
        if (active && !triggered) {
          canceled = true;
          clearTimer();
        }
        return;
      }

      if (event === "up") reset();
    },
    cancel: reset,
  };
}

module.exports = { DEFAULT_LONG_PRESS_MS, createLongPressRecognizer };
