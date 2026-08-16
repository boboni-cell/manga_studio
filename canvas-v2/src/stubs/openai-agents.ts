// Unreachable from the preview entry; kept so the module graph resolves
// even if a shared module accidentally imports the agent SDK.
export class Agent {}
export class Runner {}
export class RunContext {}
export async function run() {
  throw new Error('Canvas V2 预览模式，Agent 功能未接入。');
}
export type RunState = unknown;
export type RunToolApprovalItem = unknown;
export type ModelRequest = unknown;
export type JsonObjectSchemaNonStrict = unknown;
