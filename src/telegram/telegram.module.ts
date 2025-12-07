import { Module } from '@nestjs/common';
import { ImportModule } from '../import/import.module';
import { MessageModule } from '../message/message.module';
import { UserModule } from '../user/user.module';
import { RejectWithReasonConversation } from './conversations/reject-with-reason.conversation';
import { ReplyMessageConversation } from './conversations/reply-message.conversation';
import { RequestEditConversation } from './conversations/request-edit.conversation';
import { SendGroupMessageConversation } from './conversations/send-group-message.conversation';
import { SendMessageConversation } from './conversations/send-message.conversation';
import { TelegramAuthService } from './services/telegram-auth.service';
import { TelegramContentService } from './services/telegram-content.service';
import { TelegramMenuService } from './services/telegram-menu.service';
import { TelegramModerationService } from './services/telegram-moderation.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [UserModule, MessageModule, ImportModule],
  providers: [
    // Services
    TelegramService,
    TelegramAuthService,
    TelegramMenuService,
    TelegramContentService,
    TelegramModerationService,
    // Conversations
    SendMessageConversation,
    SendGroupMessageConversation,
    ReplyMessageConversation,
    RejectWithReasonConversation,
    RequestEditConversation,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
