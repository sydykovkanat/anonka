import { Injectable } from '@nestjs/common';
import { MessageStatus } from '@prisma/generated';
import { Bot } from 'grammy';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { ConversationData, MyContext, MyConversation } from '../types';

@Injectable()
export class RejectWithReasonConversation {
  private bot!: Bot<MyContext>;
  private conversationDataGetter!: (
    chatId: number,
  ) => ConversationData | undefined;

  constructor(
    private messageService: MessageService,
    private userService: UserService,
  ) {}

  setBot(bot: Bot<MyContext>) {
    this.bot = bot;
  }

  setConversationDataGetter(
    getter: (chatId: number) => ConversationData | undefined,
  ) {
    this.conversationDataGetter = getter;
  }

  async run(conversation: MyConversation, ctx: MyContext) {
    const chatId = ctx.chat?.id;
    const messageId = chatId
      ? this.conversationDataGetter(chatId)?.moderateMessageId
      : undefined;

    if (!messageId) {
      await ctx.reply('❌ Ошибка: не найден ID сообщения');
      return;
    }

    await ctx.reply('📝 Введите причину отклонения:');

    const reasonResponse = await conversation.waitFor('message:text');
    const reason = reasonResponse.message.text;

    await conversation.external(() =>
      this.messageService.updateStatus(
        messageId,
        MessageStatus.REJECTED,
        reason,
      ),
    );

    const message = await conversation.external(() =>
      this.messageService.findByIdWithSender(messageId),
    );

    if (message) {
      const sender = await conversation.external(() =>
        this.userService.findByUsername(message.sender.username),
      );
      if (sender) {
        await this.bot.api.sendMessage(
          sender.telegramId.toString(),
          `❌ Ваше сообщение в группу было отклонено.\n\nПричина: ${reason}`,
        );
      }
    }

    await ctx.reply('✅ Сообщение отклонено с причиной.');
  }
}
