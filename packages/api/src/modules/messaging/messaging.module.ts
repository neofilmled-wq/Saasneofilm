import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConversationsController } from './conversations.controller';
import { AdminConversationsController } from './admin-conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagingGateway } from './messaging.gateway';

@Module({
  imports: [AuditModule],
  controllers: [ConversationsController, AdminConversationsController],
  providers: [ConversationsService, MessagingGateway],
  exports: [ConversationsService, MessagingGateway],
})
export class MessagingModule {}
