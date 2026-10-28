import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { env } from '../config';

async function main(): Promise<void> {
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  const connection = await mysql.createConnection({
    host: env.dbHost,
    port: env.dbPort,
    user: env.dbUser,
    password: env.dbPassword,
    multipleStatements: true,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${env.dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${env.dbName}\``);
    await connection.query(schema);
    console.log(`Migrated database ${env.dbName}`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
