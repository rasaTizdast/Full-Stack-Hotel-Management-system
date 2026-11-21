import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApiApplication } from './common/configure-api-application';
import { resolveApiListenAddress } from './api-listen-address';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApiApplication(app);
  const config = app.get(ConfigService);
  const port = config.getOrThrow<number>('PORT');
  const host = resolveApiListenAddress(config.get<string>('HOST'));
  await app.listen(port, host);
}
void bootstrap().catch((error: unknown) => {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  const configurationDetail =
    error instanceof Error && error.message.includes('DATABASE_URL')
      ? error.message
      : 'Check configuration and service availability.';
  process.stderr.write(`API startup failed (${errorName}): ${configurationDetail}\n`);
  process.exitCode = 1;
});
