export class HttpQueryError extends Error {
  public statusCode: number;
  public isGraphQLError: boolean;
  public headers?: { [key: string]: string };

  constructor(
    statusCode: number,
    message: string,
    isGraphQLError: boolean = false,
    headers?: { [key: string]: string }
  ) {
    super(message);
    this.name = "HttpQueryError";
    this.statusCode = statusCode;
    this.isGraphQLError = isGraphQLError;
    this.headers = headers;
  }
}
