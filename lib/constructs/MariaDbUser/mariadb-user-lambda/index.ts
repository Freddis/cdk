import {SecretsManager} from '@aws-sdk/client-secrets-manager';
import {createConnection} from 'mariadb';

const secrets = new SecretsManager({region: process.env.AWS_REGION});

interface Event {
  RequestType: 'Create' | 'Update' | 'Delete';
  ResourceProperties: {
    timestamp: string;
  };
}

export const handler = async (event: Event) => {
  const {RequestType} = event;

  // Fetch master and app user credentials
  const [masterSecret, appSecret] = await Promise.all([
    secrets.getSecretValue({SecretId: process.env.DB_SECRET_ARN!}),
    secrets.getSecretValue({SecretId: process.env.APP_USER_SECRET_ARN!}),
  ]);

  const master: {
    username: string,
    password: string,
  } = JSON.parse(masterSecret.SecretString!);
  const appUser: {
    database: string,
    username: string,
    password: string,
  } = JSON.parse(appSecret.SecretString!);

  const connection = await createConnection({
    host: process.env.DB_ENDPOINT,
    port: 3306,
    user: master.username,
    password: master.password,
  });

  try {
    if (RequestType === 'Create' || RequestType === 'Update') {
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${appUser.database}\``);
      await connection.query(`CREATE USER IF NOT EXISTS '${appUser.username}'@'%' IDENTIFIED BY '${appUser.password}'`);
      await connection.query(`GRANT ALL PRIVILEGES ON \`${appUser.database}\`.* TO '${appUser.username}'@'%'`);
      await connection.query(`ALTER USER '${appUser.username}'@'%' IDENTIFIED BY '${appUser.password}'`);
      await connection.query('FLUSH PRIVILEGES');
    } else if (RequestType === 'Delete') {
      await connection.query(`DROP USER IF EXISTS "${appUser.username}"`);
    }
    return {status: 'SUCCESS'};
  } finally {
    await connection.end();
  }
};
