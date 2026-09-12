const MAX_THREAD_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 10_000;

function validateQueuePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("入力を確認してください。");
  }

  const thread = typeof payload.thread === "string" ? payload.thread.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";

  if (!thread) throw new Error("対象タスクのUUIDまたは名前を入力してください。");
  if (!message) throw new Error("通知内容を入力してください。");
  if (thread.length > MAX_THREAD_LENGTH) {
    throw new Error(`対象タスクは${MAX_THREAD_LENGTH}文字以内で入力してください。`);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`通知内容は${MAX_MESSAGE_LENGTH}文字以内で入力してください。`);
  }

  return { thread, message };
}

module.exports = { validateQueuePayload };
