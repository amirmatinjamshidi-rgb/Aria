/** Unique plugin identity used by the plugin loader */
export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description?: string;
}

/** Generic factory signature used by the plugin loader */
export type PluginFactory<T> = () => T | Promise<T>;
