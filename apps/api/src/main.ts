import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = app.get(ConfigService).getOrThrow<number>('PORT');
  await app.listen(port);
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
