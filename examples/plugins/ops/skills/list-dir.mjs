export default {
  name: "list-dir",
  description: "List a remote directory through SFTP.",
  async run(ctx, input) {
    const sftp = await ctx.ssh.sftp(input.profile);
    try {
      return sftp.readdir(input.path ?? ".");
    } finally {
      sftp.end();
    }
  }
};
