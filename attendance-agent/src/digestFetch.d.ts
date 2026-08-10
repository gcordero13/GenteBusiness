declare module "digest-fetch" {
  export default class DigestFetch {
    constructor(user: string, password: string, options?: { algorithm?: string });
    fetch(url: string, options?: RequestInit): Promise<Response>;
  }
}
