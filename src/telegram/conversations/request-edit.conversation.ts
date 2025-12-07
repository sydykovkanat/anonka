import { Injectable } from '@nestjs/common';
import { MessageStatus } from '@prisma/generated';
import { Bot } from 'grammy';
import { MessageService } from '../../message/message.service';
import { UserService } from '../../user/user.service';
import { ConversationData, MyContext, MyConversation } from '../types';

@Injectable()
export class RequestEditConversation {
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

    await ctx.reply('📝 Введите комментарий для редактирования:');

    const commentResponse = await conversation.waitFor('message:text');
    const comment = commentResponse.message.text;

    await conversation.external(() =>
      this.messageService.updateStatus(
        messageId,
        MessageStatus.EDIT_REQUESTED,
        comment,
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
          `✏️ Твоё сообщение в группу требует редактирования.\n\nКомментарий: ${comment}\n\nОтправь исправленную версию через меню.`,
        );
      }
    }

    await ctx.reply('✅ Запрос на редактирование отправлен автору.');
  }
}
