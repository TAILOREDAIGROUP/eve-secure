/**
 * Type declarations for modules without bundled types
 */

declare module 'twilio' {
  function twilio(accountSid: string, authToken: string): any;
  export = twilio;
}

declare module '@aws-sdk/client-lambda' {
  export class LambdaClient {
    constructor(config: any);
    send(command: any): Promise<any>;
  }
  export class InvokeCommand {
    constructor(input: any);
  }
}

declare module '@aws-sdk/s3-request-presigner' {
  export function getSignedUrl(client: any, command: any, options?: any): Promise<string>;
}

declare module '@vitejs/plugin-react' {
  const plugin: () => any;
  export default plugin;
}
