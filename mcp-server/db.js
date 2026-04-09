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

  const tunnelPort = Number(process.env.SSH_TUNNEL_PORT) || 33060;
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

      localServer.listen(tunnelPort, '127.0.0.1', async () => {
        try {
          pool = mysql.createPool({
            host: '127.0.0.1',
            port: tunnelPort,
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
