import { readFileSync } from 'fs';
import { Client } from 'ssh2';
import mysql from 'mysql2/promise';
import { createServer } from 'net';

let sshClient = null;
let pool = null;
let localServer = null;

export async function initDB() {
  const sshConfig = {
    host: process.env.SSH_HOST,
    port: 22,
    username: process.env.SSH_USER,
    privateKey: readFileSync(process.env.SSH_KEY_PATH),
  };

  const dbPort = Number(process.env.DB_PORT) || 3306;

  return new Promise((resolve, reject) => {
    sshClient = new Client();

    sshClient.on('ready', () => {
      localServer = createServer((sock) => {
        sshClient.forwardOut(
          sock.remoteAddress || '127.0.0.1',
          sock.remotePort || 0,
          process.env.DB_HOST || '127.0.0.1',
          dbPort,
          (err, stream) => {
            if (err) { sock.end(); return; }
            sock.pipe(stream).pipe(sock);
          }
        );
      });

      // 포트 0 = OS가 빈 포트 자동 할당 (다중 세션 충돌 방지)
      localServer.listen(0, '127.0.0.1', async () => {
        const assignedPort = localServer.address().port;
        try {
          pool = mysql.createPool({
            host: '127.0.0.1',
            port: assignedPort,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 5,
            queueLimit: 0,
          });
          const conn = await pool.getConnection();
          conn.release();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });

    sshClient.on('error', reject);
    sshClient.connect(sshConfig);
  });
}

export function getPool() {
  if (!pool) throw new Error('DB not initialized. Call initDB() first.');
  return pool;
}

export async function closeDB() {
  if (pool) { await pool.end(); pool = null; }
  if (localServer) { localServer.close(); localServer = null; }
  if (sshClient) { sshClient.end(); sshClient = null; }
}
