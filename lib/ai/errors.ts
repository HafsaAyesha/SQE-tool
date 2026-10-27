export class AiError extends Error {
  constructor(message: string, public status = 503, public retryAfter?: number) { super(message); this.name='AiError'; }
}
