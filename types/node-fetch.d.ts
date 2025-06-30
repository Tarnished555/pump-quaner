declare module 'node-fetch' {
  export default function fetch(url: string | Request, init?: RequestInit): Promise<Response>;
  export class Request extends globalThis.Request {}
  export class Response extends globalThis.Response {}
  export class Headers extends globalThis.Headers {}
  export type RequestInfo = string | Request;
  export type RequestInit = {
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit;
    redirect?: RequestRedirect;
    signal?: AbortSignal;
    agent?: any; // 支持代理
    timeout?: number; // 支持超时
    [key: string]: any;
  };
}
