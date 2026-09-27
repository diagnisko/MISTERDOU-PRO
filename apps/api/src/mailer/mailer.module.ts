import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/** Global — injectable partout sans import explicite. */
@Global()
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
