import type { Client, InputAttributes, SFTPWrapper, Stats } from "ssh2";
import type { FileEntry } from "../core/types.js";

export class LinsshSftpClient {
  private constructor(
    private readonly sftp: SFTPWrapper,
    private readonly owner?: Client
  ) {}

  static open(client: Client, closeClientOnEnd = false): Promise<LinsshSftpClient> {
    return new Promise((resolve, reject) => {
      client.sftp((error, sftp) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(new LinsshSftpClient(sftp, closeClientOnEnd ? client : undefined));
      });
    });
  }

  readdir(path: string): Promise<FileEntry[]> {
    return new Promise((resolve, reject) => {
      this.sftp.readdir(path, (error, entries) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          entries.map((entry) => ({
            filename: entry.filename,
            longname: entry.longname,
            attrs: {
              size: entry.attrs.size,
              mode: entry.attrs.mode,
              uid: entry.attrs.uid,
              gid: entry.attrs.gid,
              atime: entry.attrs.atime,
              mtime: entry.attrs.mtime
            }
          }))
        );
      });
    });
  }

  stat(path: string): Promise<Stats> {
    return new Promise((resolve, reject) => {
      this.sftp.stat(path, (error, stats) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stats);
      });
    });
  }

  upload(localPath: string, remotePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sftp.fastPut(localPath, remotePath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  download(remotePath: string, localPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sftp.fastGet(remotePath, localPath, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  mkdir(path: string, attributes?: InputAttributes): Promise<void> {
    return new Promise((resolve, reject) => {
      const callback = (error: Error | null | undefined) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };

      if (attributes) {
        this.sftp.mkdir(path, attributes, callback);
        return;
      }

      this.sftp.mkdir(path, callback);
    });
  }

  unlink(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sftp.unlink(path, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  end(): void {
    this.sftp.end();
    this.owner?.end();
  }
}
