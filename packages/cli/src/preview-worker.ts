import { startNativeServer, type NativePreviewOptions } from "./preview-native";
import type { PreviewHandle } from "./preview";

let server: PreviewHandle | undefined;
let stopping: Promise<void> | undefined;
function stop(): Promise<void> {
  return (stopping ??= (async () => {
    await server?.stop();
    process.exit(0);
  })());
}
process.on("disconnect", () => {
  void stop();
});
process.on("SIGTERM", () => {
  void stop();
});
process.on("message", (message) => {
  if (
    message &&
    typeof message === "object" &&
    "type" in message &&
    message.type === "moonshine:stop"
  )
    void stop();
});
try {
  const options = JSON.parse(process.argv[2]!) as NativePreviewOptions;
  server = await startNativeServer(options);
  process.send?.({ type: "moonshine:ready", url: server.url.href });
} catch (error) {
  process.send?.({
    type: "moonshine:error",
    error: error instanceof Error ? error.message : String(error),
  });
  await server?.stop();
  process.exit(1);
}
