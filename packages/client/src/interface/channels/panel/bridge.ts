import { Client } from "stoat.js";

import { PanelManifest, parseManifest } from "./manifest";

/**
 * Result of running an action on the bridge
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Client for talking to a homelab panel bridge
 */
export class PanelBridge {
  #baseUrl: string;
  #client: Client;
  #channelId: string;

  /**
   * Construct bridge client
   * @param baseUrl Bridge URL without trailing slash
   * @param client Stoat client, used to authenticate the user to the bridge
   * @param channelId Panel channel
   */
  constructor(baseUrl: string, client: Client, channelId: string) {
    this.#baseUrl = baseUrl;
    this.#client = client;
    this.#channelId = channelId;
  }

  /**
   * Perform a request against the bridge
   * @param path Path beginning with a slash
   * @param init Fetch options
   */
  async #request(path: string, init?: RequestInit): Promise<unknown> {
    const [header, token] = this.#client.authenticationHeader;
    const response = await fetch(this.#baseUrl + path, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        [header]: token,
      },
    });

    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const message =
        (body as { message?: string } | undefined)?.message ??
        `Bridge responded with ${response.status}`;
      throw new Error(message);
    }

    return body;
  }

  /**
   * Fetch the layout for this channel
   */
  async manifest(): Promise<PanelManifest> {
    return parseManifest(
      await this.#request(`/panels/${encodeURIComponent(this.#channelId)}`),
    );
  }

  /**
   * Fetch live data for a status widget
   * @param name Source name
   */
  async source(name: string): Promise<unknown> {
    const body = await this.#request(
      `/sources/${encodeURIComponent(name)}?channel=${encodeURIComponent(this.#channelId)}`,
    );
    return (body as { data?: unknown } | undefined)?.data;
  }

  /**
   * Run an action
   * @param name Action name
   * @param params Action parameters
   */
  async action(
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<ActionResult> {
    const body = (await this.#request(`/actions/${encodeURIComponent(name)}`, {
      method: "POST",
      body: JSON.stringify({ channelId: this.#channelId, params }),
    })) as ActionResult | undefined;

    if (!body?.ok) throw new Error(body?.message ?? "Action failed");
    return body;
  }
}
