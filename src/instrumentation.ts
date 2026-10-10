/**
 * Optional hourly treasurer run inside the server process (set TREASURER_AUTORUN=1).
 * Render's free web service has no cron, so the app schedules itself.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TREASURER_AUTORUN !== "1") return;
  const { runAllActiveCircles } = await import("./lib/treasurer/agent");
  const hour = 60 * 60 * 1000;
  const tick = async () => {
    try {
      const runs = await runAllActiveCircles("cron");
      console.log(`[treasurer] hourly tick: ${runs.length} run(s)`);
    } catch (error) {
      console.error("[treasurer] hourly tick failed", error);
    }
  };
  setTimeout(tick, 2 * 60 * 1000);
  setInterval(tick, hour);
}
