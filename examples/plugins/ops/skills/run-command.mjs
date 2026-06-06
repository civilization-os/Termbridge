export default {
  name: "run-command",
  description: "Run a command in a PTY and return the terminal buffer.",
  async run(ctx, input) {
    const session = await ctx.ssh.open(input.profile, input.pty);
    try {
      await session.send({ type: "line", text: input.command ?? "uptime" });
      await session.waitForIdle(input.idleMs ?? 500, input.timeoutMs ?? 10000);
      return {
        visibleText: session.buffer.getVisibleText(),
        scrollbackText: session.buffer.getScrollbackText()
      };
    } finally {
      session.close();
    }
  }
};
