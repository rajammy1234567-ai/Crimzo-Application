const PREFIX = '[AgoraCall]';

/** Dev-only structured logs for live → private call debugging. */
export function logAgoraCall(step: string, detail?: Record<string, unknown>) {
  if (!__DEV__) return;
  if (detail) {
    console.log(PREFIX, step, detail);
  } else {
    console.log(PREFIX, step);
  }
}