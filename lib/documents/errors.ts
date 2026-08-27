export class IngestError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "IngestError";
  }
}
