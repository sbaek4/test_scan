export interface DlqMessageInput {
  event: unknown;
  error: unknown;
  failedAt?: string;
}

export function makeDlqPayload(input: DlqMessageInput) {
  return {
    failedAt: input.failedAt ?? new Date().toISOString(),
    event: input.event,
    error: String(input.error)
  };
}
