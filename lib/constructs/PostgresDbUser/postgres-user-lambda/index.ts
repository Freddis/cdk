import {SecretsManager} from '@aws-sdk/client-secrets-manager';
import {Client} from 'pg';

const secrets = new SecretsManager({region: process.env.AWS_REGION});

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    timestamp: string;
  };
}

export const handler = async (event: Event) => {
  const {RequestType} = event;

  const [masterSecret, appSecret] = await Promise.all([
    secrets.getSecretValue({SecretId: process.env.DB_SECRET_ARN!}),
    secrets.getSecretValue({SecretId: process.env.APP_USER_SECRET_ARN!}),
  ]);

  const master = JSON.parse(masterSecret.SecretString!);
  const appUser = JSON.parse(appSecret.SecretString!);

  const client = new Client({
    host: process.env.DB_ENDPOINT,
    port: 5432,
    user: master.username,
    password: master.password,
    ssl: true,
    database: 'postgres',
  });

  try {
    await client.connect();
    if (RequestType === 'Create' || RequestType === 'Update') {
      const res = await client.query(`SELECT FROM pg_database WHERE datname = '${appUser.database}'`);
      if (!res.rowCount || res.rowCount === 0) {
        await client.query(`CREATE DATABASE ${appUser.database}`);
      }
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${appUser.username}') THEN
            ALTER USER "${appUser.username}" WITH PASSWORD '${appUser.password}';
          ELSE
            CREATE USER "${appUser.username}" WITH PASSWORD '${appUser.password}';
          END IF;
          GRANT ALL PRIVILEGES ON DATABASE ${appUser.database} TO "${appUser.username}";
        END
        $$;
      `);
    } else if (RequestType === 'Delete') {
      try {
        await client.query(`DROP OWNED BY "${appUser.username}"`);
        await client.query(`DROP USER IF EXISTS "${appUser.username}"`);
      } catch {/* empty */}
    }

    return {status: 'SUCCESS'};
  } finally {
    await client.end();
  }
};
