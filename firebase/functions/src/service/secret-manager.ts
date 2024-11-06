import {SecretManagerServiceClient} from "@google-cloud/secret-manager";

export class SecretManager {
  private json: {[key: string]: string | string[]};

  private constructor(json: {[key: string]: string | string[]}) {
    this.json = json;
  }

  public static async setUpAsync(
    secretName: string,
    secretVersion = "latest",
  ): Promise<SecretManager> {
    const client = new SecretManagerServiceClient();
    const name = client.secretVersionPath(
      "observe-notify",
      secretName,
      secretVersion,
    );
    const [version] = await client.accessSecretVersion({name: name});
    const payload = version.payload?.data?.toString();
    if (payload === undefined) {
      throw new Error("cannot set up secret manager");
    }
    const json = JSON.parse(payload) as {[key: string]: string | string[]};
    return new SecretManager(json);
  }

  public get<T>(name: string): T {
    const value = this.json[name];
    if (value === undefined) {
      throw new Error(`${name} not found`);
    }
    return value as T;
  }
}
